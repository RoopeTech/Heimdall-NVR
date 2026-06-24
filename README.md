# Antigravity NVR - IP Camera Viewer & NVR

A lightweight, high-performance Network Video Recorder (NVR) and IP Camera Viewer for Windows and Linux.

## Features
- **Dual UI**: Runs locally in a native desktop window (via `pywebview`) and hosts a web-accessible dashboard on port `8000`.
- **Low Resource Usage**: Views live feeds and processes motion detection on camera **sub-streams** to save CPU.
- **Zero-CPU Recording**: Spawns `ffmpeg` with `-c copy` to write high-resolution **main stream** video directly to disk when motion is triggered.
- **PTZ (Pan-Tilt-Zoom)**: Integrates standard ONVIF commands.
- **Scrubbable Timeline**: Visualizes motion recording segments on a 24-hour bar. Clicking seeks playback instantly.
- **Camera Simulator**: Built-in mock camera simulates room feeds, moving targets, and PTZ response for immediate testing.

## Prerequisites
Ensure Python (>=3.8), Node.js (>=16), and FFmpeg are installed and added to your system PATH.

### Installation via Winget (Windows)
```powershell
winget install Python.Python.3.11
winget install OpenJS.NodeJS.LTS
winget install Gyan.FFmpeg
```
*Note: Please restart your terminal/command prompt after installation.*

## Setup & Running

1. **Install and Compile**:
   ```bash
   npm run setup
   ```
   This will install the frontend node packages, build the production assets, and install the backend Python requirements.

2. **Start the Application**:
   ```bash
   npm start
   ```
   This starts the FastAPI server and launches the local desktop UI (or opens your default web browser if UI packages are missing).

## Configured Directory Locations
- **Database**: `backend/nvr.db`
- **Recordings**: `recordings/` (stores `.mp4` motion clips)
