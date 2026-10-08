# Heimdall NVR System Architecture

This document provides a high-level overview of how the NVR system is structured, how the components interact, and where to look if you need to make manual modifications or debug issues.

## 1. High-Level Overview

Heimdall NVR is a modern, lightweight Network Video Recorder designed for high performance and premium aesthetics.

- **Frontend:** A Single Page Application (SPA) built with React and Vite.
- **Backend:** A fast, asynchronous API server built with Python and FastAPI.
- **Database:** A self-contained SQLite database for metadata, settings, and user management.
- **Video Processing:** Uses a dual-pipeline approach — **FFmpeg** subprocesses for recording and snapshots, and **go2rtc** for sub-second latency WebRTC streaming.

---

## 2. Backend (`/backend`)

The backend is written in Python. To run it locally during development, navigate to the repo root directory, activate the virtual environment, and run `python backend/main.py`. The server starts itself internally using uvicorn and handles all REST API routes, static file serving, and session management.

### Core Files:

- `main.py`: The FastAPI web server. This handles all REST API routes (e.g., `/api/cameras`, `/api/auth`, `/api/recordings`), static file serving for the frontend, go2rtc lifecycle management, and session management.
- `database.py`: Handles all SQLite interactions. Contains schema definitions, migrations, encryption logic for passwords/credentials, and CRUD operations. The database file is generated at `backend/nvr.db`.
- `camera_manager.py`: The heart of the NVR. This runs continuous background threads for every configured camera. It uses FFmpeg subprocesses to continuously capture snapshots (for the live grid view) and record video (based on motion or continuous recording settings).
- `go2rtc_manager.py`: Manages the go2rtc WebRTC streaming engine — starts, stops, and monitors the process. Streams low-res MJPEG frames via HTTP and handles WebRTC candidate exchange for peer-to-peer streaming.
- `bootstrap.py`: Cross-platform auto-installer. On first launch, detects the OS (Windows, Linux, or macOS) and downloads the correct static binaries for FFmpeg and go2rtc into `backend/bin/`.
- `notifications.py`: Handles Discord and Telegram webhook notifications for motion events, supporting optional image and video clip attachments.
- `ptz.py`: Contains the logic for Pan/Tilt/Zoom controls, utilizing standard ONVIF protocols as well as specific CGI/HTTP fallback protocols for older cameras (like Foscam).

### `backend/bin/` Directory

When the application starts for the first time, `bootstrap.py` downloads static FFmpeg and go2rtc binaries into `backend/bin/`. These are pre-compiled for the current platform — no system-level FFmpeg installation is required. The binaries are also used for recording raw RTSP streams and snapshot extraction.

### Video Processing Approach:

- **Snapshots:** Pulled at a high frequency using FFmpeg and served via an in-memory byte buffer to the frontend.
- **Recordings:** Captured as `.mp4` chunks using FFmpeg with `-c copy` (near-zero CPU) for the main stream, and audio converted to AAC for browser playback.
- **WebRTC Streaming:** Handled by the go2rtc engine for sub-second latency with optional two-way audio (push-to-talk). Falls back to MJPEG if WebRTC fails.

---

## 3. Frontend (`/frontend`)

The frontend is a React application built with Vite for fast HMR (Hot Module Replacement) and optimized bundling.

### Core Structure (`/frontend/src`):

- `App.jsx`: The main entry point. Handles global state (token validation, fetching settings, polling for new events/recordings).
- `index.css` & `App.css`: Contains the bulk of the styling, heavily utilizing CSS Variables for a customizable glassmorphism dark-mode aesthetic.
- `/components`:
  - `CameraGrid.jsx`: The main dashboard view, rendering a dynamic CSS grid of live snapshots. Supports camera groups and website embeds.
  - `CameraDetail.jsx`: The full-screen viewport that shows a live WebRTC/MJPEG stream or plays back `.mp4` recordings. Includes gesture-bound zoom, PTZ controls, stream quality profiles, and theatre mode.
  - `Timeline.jsx`: Visual 24-hour recordings scrubber with motion alert tags. Clicking empty space snaps to the nearest preceding recording.
  - `RecordingsArchive.jsx`: Global recordings browser (merged from the previous EventLog) for filtering and searching historical clips.
  - `Settings.jsx`: The admin dashboard for managing users, SSO, cameras, system variables, updates (with changelog viewer), and webhook configuration.
  - `Login.jsx`: Handles local authentication and redirects for Single Sign-On (SSO).
  - `PTZControls.jsx`: PTZ joystick and preset controls.
  - `WebRTCPlayer.jsx`: WebRTC video player with two-way audio support.

### Building the Frontend:

When changes are made to the frontend, it must be rebuilt so the backend can serve the static files.

```bash
cd frontend
npm run build
```

The backend `main.py` is configured to serve the `frontend/dist` folder at the root `/` URL.

---

## 4. Home Assistant Integration (`/custom_components/heimdall_nvr/`)

A full Home Assistant custom component provides camera entities, motion binary sensors, and server health sensors. Compatible with HACS.

- `camera.py` — HA camera entity with MJPEG stream and RTSP source support
- `binary_sensor.py` — Motion binary sensors for each camera (active 25s after event)
- `sensor.py` — Server health sensors (total cameras, active cameras, retention days)
- `config_flow.py` — Home Assistant config flow
- `api.py` — Heimdall API client for the integration

---

## 5. Authentication & Security

- **Local Auth:** Users are stored in `users` with hashed passwords and salts. Sessions are stored in a `sessions` table and verified via cookies or local storage tokens.
- **SSO Auth:** Azure Entra OIDC/OAuth2 is supported natively. Supports both manual field entry and Federation Metadata XML import (auto-fills OIDC settings). When an SSO login succeeds, `main.py` provisions a local user with the `viewer` role and an `external_id` mapped to their SSO identity.
- **Credential Storage:** RTSP and PTZ passwords for cameras are encrypted in the SQLite database to prevent plaintext credential exposure in case the `nvr.db` file is compromised.

---

## 6. Troubleshooting Guide

- **Cameras won't load:** Check `backend/nvr.db` using a SQLite viewer to ensure the `main_url` and `sub_url` RTSP streams are correct. FFmpeg and go2rtc are auto-installed on first launch — check `backend/bin/` to verify they are present.
- **UI looks broken after an update:** Run `npm run build` in the `/frontend` directory to regenerate the static bundle at `frontend/dist`, then refresh your browser.
- **WebRTC streaming fails:** Check the go2rtc logs and ensure no firewall is blocking the go2rtc UDP ports. Fall back to MJPEG in Settings.
- **Locked out of the system:** You can manually run a python script to insert a new admin user into `backend/nvr.db`, or just modify the database directly via a SQLite viewer tool.
