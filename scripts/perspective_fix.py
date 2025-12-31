import cv2
import numpy as np
import sys
import os
import json

def apply_geometric_fixes(image_path, output_path, settings):
    img = cv2.imread(image_path)
    if img is None:
        print(f"Error: Could not read image {image_path}")
        return False

    # Convert to BGRA to support transparency
    img = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)

    (h, w) = img.shape[:2]
    
    # 1. Lens Distortion Correction
    k1 = settings.get('lensCorrection', 0) / 1000.0 # Scale for subtlety
    if k1 != 0:
        distCoeff = np.zeros((4,1),np.float64)
        distCoeff[0,0] = k1
        
        # Assume standard identity camera matrix
        # center w/2, h/2
        f = max(w, h) # heuristic focal length
        camMatrix = np.array([[f, 0, w/2], [0, f, h/2], [0, 0, 1]], dtype=np.float32)
        
        # Undistort
        newCamMatrix, roi = cv2.getOptimalNewCameraMatrix(camMatrix, distCoeff, (w,h), 1, (w,h))
        mapx, mapy = cv2.initUndistortRectifyMap(camMatrix, distCoeff, None, newCamMatrix, (w,h), 5)
        img = cv2.remap(img, mapx, mapy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0,0,0,0))

    # 2. Vertical Straightening (if requested automatically)
    auto_straighten = settings.get('autoStraighten', False)
    if auto_straighten:
        gray = cv2.cvtColor(img, cv2.COLOR_BGRA2GRAY)
        edges = cv2.Canny(gray, 50, 150, apertureSize=3)
        lines = cv2.HoughLines(edges, 1, np.pi/180, 200)
        if lines is None: lines = cv2.HoughLines(edges, 1, np.pi/180, 100)
        
        if lines is not None:
            angles = []
            for line in lines:
                rho, theta = line[0]
                angle = np.rad2deg(theta)
                if angle < 30 or angle > 150:
                    if angle > 150: angle -= 180
                    angles.append(angle)
            if angles:
                median_angle = np.median(angles)
                center = (w // 2, h // 2)
                M = cv2.getRotationMatrix2D(center, median_angle, 1.0)
                img = cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=(0,0,0,0))
                print(f"Auto-Straightened by {median_angle:.2f} degrees")

    # 3. Manual Perspective (X/Y Tilt) & Scale/Offset with Center Preservation
    tilt_x = settings.get('perspectiveX', 0)
    tilt_y = settings.get('perspectiveY', 0)
    scale = settings.get('scale', 0)
    rotation = settings.get('rotation', 0)
    offset_x = settings.get('offsetX', 0)
    offset_y = settings.get('offsetY', 0)

    # 3a. Apply Rotation FIRST (if present)
    if rotation != 0:
        center = (w // 2, h // 2)
        # Standard Rotation: Positive = Counter-Clockwise in Math, but CSS/User expect Positive = Clockwise usually?
        # CSS rotate(deg) is Clockwise. OpenCV is Counter-Clockwise.
        # So we should negate rotation to match CSS.
        M_rot = cv2.getRotationMatrix2D(center, -rotation, 1.0)
        img = cv2.warpAffine(img, M_rot, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=(0,0,0,0))

    # Check if we need to apply manual perspective/scale/offset
    if tilt_x != 0 or tilt_y != 0 or scale != 0 or offset_x != 0 or offset_y != 0:
        src_pts = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
        dst_pts = np.float32([[0, 0], [w, 0], [w, h], [0, h]])

        if tilt_y != 0:
            # Vertical Tilt (Keystone) 
            # Match CSS: Positive = Top Narrows (moves back)
            # Reduce factor further to 0.075 (halved from 0.15) to match visual strength
            factor = (tilt_y / 100.0) * 0.075 
            
            dx = w * factor
            
            # Top Narrows: TL moves Right (+), TR moves Left (-)
            dst_pts[0][0] += dx 
            dst_pts[1][0] -= dx
            
            # Bottom Widens: BL moves Left (-), BR moves Right (+)
            dst_pts[3][0] -= dx
            dst_pts[2][0] += dx

        if tilt_x != 0:
            # Horizontal Tilt
            factor_x = (tilt_x / 100.0) * 0.075
            dy = h * factor_x
            
            # Left Widens: TL y Up (-), BL y Down (+)
            dst_pts[0][1] -= dy 
            dst_pts[3][1] += dy 
            
            # Right Narrows: TR y Down (+), BR y Up (-)
            dst_pts[1][1] += dy
            dst_pts[2][1] -= dy

        # --- CENTER PRESERVATION LOGIC ---
        # Instead of fitting BBox (which shrinks image), use Scale ~1.0 (+Scale)
        # and center the result.
        
        # 1. Compute Center of the warped coordinates
        min_x = min(pt[0] for pt in dst_pts)
        max_x = max(pt[0] for pt in dst_pts)
        min_y = min(pt[1] for pt in dst_pts)
        max_y = max(pt[1] for pt in dst_pts)
        
        bbox_cx = (min_x + max_x) / 2
        bbox_cy = (min_y + max_y) / 2
        
        canvas_cx = w / 2
        canvas_cy = h / 2
        
        # 2. Determine Scale (default 1.0 = Center Fill)
        # scale param is percentage (0-100), map to 1.0 - 2.0 range? Or just standard add?
        # User 0-100 slider likely means "Percentage increase".
        scale_factor = 1.0 + (scale / 100.0)
        
        # 3. Determine Offsets (Percentage of Canvas)
        move_x = (offset_x / 100.0) * w
        move_y = (offset_y / 100.0) * h

        # 4. Re-map dst_pts to shift center and apply scale + offset
        for i in range(4):
            Px = dst_pts[i][0] - bbox_cx
            Py = dst_pts[i][1] - bbox_cy
            
            Px *= scale_factor
            Py *= scale_factor
            
            dst_pts[i][0] = Px + canvas_cx + move_x
            dst_pts[i][1] = Py + canvas_cy + move_y

        dst_pts = np.float32(dst_pts)
        M = cv2.getPerspectiveTransform(src_pts, dst_pts)
        img = cv2.warpPerspective(img, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=(0,0,0,0))

    success = cv2.imwrite(output_path, img)
    if not success:
        print(f"Error: Failed to write image to {output_path}")
        return False
        
    return True

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 perspective_fix.py <input_path> <output_path> [settings_json]")
        sys.exit(1)
        
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    settings = {}
    if len(sys.argv) > 3:
        settings = json.loads(sys.argv[3])
    
    success = apply_geometric_fixes(input_path, output_path, settings)
    if not success:
        sys.exit(1)
