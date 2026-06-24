# Antigravity NVR - IP Camera Viewer & NVR Dashboard

A lightweight, high-performance, and feature-rich **Network Video Recorder (NVR)** and **IP Camera Viewer** designed for both desktop (native PyWebView UI) and web-accessible server deployments. Supports standard ONVIF/RTSP streams and runs beautifully on Windows and Linux (including headless server environments).

---

## 🚀 Key Features

*   **Cyberpunk Glassmorphic Design**: A premium responsive dashboard styled with curated dark cyberpunk colors (`#060913` and `#0b0f19`) and dynamic layouts.
*   **Dual Mode Execution**:
    *   **Desktop Mode**: Spawns a native browser-less desktop application window (via `pywebview`). Closing the app automatically kills the server.
    *   **Headless Mode**: Run on headless servers (via `--headless` or `NVR_HEADLESS=1`) to serve the dashboard over the local network.
*   **Zero-CPU Recording**: Leverages background `ffmpeg` with `-c copy` to record high-resolution camera streams. Instead of transcoding (which exhausts CPU), it copies raw H.264 streams directly into an MP4 container, maintaining native quality with near **0% CPU usage**.
*   **Flexible NVR Recording Modes**:
    *   **Motion Only**: Records clips only when motion is detected.
    *   **Continuous (Always)**: Records continuously 24/7 in 15-minute segments. Skips motion analysis to save CPU.
    *   **Hybrid**: Records continuously 24/7 and runs OpenCV motion detection in the background to log motion alert events.
    *   **View Only**: Streams the camera live with zero disk writes.
*   **Interactive 24-Hour Timeline**: Displays recordings as segments on a 24-hour visual playhead track. Scrubbing seeks the video player instantly to that second.
*   **Gesture-Bound Zoom & Panning**:
    *   **Desktop**: Use the mouse scroll wheel to digitally zoom (up to 8x) and click-and-drag to pan around the zoomed region.
    *   **Mobile**: Supports fluid pinch-to-zoom and one-finger drag-to-pan touch gestures.
*   **Camera OSD (On-Screen Display)**: Renders a high-contrast green name tag (`LIVE`) and white date & time timestamp on top of the live sub-stream using OpenCV. Features semi-transparent black backgrounds for readability on bright camera feeds.
*   **PTZ Preset 1 Return-to-Home**: Connects PTZ cameras and maps a single "Return to Home" command across multiple protocols (ONVIF, Foscam, CamHi/Boavision).
*   **Secure RTSP Credentials**: Plaintext credentials are automatically parsed, stripped from stream URL fields, and stored in dedicated secure database columns to prevent exposure in logs or UI forms.
*   **Role-Based Access Control (RBAC)**:
    *   **Admin**: Has full access, including managing cameras, system titles, and user accounts.
    *   **Viewer**: Read-only access to live streams, events logs, timeline playbacks, and PTZ controls (cannot modify settings).
*   **User Accounts Manager**: Admins can add, update passwords, toggle roles, and delete user accounts. Secure password hashing uses PBKDF2-HMAC-SHA256 with 100,000 iterations and random salts.
*   **Progressive Web App (PWA)**: Fully installable PWA for Android/iOS Chrome and desktop browsers. Features customized security camera launcher icons, custom manifest files, and a service worker configured with pass-through bypasses for live feeds and playback segments to prevent browser cache exhaustion.
*   **Storage Retention (Auto-Cleanup)**: Configurable timer settings to automatically prune expired recordings and delete their files from the disk once they cross the threshold (e.g. keep recordings for 7 days).
*   **Configuration Backup & Restore**: Download a single JSON backup of your cameras, system settings, and user accounts. Restore this backup file on another machine to migrate servers instantly.
*   **In-App System Updates**: Checks for newer versions against the remote Gitea repository. Admins can pull updates, rebuild the React frontend, and restart the backend server automatically from the Web UI.
*   **Camera Simulator**: Preconfigured out-of-the-box with a simulated indoor room, bouncing intruder target, and interactive PTZ responses. Test motion logging, timeline playback, and events instantly without connecting a physical camera.

---

## 📂 Project Architecture

```text
ip-camera-nvr/
├── backend/
│   ├── main.py              # FastAPI server (API, REST routes, static file server)
│   ├── database.py          # SQLite schema, migrations, user CRUD, config export/import
│   ├── camera_manager.py    # RTSP OpenCV ingestion, motion analysis, FFmpeg recorder, cleanup thread
│   ├── ptz.py               # SOAP/CGI commands for ONVIF, CamHi, and Foscam PTZ actions
│   └── requirements.txt     # Python requirements
├── frontend/
│   ├── index.html           # Main template with PWA links and Google fonts (Inter/Outfit)
│   ├── vite.config.js       # Vite proxy and build configuration
│   ├── package.json         # React UI dependencies
│   ├── public/
│   │   ├── manifest.json    # PWA configuration
│   │   ├── sw.js            # Caching service worker with stream pass-through bypasses
│   │   ├── icon-192.png     # Cyberpunk home screen app icon (192x192)
│   │   └── icon-512.png     # Cyberpunk home screen app icon (512x512)
│   └── src/
│       ├── main.jsx         # React PWA register and bootstrap
│       ├── App.jsx          # Main shell, tab router, profile change password modal
│       ├── App.css          # Styled cards, resizable modal, touch gestures
│       ├── index.css        # Glassmorphic UI design tokens
│       └── components/
│           ├── CameraGrid.jsx   # Responsive grid of active feeds and stats
│           ├── CameraDetail.jsx # Live/Playback viewport manager with gestured zoom and PTZ overlay
│           ├── Timeline.jsx     # Visual 24h recordings scrubber with motion alert tags
│           ├── EventLog.jsx     # Log of motion events that deep-link directly to timeline playbacks
│           ├── Login.jsx        # Glassmorphic authentication card
│           └── Settings.jsx     # Camera forms, user manager, storage clean, system backup tools
├── package.json             # Root NPM scripts manager
├── install.ps1              # Windows automated PowerShell installer
├── install.sh               # Linux automated bash installer
└── nvr-headless.service     # Headless Systemd service template
```

---

## 🛠️ Setup & Installation

### 1. Clone the Repository
Before installing, you must clone the repository from Gitea and enter the project folder. Run this on your machine:
```bash
git clone http://10.0.1.69:3000/roopetech/RTNVR.git
cd RTNVR
```
*(All installation and update commands must be run from inside this folder).*

### 2. Run the Automated Installer
We provide dedicated installer scripts that check for system dependencies (Node.js, Python, FFmpeg), create a virtual environment, install packages, and compile frontend assets.

#### Windows (PowerShell)
From the cloned `RTNVR` directory, run:
```powershell
.\install.ps1
```
*This will also register a double-clickable **Antigravity NVR** shortcut on your Desktop.*

#### Linux (Debian/Ubuntu/Fedora/Arch)
From the cloned `RTNVR` directory, make the script executable and run it:
```bash
chmod +x install.sh
./install.sh
```
*This will also register the application in your desktop environment's launcher menu.*

---

## 🖥️ Running the Application

### Desktop Mode
Start the application from the desktop shortcut, or run:
*   **Windows**: Double-click `run.bat` or run `.\backend\venv\Scripts\python.exe backend\main.py`
*   **Linux**: Run `./run.sh`

### Headless Server Mode
If deploying to a headless Linux box with no monitor or graphical server (X11/Wayland), start the server in headless mode:
```bash
# Using environment variable
export NVR_HEADLESS=1
backend/venv/bin/python backend/main.py

# OR using CLI flag
backend/venv/bin/python backend/main.py --headless
```

To configure the application to run automatically as a background daemon on boot:
1. Copy the provided template Systemd service file:
   ```bash
   sudo cp nvr-headless.service /etc/systemd/system/antigravity-nvr.service
   ```
2. Edit `/etc/systemd/system/antigravity-nvr.service` to update your `User` and `WorkingDirectory` paths.
3. Enable and start the service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now antigravity-nvr.service
   ```
4. Verify logs with `sudo journalctl -u antigravity-nvr.service -f`.

---

## ⚙️ Administration, Updates & Server Migration

To manage the NVR application, check for updates, or backup settings, navigate to the **System Settings** tab (accessible only by users with the **Admin** role):
1. **Auto-delete Old Recordings**: Set the number of retention days (e.g. `7`). The background cleanup thread will run hourly and remove old files from disk. Set to `0` to keep recordings forever.
2. **Export Config File**: Click the button to download a `.json` backup containing all configured cameras, system title, and user accounts.
3. **Import Config File**: Upload the `.json` file on a new server to restore your complete NVR configuration instantly.
4. **System Updates Manager**: Check local versus remote git commit hashes. If a newer version is available, click **Apply System Update** to perform a git pull, recompile UI static files, and hot-restart the NVR daemon process.

---

## 🔒 Security Best Practices
*   **Default Credentials**: Seeding a new database creates a default administrator (`admin` / `admin`). A warning banner will display on the interface until the password is changed. Change this immediately using the profile menu dropdown in the top-right header.
*   **Header Authorization**: All media streaming (/live and playback) and API endpoints are protected.
