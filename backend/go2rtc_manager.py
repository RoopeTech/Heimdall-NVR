import os
import subprocess
import yaml
import time
import threading
import logging
from urllib.parse import urlparse, urlunparse

logger = logging.getLogger(__name__)

BIN_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bin")
GO2RTC_BIN = os.path.join(BIN_DIR, "go2rtc.exe" if os.name == 'nt' else "go2rtc")
GO2RTC_YAML = os.path.join(os.path.dirname(os.path.abspath(__file__)), "go2rtc.yaml")

class Go2RTCManager:
    def __init__(self):
        self.process = None
        self._lock = threading.Lock()
        self.last_config_hash = None
        
    def inject_credentials(self, url: str, user: str, password: str) -> str:
        if not user or not password:
            return url
        try:
            parsed = urlparse(url)
            if not parsed.netloc:
                return url
            # Remove existing auth if any
            netloc = parsed.netloc.split('@')[-1]
            new_netloc = f"{user}:{password}@{netloc}"
            return urlunparse(parsed._replace(netloc=new_netloc))
        except Exception:
            return url
            
    def sync_cameras(self, cameras):
        """Generates go2rtc.yaml from database cameras and restarts if changed."""
        if not os.path.exists(GO2RTC_BIN):
            logger.warning("go2rtc binary not found. WebRTC streaming will be disabled.")
            return

        streams = {}
        for cam in cameras:
            # We want to stream the live view (sub_url) for web playback
            stream_url = self.inject_credentials(cam.get('sub_url', ''), cam.get('rtsp_user', ''), cam.get('rtsp_pass', ''))
            
            if stream_url:
                # Add ffmpeg wrapper to transcode audio to AAC or Opus if necessary, 
                # but go2rtc natively supports re-packetizing PCM/G711 to WebRTC compatible formats usually via its built-in ffmpeg integration!
                # We can just pass the raw RTSP URL. If it fails, users can configure a custom go2rtc ffmpeg string.
                # Actually, go2rtc natively proxies RTSP to WebRTC perfectly without ffmpeg for video, and handles common audio.
                streams[f"cam_{cam['id']}"] = stream_url
                
        config = {
            "streams": streams,
            "api": {
                "listen": ":1984" # Default WebRTC API port for go2rtc
            },
            "webrtc": {
                "listen": ":8555", # ICE candidate port
                "candidates": [
                    "stun:stun.l.google.com:19302"
                ]
            }
        }
        
        config_str = yaml.dump(config)
        
        with self._lock:
            if self.last_config_hash != hash(config_str):
                with open(GO2RTC_YAML, 'w') as f:
                    f.write(config_str)
                self.last_config_hash = hash(config_str)
                self._restart_daemon()

    def _restart_daemon(self):
        if self.process:
            logger.info("Stopping go2rtc...")
            self.process.terminate()
            try:
                self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.process.kill()
            self.process = None
            
        logger.info("Starting go2rtc...")
        try:
            startupinfo = None
            if os.name == 'nt':
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                
            self.process = subprocess.Popen(
                [GO2RTC_BIN, "-config", GO2RTC_YAML],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                startupinfo=startupinfo,
                cwd=os.path.dirname(os.path.abspath(__file__))
            )
        except Exception as e:
            logger.error(f"Failed to start go2rtc: {e}")

    def stop(self):
        if self.process:
            self.process.terminate()

manager = Go2RTCManager()
