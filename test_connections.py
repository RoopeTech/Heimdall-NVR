import sys
import os
import time

# Add backend directory to sys.path
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
sys.path.append(backend_dir)

import database
import camera_manager
import cv2

print("=== NVR Camera Connection Tester ===")
database.init_db()
cameras = database.get_cameras()

if not cameras:
    print("No cameras found in the database.")
    sys.exit(0)

print(f"Found {len(cameras)} camera(s) in the database.\n")

for cam in cameras:
    cid = cam['id']
    name = cam['name']
    sub_url = cam['sub_url']
    user = cam.get('rtsp_user')
    pwd = cam.get('rtsp_pass')
    is_mock = sub_url.startswith("mock://")
    
    print(f"Testing Camera ID {cid}: '{name}'")
    print(f"  Sub-stream URL: {sub_url}")
    print(f"  Credentials: User='{user}', Password={'[SET]' if pwd else '[NOT SET]'}")
    
    if is_mock:
        print("  Mock camera detected. Skipping RTSP test.")
        print("-" * 40)
        continue
        
    auth_sub_url = camera_manager.inject_credentials(sub_url, user, pwd)
    
    start_time = time.time()
    print("  Connecting to RTSP stream...")
    cap = cv2.VideoCapture(auth_sub_url)
    
    if not cap.isOpened():
        print(f"  [ERROR] Failed to open RTSP stream (took {time.time() - start_time:.2f}s).")
    else:
        print(f"  Successfully opened stream in {time.time() - start_time:.2f}s. Reading first frame...")
        read_start = time.time()
        ret, frame = cap.read()
        if ret and frame is not None:
            print(f"  [SUCCESS] Read frame successfully in {time.time() - read_start:.2f}s! Dimensions: {frame.shape[1]}x{frame.shape[0]}")
        else:
            print(f"  [ERROR] Stream opened, but failed to read a frame (took {time.time() - read_start:.2f}s).")
        cap.release()
        
    print("-" * 40)
