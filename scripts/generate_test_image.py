import cv2
import numpy as np
import sys

# Create a black image
img = np.zeros((512, 512, 3), np.uint8)

# Draw a diagonal line
cv2.line(img, (0, 0), (511, 511), (255, 0, 0), 5)

path = '/Users/murvinlai/Documents/projects/realty-photo-enhancement/public/uploads/test_valid.png'
cv2.imwrite(path, img)
print(f"Created {path}")
