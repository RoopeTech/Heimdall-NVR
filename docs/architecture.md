# Heimdall NVR System Architecture

This document provides a high-level overview of how the NVR system is structured, how the components interact, and where to look if you need to make manual modifications or debug issues.

## 1. High-Level Overview
Heimdall NVR is a modern, lightweight Network Video Recorder designed for high performance and premium aesthetics.
- **Frontend:** A Single Page Application (SPA) built with React and Vite.
- **Backend:** A fast, asynchronous API server built with Python and FastAPI.
- **Database:** A self-contained SQLite database for metadata, settings, and user management.
- **Video Processing:** Uses raw FFmpeg subprocesses managed by the Python backend to reliably pull, snapshot, and record RTSP streams.

---

## 2. Backend (`/backend`)
The backend is written in Python. To run it locally during development, you would navigate to the `/backend` folder, activate the virtual environment (`.\venv\Scripts\activate`), and run `uvicorn main:app --reload`.

### Core Files:
- `main.py`: The FastAPI web server. This handles all REST API routes (e.g., `/api/cameras`, `/api/auth`, `/api/recordings`), static file serving for the frontend, and session management.
- `database.py`: Handles all SQLite interactions. Contains schema definitions, migrations, encryption logic for passwords/credentials, and CRUD operations. The database file is generated at `backend/nvr.db`.
- `camera_manager.py`: The heart of the NVR. This runs continuous background threads for every configured camera. It uses FFmpeg subprocesses to continuously capture snapshots (for the live grid view) and record video (based on motion or continuous recording settings).
- `ptz.py`: Contains the logic for Pan/Tilt/Zoom controls, utilizing standard ONVIF protocols as well as specific CGI/HTTP fallback protocols for older cameras (like Foscam).

### Video Processing Approach:
Instead of relying on heavy C++ libraries, `camera_manager.py` spawns `ffmpeg` subprocesses. 
- **Snapshots:** Pulled at a high frequency and served via an in-memory byte buffer to the frontend.
- **Recordings:** Captured as `.mp4` chunks and saved directly to the disk, then logged into the SQLite database.

---

## 3. Frontend (`/frontend`)
The frontend is a React application built with Vite for fast HMR (Hot Module Replacement) and optimized bundling.

### Core Structure (`/frontend/src`):
- `App.jsx`: The main entry point. Handles global state (token validation, fetching settings, polling for new events/recordings).
- `index.css` & `App.css`: Contains the bulk of the styling, heavily utilizing CSS Variables for a customizable glassmorphism dark-mode aesthetic.
- `/components`:
  - `CameraGrid.jsx`: The main dashboard view, rendering a dynamic CSS grid of live snapshots.
  - `CameraDetail.jsx`: The full-screen modal that shows a live stream and a timeline. It plays standard `.mp4` recordings natively in the browser.
  - `Settings.jsx`: The admin dashboard for managing users, SSO, cameras, and system variables.
  - `Login.jsx`: Handles local authentication and redirects for Single Sign-On (SSO).

### Building the Frontend:
When changes are made to the frontend, it must be rebuilt so the backend can serve the static files.
```bash
cd frontend
npm run build
```
The backend `main.py` is configured to serve the `/frontend/dist` folder at the root `/` URL.

---

## 4. Authentication & Security
- **Local Auth:** Users are stored in `users` with hashed passwords and salts. Sessions are stored in a `sessions` table and verified via cookies or local storage tokens.
- **SSO Auth:** OIDC/OAuth2 is supported natively. When an SSO login succeeds, `main.py` provisions a local user with the `viewer` role and an `external_id` mapped to their SSO identity.
- **Credential Storage:** RTSP and PTZ passwords for cameras are encrypted in the SQLite database to prevent plaintext credential exposure in case the `nvr.db` file is compromised.

---

## 5. Troubleshooting Guide
- **Cameras won't load:** Check `backend/nvr.db` using a SQLite viewer to ensure the `main_url` and `sub_url` RTSP streams are correct. Ensure `ffmpeg` is installed on the host system and available in the system PATH.
- **UI looks broken after an update:** Run `npm run build` in the `/frontend` directory to regenerate the static bundle, then refresh your browser.
- **Locked out of the system:** You can manually run a python script to insert a new admin user into `backend/nvr.db`, or just modify the database directly via a SQLite viewer tool.
