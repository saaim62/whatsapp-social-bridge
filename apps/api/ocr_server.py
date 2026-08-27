import os
import platform
import argparse
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
import numpy as np
from PIL import Image
import io
import traceback
import threading

app = FastAPI()

is_mac = platform.system() == 'Darwin'
backend = 'easy'

if is_mac:
    try:
        from paddleocr import PaddleOCR
        print("[OCR Server] Running on macOS. Initializing PaddleOCR...")
        reader = PaddleOCR(use_textline_orientation=True, lang='en')
        backend = 'paddle'
        print("[OCR Server] PaddleOCR initialized successfully!")
    except ImportError:
        import easyocr
        print("[OCR Server] PaddleOCR not installed on Mac. Falling back to EasyOCR...")
        reader = easyocr.Reader(['en'], gpu=False)
else:
    import easyocr
    print("[OCR Server] Running on Linux (ARM64). Initializing EasyOCR...")
    reader = easyocr.Reader(['en'], gpu=False)
    print("[OCR Server] EasyOCR initialized successfully!")

ocr_lock = threading.Lock()

def _unrotate_polygon(poly, angle_ccw, orig_w, orig_h):
    if angle_ccw == 0:
        return poly
    unrotated = []
    for pt in poly:
        X, Y = float(pt[0]), float(pt[1])
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
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert('RGB')
        orig_w, orig_h = image.size
        
        all_boxes = []
        
        # Scan 4 rotations to ensure we catch text at any angle/orientation
        for angle_ccw in [0, 90, 180, 270]:
            if angle_ccw == 0:
                rotated_img = image
            else:
                rotated_img = image.rotate(angle_ccw, expand=True)
                
            img_np = np.array(rotated_img)
            
            with ocr_lock:
                if backend == 'easy':
                    raw_results = reader.readtext(img_np, text_threshold=0.5, low_text=0.3, mag_ratio=1.5)
                    results = raw_results
                else:
                    res = reader.ocr(img_np)
                    results = []
                    if res and isinstance(res, list):
                        if len(res) > 0 and isinstance(res[0], dict):
                            page = res[0]
                            texts = page.get('rec_texts', [])
                            scores = page.get('rec_scores', [])
                            polys = page.get('dt_polys', [])
                            for i in range(len(texts)):
                                if i < len(polys):
                                    bbox = polys[i].tolist() if hasattr(polys[i], 'tolist') else polys[i]
                                    text = texts[i]
                                    prob = scores[i] if i < len(scores) else 1.0
                                    results.append((bbox, text, prob))
                        elif res[0]:
                            for line in res[0]:
                                bbox = line[0]
                                text = line[1][0]
                                prob = line[1][1]
                                results.append((bbox, text, prob))
            
            for bbox, text, prob in results:
                if not text or not text.strip():
                    continue
                # bbox from EasyOCR/PaddleOCR is a 4-point polygon
                poly = [[float(pt[0]), float(pt[1])] for pt in bbox]
                unrotated_poly = _unrotate_polygon(poly, angle_ccw, orig_w, orig_h)
                
                all_boxes.append({
                    "polygon": unrotated_poly,
                    "text": text.strip(),
                    "confidence": float(prob),
                    "pass": f"{backend}_{angle_ccw}"
                })
        
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
    sorted_boxes = sorted(boxes, key=lambda b: b["confidence"], reverse=True)
    deduped = []
    for box in sorted_boxes:
        is_duplicate = False
        box_center = _get_center(box["polygon"])
        for keep_box in deduped:
            keep_center = _get_center(keep_box["polygon"])
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
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8000)))
    args = parser.parse_args()
    
    print(f"[OCR Server] Starting on port {args.port}")
    uvicorn.run(app, host="127.0.0.1", port=args.port)
