from paddleocr import PaddleOCR
import numpy as np
from PIL import Image, ImageDraw
import sys

ocr = PaddleOCR(use_angle_cls=True, lang='en', det_limit_side_len=960)
img = Image.open('/Users/ibtisamasif/.gemini/antigravity-ide/brain/84b3ed64-5554-4037-aecf-4e019f5de826/.user_uploaded/media_1787319391981.png').convert('RGB')
result = ocr.ocr(np.array(img))

draw = ImageDraw.Draw(img)
for line in result:
    if not line: continue
    for box_info in line:
        polygon = box_info[0]
        text = box_info[1][0]
        pts = [(p[0], p[1]) for p in polygon]
        draw.polygon(pts, outline="red", width=3)
        draw.text((pts[0][0], pts[0][1]), text, fill="blue")

img.save('/Users/ibtisamasif/.gemini/antigravity-ide/brain/84b3ed64-5554-4037-aecf-4e019f5de826/ocr_test_out.png')
print("Done")
