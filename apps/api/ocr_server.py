import os
os.environ["FLAGS_use_mkldnn"] = "0"
os.environ["FLAGS_use_xdnn"] = "0"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from paddleocr import PaddleOCR
import cv2
import numpy as np
from PIL import Image
import io
import traceback
import ssl
import urllib3

# Disable SSL verification to fix macOS Baidu OSS download issues
ssl._create_default_https_context = ssl._create_unverified_context
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
import requests
requests.packages.urllib3.disable_warnings()
# Monkey-patch requests to disable SSL verification
old_request = requests.Session.request
def new_request(*args, **kwargs):
    kwargs['verify'] = False
    return old_request(*args, **kwargs)
requests.Session.request = new_request

app = FastAPI()

# Two OCR instances for maximum detection coverage without doc unwarping (which segfaults on ARM64)
ocr_with_orient = PaddleOCR(
    use_angle_cls=True,
    use_doc_orientation_classify=True,
    use_doc_unwarping=False,
    det_limit_side_len=960,
    lang='en'
)
ocr_no_orient = PaddleOCR(
    use_angle_cls=True,
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    det_limit_side_len=960,
    lang='en'
)


def _unrotate_polygon(poly, angle, orig_w, orig_h):
    """
    PaddleOCR's doc preprocessor may rotate the image before detection.
    The returned polygon coordinates are in the ROTATED image space.
    This function maps them back to the ORIGINAL image space.
    """
    if angle == 0:
        return poly

    unrotated = []
    for pt in poly:
        x, y = float(pt[0]), float(pt[1])
        if angle == 90:
            ox = orig_w - 1 - y
            oy = x
        elif angle == 180:
            ox = orig_w - 1 - x
            oy = orig_h - 1 - y
        elif angle == 270:
            ox = y
            oy = orig_h - 1 - x
        else:
            ox, oy = x, y
        unrotated.append([ox, oy])
    return unrotated


@app.post("/detect-text")
async def detect_text(file: UploadFile = File(...)):
    try:
        # 1. Read the uploaded image
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert('RGB')
        orig_w, orig_h = image.size
        img_array = np.array(image)
        
        all_boxes = []
        
        # 2. Run BOTH OCR passes for maximum coverage
        for pass_name, ocr_instance in [("orient", ocr_with_orient), ("no_orient", ocr_no_orient)]:
            try:
                result = ocr_instance.ocr(img_array)
                boxes = _parse_ocr_result(result, orig_w, orig_h, pass_name)
                all_boxes.extend(boxes)
            except Exception as e:
                print(f"[OCR] Pass '{pass_name}' failed: {e}")
        
        # 3. Deduplicate overlapping detections (keep highest confidence)
        deduped = _dedupe_boxes(all_boxes)
        
        print(f"[OCR] Returning {len(deduped)} detections (from {len(all_boxes)} raw)")
        return JSONResponse(content={"detections": deduped})
    except Exception as e:
        print("Error during OCR:", e)
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})


def _parse_ocr_result(result, orig_w, orig_h, pass_name=""):
    """Parse PaddleOCR result into standardized detection boxes."""
    detected_boxes = []
    
    if not result or not isinstance(result, list):
        return detected_boxes
    
    res_obj = result[0]
    
    # New format: OCRResult or dict-like object with 'rec_texts' key
    if hasattr(res_obj, 'get') and res_obj.get('rec_texts') is not None:
        texts = res_obj.get('rec_texts', [])
        scores = res_obj.get('rec_scores', [])
        polys = res_obj.get('dt_polys', []) or res_obj.get('rec_polys', [])
        
        # Detect document rotation angle
        angle = 0
        doc_res = res_obj.get('doc_preprocessor_res')
        if doc_res:
            angle = doc_res.get('angle', 0) if isinstance(doc_res, dict) else getattr(doc_res, 'angle', 0)
        
        print(f"[OCR:{pass_name}] {orig_w}x{orig_h}, angle={angle}, {len(texts)} regions")
        
        for idx in range(len(texts)):
            poly = polys[idx]
            if hasattr(poly, 'tolist'):
                poly = poly.tolist()
            
            # Map coordinates from rotated space back to original image space
            unrotated_poly = _unrotate_polygon(poly, angle, orig_w, orig_h)
            
            detected_boxes.append({
                "text": texts[idx],
                "confidence": float(scores[idx]) if len(scores) > idx else 0,
                "polygon": unrotated_poly
            })
    else:
        # Legacy PaddleOCR 2.x list format
        print(f"[OCR:{pass_name}] Using legacy 2.x parser")
        for line in result:
            if not line:
                continue
            for box_info in line:
                if not box_info:
                    continue
                poly = box_info[0]
                if hasattr(poly, 'tolist'):
                    poly = poly.tolist()
                detected_boxes.append({
                    "text": box_info[1][0],
                    "confidence": float(box_info[1][1]),
                    "polygon": poly
                })
    
    return detected_boxes


def _dedupe_boxes(boxes):
    """Remove overlapping detections, keeping highest confidence."""
    if not boxes:
        return boxes
    
    # Sort by confidence descending
    sorted_boxes = sorted(boxes, key=lambda b: b['confidence'], reverse=True)
    unique = []
    
    for box in sorted_boxes:
        # Get center of this box
        xs = [p[0] for p in box['polygon']]
        ys = [p[1] for p in box['polygon']]
        cx = sum(xs) / len(xs)
        cy = sum(ys) / len(ys)
        
        # Check if any existing box is too close
        is_dupe = False
        for existing in unique:
            exs = [p[0] for p in existing['polygon']]
            eys = [p[1] for p in existing['polygon']]
            ecx = sum(exs) / len(exs)
            ecy = sum(eys) / len(eys)
            
            if abs(cx - ecx) < 50 and abs(cy - ecy) < 50:
                is_dupe = True
                break
        
        if not is_dupe:
            unique.append(box)
    
    return unique


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)

