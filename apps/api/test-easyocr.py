import easyocr
import cv2
import numpy as np

reader = easyocr.Reader(['en'])
img_path = 'uploads/3BE7C79D7292CE26550A.jpeg'
result = reader.readtext(img_path)

img = cv2.imread(img_path)

for (bbox, text, prob) in result:
    print(f"Text: {text}, Prob: {prob}, BBox: {bbox}")
    
    # BBox is [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]
    pts = np.array(bbox, np.int32)
    pts = pts.reshape((-1, 1, 2))
    cv2.polylines(img, [pts], True, (0, 255, 0), 2)
    cv2.putText(img, text, (pts[0][0][0], pts[0][0][1] - 10), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)

cv2.imwrite('uploads/debug_easyocr.jpeg', img)
print("Saved debug_easyocr.jpeg")
