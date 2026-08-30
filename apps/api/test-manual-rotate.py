import cv2
import numpy as np
from paddleocr import PaddleOCR

ocr = PaddleOCR(use_angle_cls=True, use_doc_orientation_classify=False, ocr_version='PP-OCRv3', lang='en')

img_path = 'uploads/3BE7C79D7292CE26550A.jpeg'
img_bgr = cv2.imread(img_path)

# Rotate 90 CW
img_rot = cv2.rotate(img_bgr, cv2.ROTATE_90_CLOCKWISE)

result = ocr.ocr(img_rot)

out_img = img_rot.copy()

if result and isinstance(result, list):
    res_obj = result[0]
    texts = res_obj.get('rec_texts', [])
    polys = res_obj.get('dt_polys', []) or res_obj.get('rec_polys', [])
    
    for idx in range(len(texts)):
        txt = texts[idx]
        box = polys[idx]
        pts = np.array(box, np.int32)
        pts = pts.reshape((-1, 1, 2))
        cv2.polylines(out_img, [pts], True, (0, 255, 0), 2)
        cv2.putText(out_img, txt, (pts[0][0][0], pts[0][0][1]), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)

cv2.imwrite('uploads/debug_rot.jpeg', out_img)
print("Saved debug_rot.jpeg")
