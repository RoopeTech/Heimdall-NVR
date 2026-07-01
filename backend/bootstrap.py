import os
import sys
import stat
import zipfile
import tarfile
import urllib.request
import logging
import platform

logger = logging.getLogger(__name__)

BIN_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bin")

def ensure_binaries():
    os.makedirs(BIN_DIR, exist_ok=True)
    
    system = platform.system().lower()
    machine = platform.machine().lower()
    
    is_windows = (system == "windows")
    
    ffmpeg_ext = ".exe" if is_windows else ""
    go2rtc_ext = ".exe" if is_windows else ""
    
    ffmpeg_path = os.path.join(BIN_DIR, f"ffmpeg{ffmpeg_ext}")
    go2rtc_path = os.path.join(BIN_DIR, f"go2rtc{go2rtc_ext}")
    
    # 1. Download go2rtc
    if not os.path.exists(go2rtc_path):
        logger.info("go2rtc not found. Downloading...")
        if is_windows:
            url = "https://github.com/AlexxIT/go2rtc/releases/download/v1.9.2/go2rtc_win64.zip"
            zip_path = os.path.join(BIN_DIR, "go2rtc.zip")
            urllib.request.urlretrieve(url, zip_path)
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(BIN_DIR)
            os.remove(zip_path)
        elif system == "linux":
            # Direct binary download for Linux
            arch = "amd64" if "x86_64" in machine or "amd64" in machine else "arm64" if "arm64" in machine or "aarch64" in machine else "arm"
            url = f"https://github.com/AlexxIT/go2rtc/releases/download/v1.9.2/go2rtc_linux_{arch}"
            urllib.request.urlretrieve(url, go2rtc_path)
            # Make executable
            st = os.stat(go2rtc_path)
            os.chmod(go2rtc_path, st.st_mode | stat.S_IEXEC)
        elif system == "darwin": # macOS
            arch = "arm64" if "arm64" in machine else "amd64"
            url = f"https://github.com/AlexxIT/go2rtc/releases/download/v1.9.2/go2rtc_mac_{arch}"
            urllib.request.urlretrieve(url, go2rtc_path)
            st = os.stat(go2rtc_path)
            os.chmod(go2rtc_path, st.st_mode | stat.S_IEXEC)
            
        logger.info(f"go2rtc downloaded successfully to {go2rtc_path}")

    # 2. Download ffmpeg
    if not os.path.exists(ffmpeg_path):
        logger.info("ffmpeg not found. Downloading (this may take a minute)...")
        if is_windows:
            url = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
            zip_path = os.path.join(BIN_DIR, "ffmpeg.zip")
            urllib.request.urlretrieve(url, zip_path)
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                for member in zip_ref.namelist():
                    if member.endswith("ffmpeg.exe"):
                        source = zip_ref.open(member)
                        with open(ffmpeg_path, "wb") as target:
                            target.write(source.read())
                        break
            os.remove(zip_path)
        elif system == "linux":
            url = "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
            tar_path = os.path.join(BIN_DIR, "ffmpeg.tar.xz")
            urllib.request.urlretrieve(url, tar_path)
            with tarfile.open(tar_path, "r:xz") as tar_ref:
                for member in tar_ref.getmembers():
                    if member.name.endswith("ffmpeg") and not member.name.endswith("ffprobe"):
                        # Extract just ffmpeg
                        f = tar_ref.extractfile(member)
                        with open(ffmpeg_path, "wb") as target:
                            target.write(f.read())
                        break
            os.remove(tar_path)
            st = os.stat(ffmpeg_path)
            os.chmod(ffmpeg_path, st.st_mode | stat.S_IEXEC)
            
        logger.info(f"ffmpeg downloaded successfully to {ffmpeg_path}")

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    ensure_binaries()
