import uvicorn
from fastapi import FastAPI, HTTPException, Response, Query, Depends, Request, Cookie, Header
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import os
import threading
import webbrowser
import time
from datetime import datetime
from typing import Optional

import database
import camera_manager
import httpx
import re
from urllib.parse import urlparse

# Authentication Dependencies
def get_current_user(
    request: Request,
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    actual_token = token
    if not actual_token and authorization:
        if authorization.startswith("Bearer "):
            actual_token = authorization[7:]
    if not actual_token and session_token:
        actual_token = session_token
        
    if not actual_token:
        raise HTTPException(status_code=401, detail="Authentication token missing")
        
    user = database.get_session_user(actual_token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session token")
        
    user["token"] = actual_token
    return user

def require_admin(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

app = FastAPI(title="Heimdall NVR API")

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Startup event
@app.on_event("startup")
async def startup_event():
    global proxy_client
    proxy_client = httpx.AsyncClient(verify=False)
    database.init_db()
    camera_manager.manager.start_all()

# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    camera_manager.manager.stop_all()
    if proxy_client:
        await proxy_client.aclose()

# Live Video Stream (MJPEG)
@app.get("/api/cameras/{camera_id}/live")
async def get_live_stream(request: Request, camera_id: int, raw: bool = False, current_user: dict = Depends(get_current_user)):
    camera = database.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
        
    async def frame_generator():
        import asyncio
        last_jpeg = None
        no_frame_count = 0
        while True:
            if await request.is_disconnected():
                break
                
            if raw:
                frame = camera_manager.manager.get_latest_frame(camera_id, draw_boxes=False)
                if frame is not None:
                    import cv2
                    ret, jpeg = cv2.imencode('.jpg', frame)
                    if ret:
                        last_jpeg = jpeg.tobytes()
                        yield (b'--frame\r\n'
                               b'Content-Type: image/jpeg\r\n\r\n' + last_jpeg + b'\r\n\r\n')
            else:
                jpeg_bytes = camera_manager.manager.get_latest_jpeg(camera_id)
                if jpeg_bytes is not None and jpeg_bytes != last_jpeg:
                    last_jpeg = jpeg_bytes
                    no_frame_count = 0
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + jpeg_bytes + b'\r\n\r\n')
                elif jpeg_bytes is None:
                    # No frame yet (camera still connecting) — yield placeholder every 2s
                    # so the browser always receives data and never shows a blank/broken image
                    no_frame_count += 1
                    if no_frame_count % 25 == 1: # every ~2s at 80ms interval
                        thread = camera_manager.manager.threads.get(camera_id)
                        if thread and thread.latest_jpeg_bytes:
                            placeholder = thread.latest_jpeg_bytes
                            yield (b'--frame\r\n'
                                   b'Content-Type: image/jpeg\r\n\r\n' + placeholder + b'\r\n\r\n')
                           
            await asyncio.sleep(0.08) # ~12 FPS for UI grid to conserve resources

    headers = {
        # Prevent any intermediary (nginx, CDN, browser cache) from buffering the stream
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "X-Accel-Buffering": "no",  # Disable nginx proxy buffering
    }
    return StreamingResponse(
        frame_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers=headers
    )

# Single-frame JPEG Snapshot (used by frontend polling instead of MJPEG <img>)
# ?hq=true  \u2192 returns full-resolution JPEG (used by the detail/modal view)
# ?hq=false \u2192 returns 640px-wide downscaled thumbnail (used by the camera grid)
@app.get("/api/cameras/{camera_id}/snapshot")
async def get_snapshot(camera_id: int, hq: bool = False, current_user: dict = Depends(get_current_user)):
    camera = database.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    if hq:
        jpeg_bytes = camera_manager.manager.get_latest_hq_jpeg(camera_id)
    else:
        jpeg_bytes = camera_manager.manager.get_latest_jpeg(camera_id)

    if jpeg_bytes is None:
        # Camera thread exists but hasn't produced a frame yet — return placeholder
        thread = camera_manager.manager.threads.get(camera_id)
        if thread and thread.latest_jpeg_bytes:
            jpeg_bytes = thread.latest_jpeg_bytes

    if jpeg_bytes is None:
        raise HTTPException(status_code=503, detail="No frame available yet")

    return Response(
        content=jpeg_bytes,
        media_type="image/jpeg",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
        }
    )

# ── Camera Group Endpoints ────────────────────────────────────────────────────

@app.get("/api/groups")
def list_groups(current_user: dict = Depends(get_current_user)):
    return database.get_groups()

@app.post("/api/groups")
def create_group(data: dict, current_user: dict = Depends(require_admin)):
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Group name required")
    try:
        gid = database.add_group(name)
    except Exception:
        raise HTTPException(status_code=409, detail="Group name already exists")
    return {"id": gid, "name": name, "camera_ids": []}

@app.put("/api/groups/{group_id}")
def update_group(group_id: int, data: dict, current_user: dict = Depends(require_admin)):
    name = data.get("name", "").strip()
    camera_ids = data.get("camera_ids", None)
    if name:
        database.update_group(group_id, name)
    if camera_ids is not None:
        database.set_group_members(group_id, camera_ids)
    return {"ok": True}

@app.delete("/api/groups/{group_id}")
def delete_group(group_id: int, current_user: dict = Depends(require_admin)):
    database.delete_group(group_id)
    return {"ok": True}

# PTZ Control Endpoint
@app.post("/api/cameras/{camera_id}/ptz")
def ptz_control(camera_id: int, data: dict, current_user: dict = Depends(get_current_user)):
    # data: { action: "move"|"stop", pan: -1..1, tilt: -1..1, zoom: 1..3 }
    action = data.get("action")
    pan = float(data.get("pan", 0.0))
    tilt = float(data.get("tilt", 0.0))
    zoom = float(data.get("zoom", 1.0))
    
    success = camera_manager.manager.ptz_control(camera_id, action, pan, tilt, zoom)
    return {"success": success}

# Toggle Mock Motion Simulation
@app.post("/api/cameras/{camera_id}/mock_motion")
def toggle_mock_motion(camera_id: int, data: dict, admin: dict = Depends(require_admin)):
    enabled = bool(data.get("enabled", True))
    success = camera_manager.manager.set_mock_motion(camera_id, enabled)
    return {"success": success}

# Camera CRUD API
@app.get("/api/cameras")
def list_cameras(current_user: dict = Depends(get_current_user)):
    return database.get_cameras()

@app.get("/api/cameras/{camera_id}")
def get_camera(camera_id: int, current_user: dict = Depends(get_current_user)):
    camera = database.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    return camera

def sanitize_and_extract_rtsp(url):
    """
    Extracts credentials from an RTSP URL if present, and returns (cleaned_url, user, password).
    If no credentials are in the URL, returns (url, None, None).
    """
    if not url or not url.startswith("rtsp://"):
        return url, None, None
        
    raw_url = url[7:] # strip rtsp://
    if "@" in raw_url:
        try:
            auth_part, host_part = raw_url.split("@", 1)
            if ":" in auth_part:
                user, password = auth_part.split(":", 1)
                import urllib.parse
                user = urllib.parse.unquote(user)
                password = urllib.parse.unquote(password)
                cleaned_url = f"rtsp://{host_part}"
                return cleaned_url, user, password
            else:
                import urllib.parse
                user = urllib.parse.unquote(auth_part)
                cleaned_url = f"rtsp://{host_part}"
                return cleaned_url, user, None
        except Exception:
            pass
            
    return url, None, None

def process_camera_data(data: dict):
    # Process main_url and sub_url to extract credentials if present
    main_url = data.get('main_url', '')
    sub_url = data.get('sub_url', '')
    
    cleaned_main, main_user, main_pass = sanitize_and_extract_rtsp(main_url)
    cleaned_sub, sub_user, sub_pass = sanitize_and_extract_rtsp(sub_url)
    
    # Use explicitly submitted credentials, or fall back to what we parsed from URLs
    rtsp_user = data.get('rtsp_user') or main_user or sub_user
    rtsp_pass = data.get('rtsp_pass') or main_pass or sub_pass
    
    data['main_url'] = cleaned_main
    data['sub_url'] = cleaned_sub
    data['rtsp_user'] = rtsp_user or None
    data['rtsp_pass'] = rtsp_pass or None
    return data

@app.post("/api/cameras")
def add_camera(data: dict, admin: dict = Depends(require_admin)):
    # Validate required fields
    required = ["name", "main_url", "sub_url"]
    for r in required:
        if r not in data:
            raise HTTPException(status_code=400, detail=f"Missing field: {r}")
            
    processed_data = process_camera_data(data)
    cid = database.add_camera(processed_data)
    camera_manager.manager.reload_camera(cid)
    return {"id": cid, "message": "Camera added"}

@app.put("/api/cameras/{camera_id}")
def update_camera(camera_id: int, data: dict, admin: dict = Depends(require_admin)):
    camera = database.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
        
    processed_data = process_camera_data(data)
    database.update_camera(camera_id, processed_data)
    camera_manager.manager.reload_camera(camera_id)
    return {"message": "Camera updated"}

@app.delete("/api/cameras/{camera_id}")
def delete_camera(camera_id: int, admin: dict = Depends(require_admin)):
    camera = database.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
        
    camera_manager.manager.stop_camera(camera_id)
    database.delete_camera(camera_id)
    return {"message": "Camera deleted"}

# Recordings API
@app.get("/api/recordings")
def list_recordings(
    camera_id: int = Query(None),
    date: str = Query(None), # YYYY-MM-DD
    current_user: dict = Depends(get_current_user)
):
    return database.get_recordings(camera_id, date)

@app.get("/api/recordings/play/{filename}")
def play_recording(filename: str, current_user: dict = Depends(get_current_user)):
    # Check if the file is archived
    recording = database.get_recording_by_filename(filename)
    
    if recording and recording.get('is_archived', 0) == 1:
        # File is on NAS / archive
        cam = database.get_camera(recording['camera_id'])
        if not cam or not cam.get('archive_path'):
            raise HTTPException(status_code=500, detail="Archive path configuration missing")
        filepath = os.path.join(cam['archive_path'], filename)
    else:
        # File is local
        filepath = os.path.join(camera_manager.RECORDINGS_DIR, filename)
        
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Recording file not found")
    return FileResponse(filepath, media_type="video/mp4")

# Events API
@app.get("/api/events")
def list_events(camera_id: int = Query(None), date: str = Query(None), limit: int = 100, current_user: dict = Depends(get_current_user)):
    return database.get_events(camera_id, date, limit)

# System Settings API
@app.get("/api/settings")
def get_system_settings(current_user: dict = Depends(get_current_user)):
    return {
        "app_title": database.get_system_setting("app_title") or "Heimdall NVR",
        "retention_days": database.get_system_setting("retention_days") or "0"
    }

@app.post("/api/settings")
def save_system_settings(data: dict, admin: dict = Depends(require_admin)):
    if "app_title" in data:
        database.set_system_setting("app_title", data["app_title"])
    if "retention_days" in data:
        database.set_system_setting("retention_days", str(data["retention_days"]))
    return {"success": True}

@app.get("/api/settings/backup")
def backup_settings(admin: dict = Depends(require_admin)):
    return database.export_config()

@app.post("/api/settings/restore")
def restore_settings(data: dict, admin: dict = Depends(require_admin)):
    success, message = database.import_config(data)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    # Reload camera manager threads to load the imported configuration immediately
    camera_manager.manager.stop_all()
    camera_manager.manager.start_all()
    return {"success": True}

@app.get("/api/settings/check_update")
def check_update(current_user: dict = Depends(get_current_user)):
    import subprocess
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    try:
        # Run git fetch origin to update remote references
        subprocess.run(["git", "fetch", "origin"], cwd=project_root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=8)
        # Get local commit hash
        local_commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=project_root, text=True).strip()
        # Get remote master commit hash
        remote_commit = subprocess.check_output(["git", "rev-parse", "origin/master"], cwd=project_root, text=True).strip()
        
        return {
            "update_available": local_commit != remote_commit,
            "local_commit": local_commit[:7],
            "remote_commit": remote_commit[:7]
        }
    except Exception as e:
        return {
            "update_available": False,
            "local_commit": "unknown",
            "remote_commit": "unknown",
            "error": str(e)
        }

@app.post("/api/settings/apply_update")
def apply_update(admin: dict = Depends(require_admin)):
    import subprocess
    import signal
    import time
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    try:
        # 1. Pull latest code from remote master branch
        pull_res = subprocess.run(["git", "pull", "origin", "master"], cwd=project_root, capture_output=True, text=True, timeout=20)
        if pull_res.returncode != 0:
            raise HTTPException(status_code=500, detail=f"Git pull failed: {pull_res.stderr}")
            
        # 2. Recompile frontend static bundle in the background
        frontend_dir = os.path.join(project_root, "frontend")
        npm_cmd = "npm.cmd" if os.name == 'nt' else "npm"
        subprocess.run([npm_cmd, "run", "build"], cwd=frontend_dir, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=40)
        
        # 3. Schedule server process termination in 1.5 seconds.
        # Running under systemd (with Restart=always) or a wrapper daemon will restart it automatically.
        def restart_server():
            time.sleep(1.5)
            print("[Update] Terminating NVR process to trigger restart...")
            os.kill(os.getpid(), signal.SIGTERM)
            
        threading.Thread(target=restart_server, daemon=True).start()
        
        return {"success": True, "message": "Update pulled and compiled successfully. Server is restarting..."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Authentication APIs
@app.post("/api/auth/login")
def login(data: dict, response: Response):
    username = data.get("username")
    password = data.get("password")
    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password required")
        
    user = database.get_user_by_username(username)
    if not user or not database.verify_password(password, user["salt"], user["password_hash"]):
        raise HTTPException(status_code=400, detail="Invalid username or password")
        
    import secrets
    from datetime import timedelta
    token = secrets.token_hex(32)
    expiry = (datetime.now() + timedelta(days=30)).isoformat()
    database.create_session(user["id"], token, expiry)
    
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=2592000 # 30 days
    )
    
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "role": user["role"]
        }
    }

@app.post("/api/auth/logout")
def logout(response: Response, current_user: dict = Depends(get_current_user)):
    token = current_user.get("token")
    if token:
        database.delete_session(token)
    response.delete_cookie(key="session_token")
    return {"success": True}

@app.get("/api/auth/me")
def get_me(current_user: dict = Depends(get_current_user)):
    return {
        "id": current_user["id"],
        "username": current_user["username"],
        "role": current_user["role"]
    }

@app.post("/api/auth/change_password")
def change_password(data: dict, current_user: dict = Depends(get_current_user)):
    current_pwd = data.get("current_password")
    new_pwd = data.get("new_password")
    if not current_pwd or not new_pwd:
        raise HTTPException(status_code=400, detail="Current and new password required")
        
    user = database.get_user(current_user["id"])
    if not user or not database.verify_password(current_pwd, user["salt"], user["password_hash"]):
        raise HTTPException(status_code=400, detail="Invalid current password")
        
    database.update_user(user["id"], user["username"], user["role"], password=new_pwd)
    return {"success": True}

# User Management APIs (Admin-Only)
@app.get("/api/users")
def list_users(admin: dict = Depends(require_admin)):
    return database.get_users()

@app.post("/api/users")
def add_user(data: dict, admin: dict = Depends(require_admin)):
    username = data.get("username")
    password = data.get("password")
    role = data.get("role", "viewer")
    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password required")
    if role not in ["admin", "viewer"]:
        raise HTTPException(status_code=400, detail="Invalid role. Must be 'admin' or 'viewer'")
        
    existing = database.get_user_by_username(username)
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
        
    uid = database.create_user(username, password, role)
    if uid is None:
        raise HTTPException(status_code=500, detail="Failed to create user")
    return {"id": uid, "message": "User created successfully"}

@app.put("/api/users/{user_id}")
def update_user_route(user_id: int, data: dict, admin: dict = Depends(require_admin)):
    username = data.get("username")
    role = data.get("role")
    password = data.get("password")
    
    if not username or not role:
        raise HTTPException(status_code=400, detail="Username and role required")
    if role not in ["admin", "viewer"]:
        raise HTTPException(status_code=400, detail="Invalid role")
        
    if user_id == admin["id"] and role != "admin":
        raise HTTPException(status_code=400, detail="Admins cannot change their own role")
        
    success = database.update_user(user_id, username, role, password=password)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    return {"success": True}

@app.delete("/api/users/{user_id}")
def delete_user_route(user_id: int, admin: dict = Depends(require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Admins cannot delete themselves")
    success = database.delete_user(user_id)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    return {"success": True}

# HTTP Proxy Implementation
proxy_client = None

@app.middleware("http")
async def proxy_middleware(request: Request, call_next):
    if request.url.path.startswith("/api/proxy/"):
        return await call_next(request)
        
    referer = request.headers.get("referer")
    if referer and "/api/proxy/" in referer:
        match = re.search(r'/api/proxy/(\d+)', referer)
        if match:
            camera_id = int(match.group(1))
            camera = database.get_camera(camera_id)
            if camera:
                parsed = urlparse(camera["main_url"])
                target_host = parsed.hostname
                target_port = 80 if parsed.scheme == "rtsp" else (parsed.port or 80)
                target_scheme = "http"
                
                target_url = f"http://{target_host}:{target_port}{request.url.path}"
                if request.url.query:
                    target_url += f"?{request.url.query}"
                    
                headers = dict(request.headers)
                headers.pop("host", None)
                headers.pop("referer", None)
                
                body = await request.body()
                if not body:
                    body = None
                    headers.pop("content-length", None)
                
                try:
                    req = proxy_client.build_request(
                        request.method,
                        target_url,
                        headers=headers,
                        content=body
                    )
                    
                    resp = await proxy_client.send(req, stream=True)
                    return StreamingResponse(
                        resp.aiter_raw(),
                        status_code=resp.status_code,
                        headers=resp.headers
                    )
                except Exception as e:
                    import traceback
                    print(f"[Proxy Middleware] Error: {e}")
                    return Response(content=f"Proxy Error: {str(e)}\n\n{traceback.format_exc()}", status_code=502)
                
    return await call_next(request)

@app.api_route("/api/proxy/{camera_id}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def camera_proxy_base(camera_id: int, request: Request, current_user: dict = Depends(get_current_user)):
    return await camera_proxy(camera_id, "", request, current_user)

@app.api_route("/api/proxy/{camera_id}/", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def camera_proxy_slash(camera_id: int, request: Request, current_user: dict = Depends(get_current_user)):
    return await camera_proxy(camera_id, "", request, current_user)

@app.api_route("/api/proxy/{camera_id}/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def camera_proxy(camera_id: int, path: str, request: Request, current_user: dict = Depends(get_current_user)):
    camera = database.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
        
    parsed = urlparse(camera["main_url"])
    target_host = parsed.hostname
    target_port = 80 if parsed.scheme == "rtsp" else (parsed.port or 80)
    target_scheme = "http"
    
    target_url = f"http://{target_host}:{target_port}/{path}"
    if request.url.query:
        target_url += f"?{request.url.query}"
        
    headers = dict(request.headers)
    headers.pop("host", None)
    
    body = await request.body()
    if not body:
        body = None
        headers.pop("content-length", None)
    
    try:
        req = proxy_client.build_request(
            request.method,
            target_url,
            headers=headers,
            content=body
        )
        
        resp = await proxy_client.send(req, stream=True)
        return StreamingResponse(
            resp.aiter_raw(),
            status_code=resp.status_code,
            headers=resp.headers
        )
    except Exception as e:
        import traceback
        print(f"[Camera Proxy] Error: {e}")
        return Response(content=f"Proxy Error: {str(e)}\n\n{traceback.format_exc()}", status_code=502)

# Serve Frontend static assets
frontend_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")

if os.path.exists(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")
else:
    @app.get("/")
    def index_fallback():
        return {
            "message": "NVR Backend Running. Frontend dist directory not found. Please compile frontend first."
        }

def start_server():
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="warning")

def launch_ui():
    url = "http://127.0.0.1:8000"
    
    # Wait for server to boot
    time.sleep(1.5)
    
    webview_launched = False
    try:
        import webview
        print("[NVR] Launching PyWebView Local UI window...")
        title = database.get_system_setting("app_title") or "Heimdall IP Camera NVR Dashboard"
        webview.create_window(title, url, width=1280, height=800)
        webview.start()
        webview_launched = True
    except Exception as e:
        print(f"[NVR] PyWebView failed to launch ({e}). Falling back to browser...")
        
    if not webview_launched:
        webbrowser.open(url)

if __name__ == "__main__":
    import sys
    is_headless = "--headless" in sys.argv or os.environ.get("NVR_HEADLESS") == "1"
    
    if is_headless:
        print("[NVR] Running in Headless Mode on main thread.")
        start_server()
    else:
        # Start server in a background thread so webview can run on main thread (required on macOS/Windows/Linux)
        server_thread = threading.Thread(target=start_server, daemon=True)
        server_thread.start()
        
        # Launch UI (webview or web browser fallback) on the main thread
        launch_ui()
