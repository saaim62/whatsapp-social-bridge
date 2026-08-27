import os
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
import cv2
import numpy as np
from PIL import Image
import io
import traceback
import easyocr

app = FastAPI()

# Initialize EasyOCR reader (loads PyTorch models for English)
# This is much more stable on ARM64 Linux architectures than PaddleOCR
reader = easyocr.Reader(['en'], gpu=False)

@app.post("/detect-text")
async def detect_text(file: UploadFile = File(...)):
    try:
        # 1. Read the uploaded image
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert('RGB')
        img_array = np.array(image)
        
        # 2. Run EasyOCR inference
        result = reader.readtext(img_array)
        
        # 3. Parse results into standardized format
        detected_boxes = []
        for (bbox, text, prob) in result:
            # bbox is [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
            # Ensure coordinates are standard python floats/ints, not numpy types
            polygon = [[float(pt[0]), float(pt[1])] for pt in bbox]
            
            detected_boxes.append({
                "polygon": polygon,
                "text": text,
                "confidence": float(prob),
                "pass": "easyocr"
            })
            
        print(f"[OCR] Returning {len(detected_boxes)} detections")
        return JSONResponse(content={"detections": detected_boxes})
    except Exception as e:
        print("Error during OCR:", e)
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
