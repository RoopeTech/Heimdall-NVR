import cv2
import numpy as np
import threading
import time
import subprocess
import os
import signal
from datetime import datetime
import database
import notifications

# Force OpenCV's FFmpeg backend to use TCP transport and set a 5-second connection/read timeout
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|stimeout;5000000"

# Directory for recordings
RECORDINGS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "recordings")
os.makedirs(RECORDINGS_DIR, exist_ok=True)

class MockCapture:
    """
    Generates a simulated camera feed that reacts to PTZ and simulates motion.
    """
    def __init__(self, name="Mock Camera", osd_enabled=True):
        self.name = name
        self.osd_enabled = osd_enabled
        self.width = 1280
        self.height = 720
        
        # PTZ state
        self.pan = 0.0   # -1.0 to 1.0
        self.tilt = 0.0  # -1.0 to 1.0
        self.zoom = 1.0  # 1.0 to 3.0
        
        # Target PTZ state (for smooth interpolation)
        self.target_pan = 0.0
        self.target_tilt = 0.0
        self.target_zoom = 1.0
        
        # Simulation background (larger than viewport)
        self.bg_w = 2560
        self.bg_h = 1440
        self.bg = np.zeros((self.bg_h, self.bg_w, 3), dtype=np.uint8)
        self._generate_background()
        
        # Intruder (bouncing target)
        self.intruder_x = self.bg_w // 2
        self.intruder_y = self.bg_h // 2
        self.intruder_dx = 15
        self.intruder_dy = 10
        self.intruder_radius = 40
        self.enable_motion_sim = True
        
        self.last_update = time.time()
        
    def _generate_background(self):
        # Create a simulated indoor scene
        # Floor (gray)
        cv2.rectangle(self.bg, (0, 900), (self.bg_w, self.bg_h), (80, 80, 80), -1)
        # Walls (dark blue/gray)
        cv2.rectangle(self.bg, (0, 0), (self.bg_w, 900), (120, 100, 80), -1)
        # Ceiling (light gray)
        cv2.rectangle(self.bg, (0, 0), (self.bg_w, 300), (180, 180, 180), -1)
        
        # Draw some permanent objects
        # Door
        cv2.rectangle(self.bg, (300, 500), (500, 900), (40, 50, 70), -1)
        cv2.rectangle(self.bg, (320, 700), (340, 720), (50, 200, 200), -1) # handle
        
        # Window
        cv2.rectangle(self.bg, (1000, 400), (1400, 700), (200, 220, 240), -1)
        cv2.rectangle(self.bg, (1000, 400), (1400, 700), (50, 50, 50), 4) # frame
        cv2.line(self.bg, (1200, 400), (1200, 700), (50, 50, 50), 2)
        cv2.line(self.bg, (1000, 550), (1400, 550), (50, 50, 50), 2)
        
        # Large Table
        cv2.rectangle(self.bg, (1700, 750), (2200, 850), (30, 60, 120), -1) # top
        cv2.rectangle(self.bg, (1720, 850), (1750, 950), (20, 40, 80), -1) # leg left
        cv2.rectangle(self.bg, (2150, 850), (2180, 950), (20, 40, 80), -1) # leg right
        
        # Grid lines for perspective/panning feel
        for i in range(0, self.bg_w, 200):
            cv2.line(self.bg, (i, 0), (i, self.bg_h), (140, 120, 100), 1)
        for j in range(0, self.bg_h, 150):
            cv2.line(self.bg, (0, j), (self.bg_w, j), (140, 120, 100), 1)
            
    def update_ptz(self, pan, tilt, zoom):
        self.target_pan = max(-1.0, min(1.0, pan))
        self.target_tilt = max(-1.0, min(1.0, tilt))
        self.target_zoom = max(1.0, min(3.0, zoom))

    def read(self):
        now = time.time()
        dt = now - self.last_update
        self.last_update = now
        
        # Smoothly interpolate PTZ position
        self.pan += (self.target_pan - self.pan) * dt * 5.0
        self.tilt += (self.target_tilt - self.tilt) * dt * 5.0
        self.zoom += (self.target_zoom - self.zoom) * dt * 5.0
        
        # Update intruder location
        if self.enable_motion_sim:
            self.intruder_x += int(self.intruder_dx * dt * 30)
            self.intruder_y += int(self.intruder_dy * dt * 30)
            
            # Bound check & bounce
            left_bound = 100
            right_bound = self.bg_w - 100
            top_bound = 350
            bottom_bound = self.bg_h - 100
            
            if self.intruder_x < left_bound or self.intruder_x > right_bound:
                self.intruder_dx *= -1
                self.intruder_x = max(left_bound, min(right_bound, self.intruder_x))
            if self.intruder_y < top_bound or self.intruder_y > bottom_bound:
                self.intruder_dy *= -1
                self.intruder_y = max(top_bound, min(bottom_bound, self.intruder_y))
        
        # Create canvas copy
        frame_canvas = self.bg.copy()
        
        # Draw simulated intruder on background
        if self.enable_motion_sim:
            # Draw a glowing red security guard/ball intruder
            cv2.circle(frame_canvas, (self.intruder_x, self.intruder_y), self.intruder_radius, (0, 0, 255), -1)
            cv2.circle(frame_canvas, (self.intruder_x, self.intruder_y), self.intruder_radius + 5, (0, 100, 255), 2)
            cv2.putText(frame_canvas, "INTRUDER", (self.intruder_x - 45, self.intruder_y - 50),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
            
        # Calculate cropping rectangle based on PTZ
        # Center of scene is (bg_w//2, bg_h//2)
        # Pan offset: up to 600 pixels left/right
        # Tilt offset: up to 300 pixels up/down
        center_x = self.bg_w // 2 + int(self.pan * 600)
        center_y = self.bg_h // 2 - int(self.tilt * 300) # tilt up subtracts from y
        
        # Viewport size gets smaller as zoom increases
        crop_w = int(self.width / self.zoom)
        crop_h = int(self.height / self.zoom)
        
        x1 = max(0, center_x - crop_w // 2)
        y1 = max(0, center_y - crop_h // 2)
        x2 = min(self.bg_w, x1 + crop_w)
        y2 = min(self.bg_h, y1 + crop_h)
        
        # Extract viewport
        viewport = frame_canvas[y1:y2, x1:x2]
        
        # Resize back to target width/height
        frame = cv2.resize(viewport, (self.width, self.height))
        
        # Draw camera HUD
        if self.osd_enabled:
            time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
            cv2.putText(frame, f"{self.name} | LIVE", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
            cv2.putText(frame, time_str, (self.width - 320, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        
        ptz_info = f"P: {self.pan:.2f} T: {self.tilt:.2f} Z: {self.zoom:.2f}"
        cv2.putText(frame, ptz_info, (20, self.height - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 2)
        
        # Draw crosshair in center
        cv2.drawMarker(frame, (self.width//2, self.height//2), (0, 255, 0, 100), cv2.MARKER_CROSS, 20, 1)
        
        return True, frame

    def release(self):
        pass

def inject_credentials(url, username, password):
    if not username or not password:
        return url
    if url.startswith("rtsp://"):
        import urllib.parse
        encoded_user = urllib.parse.quote_plus(username)
        encoded_pass = urllib.parse.quote_plus(password)
        raw_url = url[7:] # strip rtsp://
        if "@" in raw_url:
            return url # Already has credentials in URL
        return f"rtsp://{encoded_user}:{encoded_pass}@{raw_url}"
    return url

class ImageUrlThread(threading.Thread):
    """
    Periodically fetches a remote image or GIF URL and serves it as a camera feed.
    No motion detection, PTZ, or recording — display-only.
    """
    def __init__(self, camera_info):
        super().__init__()
        self.daemon = True
        self.camera_id = camera_info['id']
        self.name = camera_info['name']
        self.image_url = camera_info.get('image_url', '')
        self.refresh_interval = camera_info.get('image_refresh_interval', 3600)

        self.running = True
        self.latest_jpeg_bytes = None
        self.latest_hq_jpeg_bytes = None
        self.latest_low_jpeg_bytes = None
        self.latest_raw_bytes = None
        self.latest_content_type = 'image/jpeg'
        self.is_mock = False
        self.is_motion_detected = False
        self.is_recording = False
        self.consecutive_failures = 0

        self._generate_placeholder()

    def _generate_placeholder(self):
        """Generate a dark 'Fetching Image...' placeholder."""
        img = np.zeros((360, 640, 3), dtype=np.uint8)
        img[:] = (18, 22, 38)
        cv2.putText(img, "Fetching Image...", (160, 190),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (100, 120, 180), 2)
        _, buf = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 80])
        self.latest_jpeg_bytes = buf.tobytes()
        self.latest_hq_jpeg_bytes = buf.tobytes()
        self.latest_low_jpeg_bytes = buf.tobytes()
        self.latest_raw_bytes = buf.tobytes()
        self.latest_content_type = 'image/jpeg'

    def get_latest_low_jpeg(self):
        return self.latest_low_jpeg_bytes

    def _fetch_image(self):
        """Fetch the remote image and decode it with OpenCV."""
        import urllib.request
        try:
            req = urllib.request.Request(self.image_url, headers={'User-Agent': 'HeimdallNVR/1.0'})
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read()
                content_type = resp.headers.get('Content-Type', 'image/jpeg')

            self.latest_raw_bytes = raw
            self.latest_content_type = content_type

            # Decode image bytes via numpy/OpenCV for motion/thumbnails
            arr = np.frombuffer(raw, dtype=np.uint8)
            frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if frame is None:
                raise ValueError("cv2.imdecode returned None — unsupported format?")

            # HQ version (full resolution)
            _, hq_buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 92])
            self.latest_hq_jpeg_bytes = hq_buf.tobytes()

            # Thumbnail version (640px wide for grid)
            h, w = frame.shape[:2]
            if w > 640:
                scale = 640 / w
                thumb = cv2.resize(frame, (640, int(h * scale)), interpolation=cv2.INTER_AREA)
            else:
                thumb = frame
            _, thumb_buf = cv2.imencode('.jpg', thumb, [cv2.IMWRITE_JPEG_QUALITY, 80])
            self.latest_jpeg_bytes = thumb_buf.tobytes()

            # Low version (320px wide)
            if w > 320:
                scale_low = 320 / w
                thumb_low = cv2.resize(frame, (320, int(h * scale_low)), interpolation=cv2.INTER_AREA)
            else:
                thumb_low = frame
            _, low_buf = cv2.imencode('.jpg', thumb_low, [cv2.IMWRITE_JPEG_QUALITY, 50])
            self.latest_low_jpeg_bytes = low_buf.tobytes()

            self.consecutive_failures = 0
            print(f"[ImageURL] [{self.name}] Fetched OK ({len(raw)} bytes, type: {content_type})")

        except Exception as e:
            self.consecutive_failures += 1
            print(f"[ImageURL] [{self.name}] Fetch failed ({e}), attempt #{self.consecutive_failures}")
            # Show error placeholder
            img = np.zeros((360, 640, 3), dtype=np.uint8)
            img[:] = (18, 22, 38)
            cv2.putText(img, "Image Unavailable", (155, 170),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (60, 60, 200), 2)
            cv2.putText(img, str(e)[:55], (40, 210),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.4, (100, 100, 140), 1)
            _, buf = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 80])
            self.latest_jpeg_bytes = buf.tobytes()
            self.latest_hq_jpeg_bytes = buf.tobytes()
            self.latest_low_jpeg_bytes = buf.tobytes()

    def stop(self):
        self.running = False

    def run(self):
        print(f"[ImageURL] [{self.name}] Starting — URL: {self.image_url} | Interval: {self.refresh_interval}s")
        while self.running:
            self._fetch_image()
            # Sleep in small chunks so stop() responds quickly
            for _ in range(self.refresh_interval * 10):
                if not self.running:
                    break
                time.sleep(0.1)

class CameraThread(threading.Thread):
    def __init__(self, camera_info):
        super().__init__()
        self.daemon = True
        self.camera_id = camera_info['id']
        self.name = camera_info['name']
        self.main_url = camera_info['main_url']
        self.sub_url = camera_info['sub_url']
        self.record_mode = camera_info.get('record_mode', 'motion')
        self.rtsp_user = camera_info.get('rtsp_user')
        self.rtsp_pass = camera_info.get('rtsp_pass')
        self.osd_enabled = camera_info.get('osd_enabled', 1) == 1
        
        # Motion detection settings
        self.motion_enabled = camera_info.get('motion_enabled', 1) == 1
        self.sensitivity = camera_info.get('motion_sensitivity', 50)
        self.threshold = camera_info.get('motion_threshold', 25)
        self.pre_roll = camera_info.get('pre_roll', 0)
        self.post_roll = camera_info.get('post_roll', 5)
        
        self.running = True
        self.latest_frame = None
        self.latest_stream_frame = None # Frame with motion boxes drawn for viewing
        self.latest_jpeg_bytes = None      # 640px-wide thumbnail for grid polling
        self.latest_hq_jpeg_bytes = None   # Full-resolution JPEG for detail modal
        self.latest_low_jpeg_bytes = None  # 320px-wide JPEG for ultra-low bandwidth
        self.last_jpeg_time = 0
        self.consecutive_failures = 0
        self._generate_connecting_placeholder()
        
        # Motion state
        self.is_motion_detected = False
        self.last_motion_time = 0
        
        # Recording state
        self.is_recording = False
        self.recording_id = None
        self.record_filepath = None
        self.record_start_time = None
        self.manual_record_end_time = 0
        
        # Mock Camera flag
        self.is_mock = self.sub_url.startswith("mock://")
        self.mock_cap = None
        
        # OpenCV background subtractor parameters
        self.bg_subtractor = None
        self.background_model = None
        
        # FFmpeg recording process
        self.record_process = None
        
        # Mock recording writer
        self.mock_writer = None
        
        # Frame buffering (Pre-roll cache)
        self.frame_buffer = [] # list of (timestamp, frame)
        self.max_buffer_seconds = max(1, self.pre_roll)
        
    def get_latest_low_jpeg(self):
        return self.latest_low_jpeg_bytes

    def run(self):
        while self.running:
            if self.is_mock:
                self.mock_cap = MockCapture(self.name, osd_enabled=self.osd_enabled)
                cap = self.mock_cap
            else:
                # Open sub-stream for live view & motion detection
                auth_sub_url = inject_credentials(self.sub_url, self.rtsp_user, self.rtsp_pass)
                cap = cv2.VideoCapture(auth_sub_url)
                if not cap.isOpened():
                    print(f"[{self.name}] Failed to open sub-stream: {self.sub_url}. Retrying in 10s...")
                    self._draw_reconnecting_overlay()
                    time.sleep(10)
                    continue
                    
            print(f"[{self.name}] Camera stream started.")
            print(f"  Live/motion sub-stream : {self.sub_url}")
            print(f"  Recording main-stream  : {self.main_url}")
            if self.main_url == self.sub_url:
                print(f"  *** WARNING: main_url == sub_url for camera '{self.name}'.")
                print(f"  *** Recordings will use the same (likely low-res) stream as live view.")
                print(f"  *** Update the camera in Settings to set a separate high-res main stream URL.")
            
            # Reset motion background
            self.background_model = None
            
            # Setup buffer size to 1 if it is a real camera (reduces lag)
            if not self.is_mock:
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                
            last_motion_time = time.time()
            motion_boxes = []
            motion_detected_this_frame = False
            self.consecutive_failures = 0

            
            while self.running:
                try:
                    # Read frames in a tight loop to drain the OpenCV buffer.
                    # cap.read() will block naturally matching the camera FPS.
                    ret, frame = cap.read()
                    if not ret:
                        if self.is_mock:
                            time.sleep(0.05) # Mock capture frame rate throttling
                            continue
                        else:
                            self.consecutive_failures += 1
                            if self.consecutive_failures >= 15: # Allow ~0.5s of frame drops
                                print(f"[{self.name}] Stream connection lost (15 consecutive failures). Reconnecting...")
                                self.consecutive_failures = 0
                                self._draw_reconnecting_overlay()
                                break
                            time.sleep(0.03) # brief sleep before next read attempt
                            continue
                    else:
                        self.consecutive_failures = 0
                    
                    # Keep copy of raw frame
                    self.latest_frame = frame.copy()
                    
                    # Draw motion overlay if active
                    display_frame = frame.copy()
                    
                    # We throttle motion detection running to ~8 FPS (every 120ms) to save CPU,
                    # but we read frames continuously to avoid buffer latency.
                    now = time.time()
                    run_motion = self.motion_enabled and (self.record_mode in ['motion', 'hybrid'])
                    if run_motion and (now - last_motion_time >= 0.12):
                        last_motion_time = now
                        
                        # 1. Resize for performance
                        resized = cv2.resize(frame, (320, 240))
                        # 2. Blur and grayscale
                        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
                        gray = cv2.GaussianBlur(gray, (21, 21), 0)
                        
                        # 3. Accumulate background
                        if self.background_model is None:
                            self.background_model = gray.copy().astype("float")
                            continue
                        
                        cv2.accumulateWeighted(gray, self.background_model, 0.05)
                        bg_diff = cv2.absdiff(gray, cv2.convertScaleAbs(self.background_model))
                        
                        # 4. Threshold & Dilation
                        # Threshold defaults to 25. Lower = more sensitive
                        thresh = cv2.threshold(bg_diff, self.threshold, 255, cv2.THRESH_BINARY)[1]
                        thresh = cv2.dilate(thresh, None, iterations=2)
                        
                        # 5. Contours
                        contours, _ = cv2.findContours(thresh.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                        
                        # Map sensitivity to pixel area: Sensitivity 1 -> area 5000, 100 -> area 50
                        min_area = max(20, 5000 - int(self.sensitivity * 49.5))
                        
                        motion_boxes = []
                        motion_detected_this_frame = False
                        for c in contours:
                            if cv2.contourArea(c) < min_area:
                                continue
                            motion_detected_this_frame = True
                            
                            # Scale contour back to original frame size
                            (x, y, w, h) = cv2.boundingRect(c)
                            scale_x = frame.shape[1] / 320.0
                            scale_y = frame.shape[0] / 240.0
                            ox, oy, ow, oh = int(x * scale_x), int(y * scale_y), int(w * scale_x), int(h * scale_y)
                            motion_boxes.append((ox, oy, ow, oh))
                            
                        # Handle motion state machine
                        self._update_motion_state(motion_detected_this_frame)
                        
                    # Draw the boxes from the latest motion detection check
                    if self.motion_enabled:
                        for (ox, oy, ow, oh) in motion_boxes:
                            cv2.rectangle(display_frame, (ox, oy), (ox + ow, oy + oh), (0, 0, 255), 2)
                        if len(motion_boxes) > 0:
                            # Draw motion indicator
                            cv2.circle(display_frame, (30, 70), 10, (0, 0, 255), -1)
                            cv2.putText(display_frame, "MOTION DETECTED", (50, 76), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
                            
                    # Software OSD rendering has been removed; timestamps are now drawn natively by the camera hardware.
                            
                    self.latest_stream_frame = display_frame
                    
                    # Offload JPEG encoding to the background camera thread.
                    # Two quality levels:
                    #   latest_jpeg_bytes     — 640px-wide thumbnail (for grid polling, low bandwidth)
                    #   latest_hq_jpeg_bytes  — full resolution (for detail/modal view)
                    now_time = time.time()
                    if now_time - self.last_jpeg_time >= 0.08:
                        self.last_jpeg_time = now_time
                        try:
                            h, w = display_frame.shape[:2]

                            # ── Low-res thumbnail (grid) ──────────────────────────────────
                            if w > 640:
                                scale = 640.0 / w
                                nh, nw = int(h * scale), 640
                                stream_preview = cv2.resize(display_frame, (nw, nh))
                            else:
                                stream_preview = display_frame
                            ret, jpeg = cv2.imencode('.jpg', stream_preview, [cv2.IMWRITE_JPEG_QUALITY, 75])
                            if ret:
                                self.latest_jpeg_bytes = jpeg.tobytes()

                            # ── Full-resolution HQ JPEG (detail modal) ───────────────────
                            ret_hq, jpeg_hq = cv2.imencode('.jpg', display_frame, [cv2.IMWRITE_JPEG_QUALITY, 92])
                            if ret_hq:
                                self.latest_hq_jpeg_bytes = jpeg_hq.tobytes()

                            # ── Ultra-Low-res JPEG (remote 3G) ───────────────────────────
                            if w > 320:
                                scale_low = 320.0 / w
                                nh_low, nw_low = int(h * scale_low), 320
                                stream_preview_low = cv2.resize(display_frame, (nw_low, nh_low))
                            else:
                                stream_preview_low = display_frame
                            ret_low, jpeg_low = cv2.imencode('.jpg', stream_preview_low, [cv2.IMWRITE_JPEG_QUALITY, 50])
                            if ret_low:
                                self.latest_low_jpeg_bytes = jpeg_low.tobytes()

                        except Exception as e:
                            print(f"[{self.name}] Error encoding stream frame: {e}")
                            
                    # Manual recording timeout
                    if self.manual_record_end_time > 0 and now_time >= self.manual_record_end_time:
                        self.manual_record_end_time = 0
                        if self.is_recording and not self.is_motion_detected and self.record_mode != 'always':
                            print(f"[{self.name}] Manual recording duration completed.")
                            self._stop_recording()
                    
                    # Continuous / Hybrid segment splitting
                    if self.record_mode in ['always', 'hybrid']:
                        if not self.is_recording:
                            self._start_recording()
                        else:
                            elapsed = (datetime.now() - self.record_start_time).total_seconds()
                            if elapsed >= 900: # 15 minutes
                                print(f"[{self.name}] Segment completed ({elapsed:.1f}s). Rotating files...")
                                self._stop_recording()
                                self._start_recording()
        
                    # Write to recording file if recording
                    if self.is_recording:
                        if self.is_mock:
                            if self.mock_writer:
                                self.mock_writer.write(frame)
                        else:
                            # For real camera, ffmpeg is writing directly in background.
                            # Check if ffmpeg died unexpectedly.
                            if self.record_process and self.record_process.poll() is not None:
                                print(f"[{self.name}] FFmpeg recording process died. Restarting...")
                                self._start_ffmpeg()
                except Exception as e:
                    print(f"[{self.name}] Error in camera thread loop: {e}")
                    time.sleep(1.0) # sleep briefly to prevent tight CPU looping if exception persists
                            
            cap.release()
            if self.mock_writer:
                self.mock_writer.release()
                self.mock_writer = None
            
            # Wait at least 2 seconds before reconnecting to prevent camera flooding
            if not self.is_mock and self.running:
                time.sleep(2)
            
        print(f"[{self.name}] Camera thread exiting.")
        self._stop_recording()

    def trigger_manual_record(self, duration=15):
        self.manual_record_end_time = time.time() + duration
        if not self.is_recording:
            print(f"[{self.name}] Manual recording triggered for {duration} seconds.")
            database.log_event(self.camera_id, "MANUAL_RECORD", f"Manual recording triggered on {self.name}")
            self._start_recording()

    def _update_motion_state(self, motion_detected):
        now = time.time()
        
        if motion_detected:
            self.last_motion_time = now
            if not self.is_motion_detected:
                self.is_motion_detected = True
                database.log_event(self.camera_id, "MOTION_START", f"Motion detected on {self.name}")
                if self.motion_enabled and self.record_mode == 'motion':
                    self._start_recording()
        else:
            if self.is_motion_detected:
                # Wait for post-roll
                if now - self.last_motion_time >= self.post_roll:
                    self.is_motion_detected = False
                    database.log_event(self.camera_id, "MOTION_END", f"Motion ended on {self.name}")
                    if self.record_mode == 'motion':
                        self._stop_recording()

    def _start_recording(self):
        if self.is_recording:
            return
            
        self.record_start_time = datetime.now()
        timestamp_str = self.record_start_time.strftime("%Y%m%d_%H%M%S")
        filename = f"camera_{self.camera_id}_{timestamp_str}.mp4"
        self.record_filepath = os.path.join(RECORDINGS_DIR, filename)
        
        # Temp file while recording
        self.temp_filepath = os.path.join(RECORDINGS_DIR, f"temp_{self.camera_id}.mp4")
        if os.path.exists(self.temp_filepath):
            try:
                os.remove(self.temp_filepath)
            except Exception:
                pass
                
        print(f"[{self.name}] Starting motion recording -> {filename}")
        
        # Log to database immediately (so we know it started)
        self.recording_id = database.add_recording(self.camera_id, filename, self.record_start_time.isoformat())
        self.is_recording = True
        
        if self.is_mock:
            # OpenCV writer for mock camera
            fourcc = cv2.VideoWriter_fourcc(*'mp4v') # mp4v is cross platform
            self.mock_writer = cv2.VideoWriter(self.temp_filepath, fourcc, 10.0, (1280, 720))
        else:
            # Launch FFmpeg to copy stream directly (0% CPU)
            self._start_ffmpeg()

    def _start_ffmpeg(self):
        if self.record_process:
            try:
                self.record_process.terminate()
            except Exception:
                pass
                
        # Check local bin/ folder first for self-contained installation
        local_bin_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bin")
        local_ffmpeg = os.path.join(local_bin_dir, "ffmpeg.exe" if os.name == 'nt' else "ffmpeg")
        ffmpeg_cmd = local_ffmpeg if os.path.exists(local_ffmpeg) else "ffmpeg"
                
        # Command: copy H264 stream without transcoding, convert audio to AAC
        # -movflags +faststart moves the index (moov atom) to the beginning for remote progressive streaming
        auth_main_url = inject_credentials(self.main_url, self.rtsp_user, self.rtsp_pass)
        cmd = [
            ffmpeg_cmd, '-y',
            '-rtsp_transport', 'tcp',
            '-i', auth_main_url,
            '-c:v', 'copy',
            '-c:a', 'aac', # Convert audio to AAC for web browser compatibility
            '-movflags', '+faststart',
            '-f', 'mp4',
            self.temp_filepath
        ]
        
        try:
            # Creation flags to avoid showing console window on Windows
            startupinfo = None
            if os.name == 'nt':
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                
            self.record_process = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                startupinfo=startupinfo
            )
        except Exception as e:
            print(f"[{self.name}] Failed to start FFmpeg subprocess: {e}")

    def _stop_recording(self):
        if not self.is_recording:
            return
            
        print(f"[{self.name}] Stopping motion recording.")
        self.is_recording = False
        
        # Stop ffmpeg / mock writer
        if self.is_mock:
            if self.mock_writer:
                self.mock_writer.release()
                self.mock_writer = None
        else:
            if self.record_process:
                try:
                    # Write 'q' to ffmpeg to stop gracefully
                    self.record_process.communicate(input=b'q', timeout=2)
                except Exception:
                    try:
                        self.record_process.terminate()
                    except Exception:
                        pass
                self.record_process = None
                
        # Move temp to final filename
        if os.path.exists(self.temp_filepath):
            try:
                if os.path.exists(self.record_filepath):
                    os.remove(self.record_filepath)
                os.rename(self.temp_filepath, self.record_filepath)
                
                # Update SQLite record with end time and duration
                end_time = datetime.now()
                duration = (end_time - self.record_start_time).total_seconds()
                database.update_recording_end(self.recording_id, end_time.isoformat(), duration)
                print(f"[{self.name}] Recording saved: {self.record_filepath} ({duration:.1f}s)")
                
                try:
                    notifications.send_motion_notification_async(self.name, self.record_filepath, self.latest_hq_jpeg_bytes, camera_id=self.camera_id)
                except Exception as ne:
                    print(f"[{self.name}] Failed to send notification: {ne}")
            except Exception as e:
                print(f"[{self.name}] Error moving recording file: {e}")
        else:
            print(f"[{self.name}] Warning: Temp recording file not found!")
            
        self.recording_id = None
        self.record_filepath = None

    def _generate_connecting_placeholder(self):
        try:
            placeholder = np.zeros((360, 640, 3), dtype=np.uint8)
            placeholder[:] = (20, 15, 10) # Dark cyberpunk background
            
            # Draw camera name and status
            cv2.putText(placeholder, f"{self.name}", (40, 160), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 242, 254), 2, cv2.LINE_AA)
            cv2.putText(placeholder, "Connecting to RTSP stream...", (40, 200), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (150, 150, 150), 1, cv2.LINE_AA)
            
            ret, jpeg = cv2.imencode('.jpg', placeholder)
            if ret:
                self.latest_jpeg_bytes = jpeg.tobytes()
        except Exception:
            pass

    def _draw_reconnecting_overlay(self):
        try:
            if self.latest_stream_frame is not None:
                reconnect_frame = self.latest_stream_frame.copy()
                h, w = reconnect_frame.shape[:2]
                
                # Draw a dark overlay banner at the bottom
                cv2.rectangle(reconnect_frame, (0, h - 45), (w, h), (10, 15, 20), -1)
                cv2.putText(reconnect_frame, "Connection lost. Reconnecting...", (20, h - 15), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 165, 255), 1, cv2.LINE_AA)

                # Full-res HQ placeholder
                ret_hq, jpeg_hq = cv2.imencode('.jpg', reconnect_frame)
                if ret_hq:
                    self.latest_hq_jpeg_bytes = jpeg_hq.tobytes()

                # Downscaled thumbnail for grid
                if w > 640:
                    scale = 640.0 / w
                    nh, nw = int(h * scale), 640
                    reconnect_frame = cv2.resize(reconnect_frame, (nw, nh))
                    
                ret, jpeg = cv2.imencode('.jpg', reconnect_frame)
                if ret:
                    self.latest_jpeg_bytes = jpeg.tobytes()
            else:
                self._generate_connecting_placeholder()
        except Exception:
            pass

    def ptz_move(self, pan, tilt, zoom):
        if self.is_mock and self.mock_cap:
            # Direct simulation interaction
            self.mock_cap.update_ptz(pan, tilt, zoom)
            return True
        else:
            # Route based on camera configuration (ONVIF or Foscam HTTP)
            db_cam = database.get_camera(self.camera_id)
            if db_cam and db_cam['ptz_ip']:
                import ptz
                return ptz.send_ptz(
                    db_cam['ptz_ip'],
                    db_cam['ptz_port'] or 80,
                    db_cam['ptz_user'] or "",
                    db_cam['ptz_pass'] or "",
                    db_cam.get('ptz_type', 'onvif'),
                    "move",
                    x=pan, y=tilt, z=zoom
                )
        return False

    def ptz_stop(self):
        if self.is_mock and self.mock_cap:
            # Simulation: stop moving by setting target to current
            self.mock_cap.update_ptz(self.mock_cap.pan, self.mock_cap.tilt, self.mock_cap.zoom)
            return True
        else:
            db_cam = database.get_camera(self.camera_id)
            if db_cam and db_cam['ptz_ip']:
                import ptz
                return ptz.send_ptz(
                    db_cam['ptz_ip'],
                    db_cam['ptz_port'] or 80,
                    db_cam['ptz_user'] or "",
                    db_cam['ptz_pass'] or "",
                    db_cam.get('ptz_type', 'onvif'),
                    "stop"
                )
        return False

    def ptz_home(self):
        if self.is_mock and self.mock_cap:
            # Simulation: set pan/tilt to 0, zoom to 1
            self.mock_cap.update_ptz(0.0, 0.0, 1.0)
            return True
        else:
            db_cam = database.get_camera(self.camera_id)
            if db_cam and db_cam['ptz_ip']:
                import ptz
                return ptz.send_ptz(
                    db_cam['ptz_ip'],
                    db_cam['ptz_port'] or 80,
                    db_cam['ptz_user'] or "",
                    db_cam['ptz_pass'] or "",
                    db_cam.get('ptz_type', 'onvif'),
                    "home"
                )
        return False

    def stop(self):
        self.running = False


class CameraManager:
    def __init__(self):
        self.threads = {} # camera_id -> CameraThread
        self.cleanup_running = False
        self.cleanup_thread = None
        
    def start_all(self):
        cameras = database.get_cameras()
        for cam in cameras:
            self.start_camera(cam)
            
        # Start background storage cleanup worker
        self.cleanup_running = True
        self.cleanup_thread = threading.Thread(target=self._cleanup_loop, daemon=True)
        self.cleanup_thread.start()
            
    def start_camera(self, camera_info):
        camera_id = camera_info['id']
        if camera_id in self.threads:
            self.stop_camera(camera_id)

        stream_type = camera_info.get('stream_type', 'rtsp')
        if stream_type == 'website':
            return
        elif stream_type == 'image_url':
            thread = ImageUrlThread(camera_info)
        else:
            thread = CameraThread(camera_info)
        self.threads[camera_id] = thread
        thread.start()
        
    def stop_camera(self, camera_id):
        if camera_id in self.threads:
            thread = self.threads[camera_id]
            thread.stop()
            thread.join(timeout=5)
            del self.threads[camera_id]
            
    def stop_all(self):
        self.cleanup_running = False
        if self.cleanup_thread:
            self.cleanup_thread.join(timeout=2)
            self.cleanup_thread = None
            
        for cid in list(self.threads.keys()):
            self.stop_camera(cid)
            
    def _cleanup_loop(self):
        print("[Cleanup] Background storage cleanup worker started.")
        # Initial sleep of 10s to allow startup/database operations to settle
        time.sleep(10)
        while self.cleanup_running:
            try:
                self.archive_recordings()
                
                retention_days_str = database.get_system_setting("retention_days")
                if retention_days_str:
                    retention_days = int(retention_days_str)
                    if retention_days > 0:
                        self.prune_old_recordings(retention_days)
            except Exception as e:
                print(f"[Cleanup] Error in cleanup loop: {e}")
                
            # Sleep 1 hour, checking self.cleanup_running every 5 seconds to respond quickly to shutdown
            for _ in range(720):
                if not self.cleanup_running:
                    break
                time.sleep(5)
        print("[Cleanup] Background storage cleanup worker stopped.")
        
    def archive_recordings(self):
        from datetime import datetime, timedelta
        import shutil
        cameras = database.get_cameras()
        for cam in cameras:
            archive_days = cam.get('archive_days', 0)
            archive_path = cam.get('archive_path')
            
            if archive_days > 0 and archive_path:
                # Ensure archive path exists or is mounted
                if not os.path.exists(archive_path):
                    print(f"[Archive] NAS/Archive path unreachable for camera {cam['name']}: {archive_path}. Skipping.")
                    continue
                
                cutoff_time = (datetime.now() - timedelta(days=archive_days)).isoformat()
                to_archive = database.get_recordings_to_archive(cam['id'], cutoff_time)
                
                if to_archive:
                    print(f"[Archive] Found {len(to_archive)} recordings to archive for camera {cam['name']} (older than {archive_days} days).")
                
                for rec in to_archive:
                    local_filepath = os.path.join(RECORDINGS_DIR, rec['filepath'])
                    dest_filepath = os.path.join(archive_path, rec['filepath'])
                    
                    if os.path.exists(local_filepath):
                        try:
                            # Copy to NAS
                            shutil.copy2(local_filepath, dest_filepath)
                            
                            # Verify copy size
                            if os.path.getsize(local_filepath) == os.path.getsize(dest_filepath):
                                # Update DB
                                database.mark_recording_archived(rec['id'])
                                # Delete local
                                os.remove(local_filepath)
                                print(f"[Archive] Successfully moved {rec['filepath']} to {archive_path}")
                            else:
                                print(f"[Archive] Size mismatch after copying {rec['filepath']}. Aborting move.")
                        except Exception as e:
                            print(f"[Archive] Error moving file {rec['filepath']} to NAS: {e}")
                            
    def prune_old_recordings(self, retention_days):
        from datetime import datetime, timedelta
        # Calculate cutoff time in ISO format
        cutoff_time = (datetime.now() - timedelta(days=retention_days)).isoformat()
        
        expired = database.get_expired_recordings(cutoff_time)
        if not expired:
            return
            
        print(f"[Cleanup] Found {len(expired)} expired recordings older than {retention_days} days (cutoff: {cutoff_time[:19]}).")
        
        # Cache camera info to avoid many DB lookups
        cam_cache = {}
        for rec in expired:
            # Delete from database
            database.delete_recording(rec['id'])
            
            # Delete file on disk
            filepath = None
            if rec.get('is_archived', 0) == 1:
                cam_id = rec['camera_id']
                if cam_id not in cam_cache:
                    cam_cache[cam_id] = database.get_camera(cam_id)
                cam = cam_cache[cam_id]
                if cam and cam.get('archive_path'):
                    filepath = os.path.join(cam['archive_path'], rec['filepath'])
            else:
                filepath = os.path.join(RECORDINGS_DIR, rec['filepath'])
                
            if filepath and os.path.exists(filepath):
                try:
                    os.remove(filepath)
                    print(f"[Cleanup] Deleted expired recording file: {filepath}")
                except Exception as e:
                    print(f"[Cleanup] Error deleting file {filepath}: {e}")
            
    def reload_camera(self, camera_id):
        cam = database.get_camera(camera_id)
        if cam:
            self.start_camera(cam)
        else:
            self.stop_camera(camera_id)
            
    def get_latest_frame(self, camera_id, draw_boxes=True):
        if camera_id in self.threads:
            thread = self.threads[camera_id]
            if draw_boxes:
                return thread.latest_stream_frame
            return thread.latest_frame
        return None
        
    def get_latest_jpeg(self, camera_id):
        if camera_id in self.threads:
            return self.threads[camera_id].latest_jpeg_bytes
        return None

    def get_latest_hq_jpeg(self, camera_id):
        """Return full-resolution JPEG for the detail/modal view.
        Falls back to the downscaled thumbnail if HQ hasn't been encoded yet."""
        if camera_id in self.threads:
            thread = self.threads[camera_id]
            return thread.latest_hq_jpeg_bytes or thread.latest_jpeg_bytes
        return None

    def get_latest_low_jpeg(self, camera_id):
        """Return ultra-low-resolution JPEG for poor remote connections.
        Falls back to the standard thumbnail if Low hasn't been encoded yet."""
        if camera_id in self.threads:
            thread = self.threads[camera_id]
            return thread.latest_low_jpeg_bytes or thread.latest_jpeg_bytes
        return None
        
    def ptz_control(self, camera_id, action, pan=0.0, tilt=0.0, zoom=1.0):
        if camera_id in self.threads:
            thread = self.threads[camera_id]
            if action == "move":
                return thread.ptz_move(pan, tilt, zoom)
            elif action == "stop":
                return thread.ptz_stop()
            elif action == "home":
                return thread.ptz_home()
        return False
        
    def set_mock_motion(self, camera_id, enabled):
        if camera_id in self.threads:
            thread = self.threads[camera_id]
            if thread.is_mock and thread.mock_cap:
                thread.mock_cap.enable_motion_sim = enabled
                return True
        return False

# Global camera manager instance
manager = CameraManager()
