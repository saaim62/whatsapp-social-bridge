import cv2
import numpy as np
from paddleocr import PaddleOCR
from PIL import Image
ocr = PaddleOCR(use_angle_cls=True, lang='en')
img_path = '/Users/ibtisamasif/.gemini/antigravity-ide/brain/8a3c001b-9ed9-40bf-9c2d-493265e3f92c/.user_uploaded/media_1787286073933.png'
image = Image.open(img_path)
img_array = np.array(image)

# PaddleOCR expects BGR! Let's convert
img_bgr = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)

result = ocr.ocr(img_bgr)

# Draw original polygons on image to see what PaddleOCR actually saw
out_img = img_bgr.copy()

if result and isinstance(result, list):
    res_obj = result[0]
    texts = res_obj.get('rec_texts', [])
    polys = res_obj.get('dt_polys', []) or res_obj.get('rec_polys', [])
    
    for idx in range(len(texts)):
        txt = texts[idx]
        poly = polys[idx]
        pts = np.array(poly, np.int32)
        pts = pts.reshape((-1, 1, 2))
        cv2.polylines(out_img, [pts], True, (0, 255, 0), 2)
        cv2.putText(out_img, txt, (pts[0][0][0], pts[0][0][1]), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        
        # Simulate fixed shift tiny blur
        x_coords = [p[0] for p in poly]
        y_coords = [p[1] for p in poly]
        box_left = min(x_coords)
        box_top = min(y_coords)
        
        # Center of the OCR box
        cx = sum(x_coords) / 4
        cy = sum(y_coords) / 4
        
        # Apply fixed pixel shift (down and right) to hit the actual text
        shift_x = 40
        shift_y = 60
        
        target_cx = cx + shift_x
        target_cy = cy + shift_y
        
        # We want to blur just 2-3 characters. A fixed 70x70 box usually covers about 2 chars
        target_width = 80
        target_height = 80
        
        padded_left = int(target_cx - target_width / 2)
        padded_top = int(target_cy - target_height / 2)
        
        # Constrain to image bounds
        padded_left = max(0, min(img_array.shape[1] - 1, padded_left))
        padded_top = max(0, min(img_array.shape[0] - 1, padded_top))
        padded_right = max(0, min(img_array.shape[1], padded_left + target_width))
        padded_bottom = max(0, min(img_array.shape[0], padded_top + target_height))
        
        # Apply Gaussian Blur to the ROI to simulate sharp(7.5)
        roi = out_img[padded_top:padded_bottom, padded_left:padded_right]
        if roi.size > 0:
            blurred_roi = cv2.GaussianBlur(roi, (31, 31), 7.5)
            out_img[padded_top:padded_bottom, padded_left:padded_right] = blurred_roi
        
        cv2.rectangle(out_img, (padded_left, padded_top), (padded_right, padded_bottom), (0, 0, 255), 2)

cv2.imwrite('uploads/debug_blur.jpeg', out_img)
print("Saved debug_blur.jpeg")
