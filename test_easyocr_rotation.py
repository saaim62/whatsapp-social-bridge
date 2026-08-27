import cv2
import numpy as np

def _unrotate_polygon(poly, angle, orig_w, orig_h):
    if angle == 0:
        return poly
        
    unrotated = []
    for x, y in poly:
        if angle == 90: # image was rotated 90 deg clockwise
            # Unrotate: 90 deg counter-clockwise
            nx = y
            ny = orig_w - x
        elif angle == 180:
            nx = orig_w - x
            ny = orig_h - y
        elif angle == 270: # 270 deg clockwise (or 90 counter-clockwise)
            # Unrotate: 90 deg clockwise
            nx = orig_h - y
            ny = x
        else:
            nx, ny = x, y
        unrotated.append([nx, ny])
    return unrotated

print("Rotation logic ready")
