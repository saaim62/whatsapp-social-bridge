import numpy as np
from paddleocr import PaddleOCR
reader = PaddleOCR(use_textline_orientation=True, lang='en')
img = np.zeros((100, 100, 3), dtype=np.uint8)
res = reader.ocr(img)
print("Output:", res)
