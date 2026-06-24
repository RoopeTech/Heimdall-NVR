import uvicorn
from fastapi import FastAPI, HTTPException, Response, Query
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import os
import threading
import webbrowser
import time
from datetime import datetime

import database
import camera_manager

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
def get_live_stream(camera_id: int, raw: bool = False):
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
def ptz_control(camera_id: int, data: dict):
    # data: { action: "move"|"stop", pan: -1..1, tilt: -1..1, zoom: 1..3 }
    action = data.get("action")
    pan = float(data.get("pan", 0.0))
    tilt = float(data.get("tilt", 0.0))
    zoom = float(data.get("zoom", 1.0))
    
    success = camera_manager.manager.ptz_control(camera_id, action, pan, tilt, zoom)
    return {"success": success}

# Toggle Mock Motion Simulation
@app.post("/api/cameras/{camera_id}/mock_motion")
def toggle_mock_motion(camera_id: int, data: dict):
    enabled = bool(data.get("enabled", True))
    success = camera_manager.manager.set_mock_motion(camera_id, enabled)
    return {"success": success}

# Camera CRUD API
@app.get("/api/cameras")
def list_cameras():
    return database.get_cameras()

@app.get("/api/cameras/{camera_id}")
def get_camera(camera_id: int):
    camera = database.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    return camera

@app.post("/api/cameras")
def add_camera(data: dict):
    # Validate required fields
    required = ["name", "main_url", "sub_url"]
    for r in required:
        if r not in data:
            raise HTTPException(status_code=400, detail=f"Missing field: {r}")
            
    cid = database.add_camera(data)
    camera_manager.manager.reload_camera(cid)
    return {"id": cid, "message": "Camera added"}

@app.put("/api/cameras/{camera_id}")
def update_camera(camera_id: int, data: dict):
    camera = database.get_camera(camera_id)
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
        
    database.update_camera(camera_id, data)
    camera_manager.manager.reload_camera(camera_id)
    return {"message": "Camera updated"}

@app.delete("/api/cameras/{camera_id}")
def delete_camera(camera_id: int):
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
    date: str = Query(None) # YYYY-MM-DD
):
    return database.get_recordings(camera_id, date)

@app.get("/api/recordings/play/{filename}")
def play_recording(filename: str):
    filepath = os.path.join(camera_manager.RECORDINGS_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Recording file not found")
    return FileResponse(filepath, media_type="video/mp4")

# Events API
@app.get("/api/events")
def list_events(camera_id: int = Query(None), limit: int = 100):
    return database.get_events(camera_id, limit)

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
        webview.create_window("Antigravity IP Camera NVR Dashboard", url, width=1280, height=800)
        webview.start()
        webview_launched = True
    except Exception as e:
        print(f"[NVR] PyWebView failed to launch ({e}). Falling back to browser...")
        
    if not webview_launched:
        webbrowser.open(url)

if __name__ == "__main__":
    # Start server in a background thread so webview can run on main thread (required on macOS/Windows/Linux)
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()
    
    # Launch UI (webview or web browser fallback) on the main thread
    launch_ui()
