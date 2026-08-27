import os
os.environ["FLAGS_use_mkldnn"] = "0"
os.environ["FLAGS_use_xdnn"] = "0"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from paddleocr import PaddleOCR
import numpy as np
from PIL import Image
import io
import traceback
import ssl
import urllib3

# Disable SSL verification to fix macOS Baidu OSS download issues if any
ssl._create_default_https_context = ssl._create_unverified_context
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
import requests
requests.packages.urllib3.disable_warnings()

app = FastAPI()

# VERY IMPORTANT FOR ARM64 (Oracle Cloud):
# We MUST set use_angle_cls=False and use_doc_unwarping=False. 
# Enabling them causes a core dump (SIGSEGV) deep in the C++ execution engine on ARM64.
# We will manually handle angle rotation below instead.
ocr_instance = PaddleOCR(
    ocr_version='PP-OCRv4',
    lang='en'
)

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

def _parse_paddle_result(result, angle_ccw, orig_w, orig_h):
    detected_boxes = []
    if not result or not isinstance(result, list):
        return detected_boxes
        
    res_obj = result[0]
    if res_obj is None:
        return detected_boxes
        
    # Handle PaddleX structure (v2.7/v3)
    if hasattr(res_obj, 'get') and res_obj.get('rec_texts') is not None:
        texts = res_obj.get('rec_texts', [])
        scores = res_obj.get('rec_scores', [])
        polys = res_obj.get('dt_polys', []) or res_obj.get('rec_polys', [])
        
        for i in range(len(texts)):
            poly = polys[i]
            unrotated_poly = _unrotate_polygon(poly, angle_ccw, orig_w, orig_h)
            detected_boxes.append({
                "polygon": unrotated_poly,
                "text": texts[i],
                "confidence": float(scores[i]),
                "pass": f"paddle_{angle_ccw}"
            })
    else:
        # Fallback for standard list-of-lists PaddleOCR format
        for line in res_obj:
            if not line or len(line) < 2:
                continue
            box = line[0]  
            text_tuple = line[1]
            if len(text_tuple) < 2:
                continue
                
            text = text_tuple[0]
            confidence = float(text_tuple[1])
            unrotated_poly = _unrotate_polygon(box, angle_ccw, orig_w, orig_h)
            
            detected_boxes.append({
                "polygon": unrotated_poly,
                "text": text,
                "confidence": confidence,
                "pass": f"paddle_{angle_ccw}"
            })
            
    return detected_boxes

import threading
ocr_lock = threading.Lock()

@app.post("/detect-text")
async def detect_text(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert('RGB')
        orig_w, orig_h = image.size
        
        all_boxes = []
        
        # Manually scan 4 rotations so we don't need use_angle_cls (which crashes on ARM64)
        for angle_ccw in [0, 90, 180, 270]:
            if angle_ccw == 0:
                rotated_img = image
            else:
                rotated_img = image.rotate(angle_ccw, expand=True)
                
            img_array = np.array(rotated_img)
            
            with ocr_lock:
                result = ocr_instance.ocr(img_array)
            
            boxes = _parse_paddle_result(result, angle_ccw, orig_w, orig_h)
            all_boxes.extend(boxes)
        
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
    uvicorn.run(app, host="127.0.0.1", port=8000)
