def _unrotate_polygon(poly, angle_ccw, orig_w, orig_h):
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

print(_unrotate_polygon([[0,0]], 90, 100, 200)) # Expected: CCW 90 of (0,0) in rotated image (size 200x100) -> unrotated to original (100x200)
