import os
os.environ["FLAGS_use_mkldnn"] = "0"
os.environ["FLAGS_use_xdnn"] = "0"
os.environ["OMP_NUM_THREADS"] = "1"

from paddleocr import PaddleOCR
import numpy as np
from PIL import Image
import urllib.request
import io

print("Initializing PaddleOCR...")
# NO angle classification, NO doc unwarping
ocr = PaddleOCR(use_angle_cls=False, use_doc_orientation_classify=False, use_doc_unwarping=False, lang='en')
print("PaddleOCR initialized!")

url = "https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/release/2.7/doc/imgs_en/img_12.jpg"
req = urllib.request.urlopen(url)
arr = np.asarray(bytearray(req.read()), dtype=np.uint8)
import cv2
img = cv2.imdecode(arr, -1)

print("Running OCR inference...")
result = ocr.ocr(img)
print("Inference successful!")
print(result)
