import os
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
import numpy as np
from PIL import Image
import io
import traceback
import easyocr

app = FastAPI()

# Initialize EasyOCR reader
# Much more stable on ARM64 Linux architectures than PaddleOCR
reader = easyocr.Reader(['en'], gpu=False)

def _unrotate_polygon(poly, angle_ccw, orig_w, orig_h):
    """
    poly: list of [X, Y] points in the rotated image.
    angle_ccw: angle by which the original image was rotated counter-clockwise.
    orig_w, orig_h: dimensions of the original unrotated image.
    Returns: list of [x, y] points mapped back to the original unrotated image.
    """
    if angle_ccw == 0:
        return poly
        
    unrotated = []
    for X, Y in poly:
        if angle_ccw == 90:
            x = orig_w - Y
            y = X
        elif angle_ccw == 180:
            x = orig_w - X
            y = orig_h - Y
        elif angle_ccw == 270:
            x = Y
            y = orig_h - X
        else:
            x, y = X, Y
        unrotated.append([x, y])
    return unrotated

@app.post("/detect-text")
async def detect_text(file: UploadFile = File(...)):
    try:
        # 1. Read the uploaded image
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert('RGB')
        orig_w, orig_h = image.size
        
        all_boxes = []
        
        # 2. Run EasyOCR inference at 4 different rotations to match PaddleOCR's orientation classification!
        for angle_ccw in [0, 90, 180, 270]:
            if angle_ccw == 0:
                rotated_img = image
            else:
                rotated_img = image.rotate(angle_ccw, expand=True)
                
            img_array = np.array(rotated_img)
            result = reader.readtext(img_array)
            
            for (bbox, text, prob) in result:
                polygon = [[float(pt[0]), float(pt[1])] for pt in bbox]
                unrotated_poly = _unrotate_polygon(polygon, angle_ccw, orig_w, orig_h)
                
                all_boxes.append({
                    "polygon": unrotated_poly,
                    "text": text,
                    "confidence": float(prob),
                    "pass": f"easyocr_{angle_ccw}"
                })
        
        # 3. Deduplicate overlapping detections (keep highest confidence)
        deduped = _dedupe_boxes(all_boxes)
        
        print(f"[OCR] Returning {len(deduped)} detections (from {len(all_boxes)} raw)")
        return JSONResponse(content={"detections": deduped})
    except Exception as e:
        print("Error during OCR:", e)
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})

def _dedupe_boxes(boxes):
    if not boxes:
        return []
    # Sort by confidence descending
    sorted_boxes = sorted(boxes, key=lambda b: b["confidence"], reverse=True)
    deduped = []
    
    for box in sorted_boxes:
        is_duplicate = False
        box_center = _get_center(box["polygon"])
        for keep_box in deduped:
            keep_center = _get_center(keep_box["polygon"])
            # Simple distance threshold
            dist = ((box_center[0] - keep_center[0])**2 + (box_center[1] - keep_center[1])**2)**0.5
            if dist < 40: 
                is_duplicate = True
                break
        if not is_duplicate:
            deduped.append(box)
    return deduped

def _get_center(polygon):
    xs = [p[0] for p in polygon]
    ys = [p[1] for p in polygon]
    return (sum(xs)/len(xs), sum(ys)/len(ys))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
