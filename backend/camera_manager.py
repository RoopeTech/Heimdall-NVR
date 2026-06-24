import cv2
import numpy as np
import threading
import time
import subprocess
import os
import signal
from datetime import datetime
import database

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

class CameraThread(threading.Thread):
    def __init__(self, camera_info):
        super().__init__()
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
        
        # Motion state
        self.is_motion_detected = False
        self.last_motion_time = 0
        
        # Recording state
        self.is_recording = False
        self.recording_id = None
        self.record_filepath = None
        self.record_start_time = None
        
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
                    time.sleep(10)
                    continue
                    
            print(f"[{self.name}] Camera stream started.")
            
            # Reset motion background
            self.background_model = None
            
            # Setup buffer size to 1 if it is a real camera (reduces lag)
            if not self.is_mock:
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                
            last_motion_time = time.time()
            motion_boxes = []
            motion_detected_this_frame = False
            
            while self.running:
                # Read frames in a tight loop to drain the OpenCV buffer.
                # cap.read() will block naturally matching the camera FPS.
                ret, frame = cap.read()
                if not ret:
                    if self.is_mock:
                        time.sleep(0.05) # Mock capture frame rate throttling
                        continue
                    else:
                        print(f"[{self.name}] Stream connection lost. Reconnecting...")
                        break
                
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
                        
                # Draw OSD date/time overlay if enabled and it's a real camera (mock camera draws its own HUD)
                if not self.is_mock and self.osd_enabled:
                    try:
                        h, w = display_frame.shape[:2]
                        time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        
                        # 1. Camera Name on top-left
                        name_str = f"{self.name} | LIVE"
                        name_size = cv2.getTextSize(name_str, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)[0]
                        cv2.rectangle(display_frame, (10, 15), (20 + name_size[0], 45), (0, 0, 0), -1)
                        cv2.putText(display_frame, name_str, (20, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2, cv2.LINE_AA)
                        
                        # 2. Timestamp on top-right
                        time_size = cv2.getTextSize(time_str, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)[0]
                        text_x = w - time_size[0] - 20
                        cv2.rectangle(display_frame, (text_x - 10, 15), (w - 10, 45), (0, 0, 0), -1)
                        cv2.putText(display_frame, time_str, (text_x, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2, cv2.LINE_AA)
                    except Exception as e:
                        print(f"[{self.name}] Error drawing OSD overlay: {e}")
                        
                self.latest_stream_frame = display_frame
                
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
                            
            cap.release()
            if self.mock_writer:
                self.mock_writer.release()
                self.mock_writer = None
            
        print(f"[{self.name}] Camera thread exiting.")
        self._stop_recording()

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
                
        # Command: copy H264 stream without transcoding
        # -movflags +faststart moves the index (moov atom) to the beginning for remote progressive streaming
        auth_main_url = inject_credentials(self.main_url, self.rtsp_user, self.rtsp_pass)
        cmd = [
            ffmpeg_cmd, '-y',
            '-rtsp_transport', 'tcp',
            '-i', auth_main_url,
            '-c', 'copy',
            '-an', # disable audio to avoid format mismatches
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
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
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
            except Exception as e:
                print(f"[{self.name}] Error moving recording file: {e}")
        else:
            print(f"[{self.name}] Warning: Temp recording file not found!")
            
        self.recording_id = None
        self.record_filepath = None

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
                
    def prune_old_recordings(self, retention_days):
        from datetime import datetime, timedelta
        # Calculate cutoff time in ISO format
        cutoff_time = (datetime.now() - timedelta(days=retention_days)).isoformat()
        
        expired = database.get_expired_recordings(cutoff_time)
        if not expired:
            return
            
        print(f"[Cleanup] Found {len(expired)} expired recordings older than {retention_days} days (cutoff: {cutoff_time[:19]}).")
        for rec in expired:
            # Delete from database
            database.delete_recording(rec['id'])
            
            # Delete file on disk
            filepath = os.path.join(RECORDINGS_DIR, rec['filepath'])
            if os.path.exists(filepath):
                try:
                    os.remove(filepath)
                    print(f"[Cleanup] Deleted expired recording file: {rec['filepath']}")
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
