import os
import platform
import argparse
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
import numpy as np
from PIL import Image, ImageOps
import io
import traceback
import threading

app = FastAPI()

is_mac = platform.system() == 'Darwin'
backend = 'easy'

ocr_with_orient = None
ocr_no_orient = None

if is_mac:
    try:
        from paddleocr import PaddleOCR
        print("[OCR Server] Running on macOS. Initializing PaddleOCR...")
        # Two OCR instances for maximum detection coverage:
        # 1. With doc orientation detection — catches rotated/angled text
        # 2. Without doc orientation — catches normally-oriented text that
        #    the orientation detector might miss
        ocr_with_orient = PaddleOCR(
            use_textline_orientation=True,
            det_limit_side_len=960,
            lang='en'
        )
        ocr_no_orient = PaddleOCR(
            use_textline_orientation=True,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            det_limit_side_len=960,
            lang='en'
        )
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


def _unrotate_polygon_manual(poly, angle_ccw, orig_w, orig_h):
    """For EasyOCR manual 4-pass rotation scanning."""
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


def _parse_paddle_result(result, orig_w, orig_h, pass_name=""):
    """Parse PaddleOCR result into standardized detection boxes."""
    detected_boxes = []

    if not result or not isinstance(result, list):
        return detected_boxes

    res_obj = result[0]

    # New format: dict with 'rec_texts' key
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
    elif res_obj:
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


@app.post("/detect-text")
async def detect_text(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert('RGB')
        orig_w, orig_h = image.size
        img_array = np.array(image)

        all_boxes = []

        if backend == 'paddle':
            # PaddleOCR: run BOTH OCR passes for maximum coverage
            for pass_name, ocr_instance in [("orient", ocr_with_orient), ("no_orient", ocr_no_orient)]:
                try:
                    with ocr_lock:
                        result = ocr_instance.ocr(img_array)
                    boxes = _parse_paddle_result(result, orig_w, orig_h, pass_name)
                    all_boxes.extend(boxes)
                except Exception as e:
                    print(f"[OCR] Pass '{pass_name}' failed: {e}")
        else:
            # EasyOCR: use 4-pass manual rotation scanning
            # Scale down large images for speed
            max_dim = 1024
            scale_factor = 1.0
            scan_image = image
            if orig_w > max_dim or orig_h > max_dim:
                scale_factor = max_dim / max(orig_w, orig_h)
                new_w = int(orig_w * scale_factor)
                new_h = int(orig_h * scale_factor)
                scan_image = image.resize((new_w, new_h), Image.LANCZOS)

            for angle_ccw in [0, 90, 180, 270]:
                if angle_ccw == 0:
                    rotated_img = scan_image
                else:
                    rotated_img = scan_image.rotate(angle_ccw, expand=True)

                img_np = np.array(rotated_img)

                with ocr_lock:
                    results = reader.readtext(img_np, text_threshold=0.5, low_text=0.3, mag_ratio=1.5)

                scaled_w, scaled_h = scan_image.size
                for bbox, text, prob in results:
                    if not text or not text.strip():
                        continue
                    poly = [[float(pt[0]), float(pt[1])] for pt in bbox]
                    unrotated_poly = _unrotate_polygon_manual(poly, angle_ccw, scaled_w, scaled_h)
                    final_poly = [[pt[0] / scale_factor, pt[1] / scale_factor] for pt in unrotated_poly]

                    all_boxes.append({
                        "polygon": final_poly,
                        "text": text.strip(),
                        "confidence": float(prob),
                        "pass": f"easyocr_{angle_ccw}"
                    })

        # Deduplicate overlapping detections
        deduped = _dedupe_boxes(all_boxes)
        print(f"[OCR] Returning {len(deduped)} detections (from {len(all_boxes)} raw)")
        return JSONResponse(content={"detections": deduped})
    except Exception as e:
        print("Error during OCR:", e)
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})


def _dedupe_boxes(boxes):
    """Remove overlapping detections, keeping highest confidence."""
    if not boxes:
        return boxes
    sorted_boxes = sorted(boxes, key=lambda b: b['confidence'], reverse=True)
    unique = []
    for box in sorted_boxes:
        xs = [p[0] for p in box['polygon']]
        ys = [p[1] for p in box['polygon']]
        cx = sum(xs) / len(xs)
        cy = sum(ys) / len(ys)
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
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8000)))
    args = parser.parse_args()

    print(f"[OCR Server] Starting on port {args.port}")
    uvicorn.run(app, host="127.0.0.1", port=args.port)
