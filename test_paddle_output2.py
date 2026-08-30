import numpy as np
from PIL import Image, ImageDraw
from paddleocr import PaddleOCR
reader = PaddleOCR(use_textline_orientation=True, lang='en')
img = Image.new('RGB', (200, 100), color = (73, 109, 137))
d = ImageDraw.Draw(img)
d.text((10,10), "Hello World", fill=(255,255,0))
res = reader.ocr(np.array(img))
for page in res:
    print("Keys:", page.keys())
    print("rec_texts:", page.get('rec_texts', []))
    print("dt_polys:", page.get('dt_polys', []))
    print("rec_polys:", page.get('rec_polys', []))
