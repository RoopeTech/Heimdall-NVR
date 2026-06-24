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

app = FastAPI(title="Antigravity NVR API")

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
def startup_event():
    database.init_db()
    camera_manager.manager.start_all()

# Shutdown event
@app.on_event("shutdown")
def shutdown_event():
    camera_manager.manager.stop_all()

# Live Video Stream (MJPEG)
@app.get("/api/cameras/{camera_id}/live")
def get_live_stream(camera_id: int, raw: bool = False, current_user: dict = Depends(get_current_user)):
    camera = database.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
        
    def frame_generator():
        # Get frame from manager
        while True:
            # draw_boxes=True draws red motion overlays on sub-stream
            frame = camera_manager.manager.get_latest_frame(camera_id, draw_boxes=not raw)
            if frame is not None:
                import cv2
                ret, jpeg = cv2.imencode('.jpg', frame)
                if ret:
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n\r\n')
            time.sleep(0.08) # ~12 FPS for UI grid to conserve resources

    return StreamingResponse(
        frame_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

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
    filepath = os.path.join(camera_manager.RECORDINGS_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Recording file not found")
    return FileResponse(filepath, media_type="video/mp4")

# Events API
@app.get("/api/events")
def list_events(camera_id: int = Query(None), limit: int = 100, current_user: dict = Depends(get_current_user)):
    return database.get_events(camera_id, limit)

# System Settings API
@app.get("/api/settings")
def get_system_settings(current_user: dict = Depends(get_current_user)):
    return {
        "app_title": database.get_system_setting("app_title") or "Antigravity NVR"
    }

@app.post("/api/settings")
def save_system_settings(data: dict, admin: dict = Depends(require_admin)):
    if "app_title" in data:
        database.set_system_setting("app_title", data["app_title"])
    return {"success": True}

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
        title = database.get_system_setting("app_title") or "Antigravity IP Camera NVR Dashboard"
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
