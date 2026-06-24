import sqlite3
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "nvr.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create cameras table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS cameras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        main_url TEXT NOT NULL,
        sub_url TEXT NOT NULL,
        ptz_ip TEXT,
        ptz_port INTEGER,
        ptz_user TEXT,
        ptz_pass TEXT,
        motion_enabled INTEGER DEFAULT 1,
        motion_sensitivity INTEGER DEFAULT 50, -- 1-100 (smaller = more sensitive / lower area threshold)
        motion_threshold INTEGER DEFAULT 25,   -- 1-100 (pixel intensity diff threshold)
        pre_roll INTEGER DEFAULT 0,            -- in seconds
        post_roll INTEGER DEFAULT 5            -- in seconds
    )
    """)
    
    # Create recordings table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS recordings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        camera_id INTEGER NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT,
        duration REAL,
        filepath TEXT NOT NULL,
        FOREIGN KEY (camera_id) REFERENCES cameras (id) ON DELETE CASCADE
    )
    """)
    
    # Create events table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        camera_id INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        event_type TEXT NOT NULL,
        details TEXT,
        FOREIGN KEY (camera_id) REFERENCES cameras (id) ON DELETE CASCADE
    )
    """)
    
    conn.commit()
    
    # Insert default mock camera if database is brand new
    cursor.execute("SELECT COUNT(*) FROM cameras")
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
        INSERT INTO cameras (name, main_url, sub_url, ptz_ip, ptz_port, ptz_user, ptz_pass, motion_enabled, motion_sensitivity, motion_threshold)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            "Mock Camera 1",
            "mock://camera1_main",
            "mock://camera1_sub",
            "127.0.0.1",
            80,
            "admin",
            "admin",
            1,
            50,
            25
        ))
        conn.commit()
        
    conn.close()

# Camera CRUD Operations
def get_cameras():
    conn = get_db_connection()
    cameras = [dict(row) for row in conn.execute("SELECT * FROM cameras").fetchall()]
    conn.close()
    return cameras

def get_camera(camera_id):
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM cameras WHERE id = ?", (camera_id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def add_camera(camera_data):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO cameras (name, main_url, sub_url, ptz_ip, ptz_port, ptz_user, ptz_pass, motion_enabled, motion_sensitivity, motion_threshold, pre_roll, post_roll)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        camera_data['name'], camera_data['main_url'], camera_data['sub_url'],
        camera_data.get('ptz_ip'), camera_data.get('ptz_port'), camera_data.get('ptz_user'), camera_data.get('ptz_pass'),
        camera_data.get('motion_enabled', 1), camera_data.get('motion_sensitivity', 50),
        camera_data.get('motion_threshold', 25), camera_data.get('pre_roll', 0), camera_data.get('post_roll', 5)
    ))
    camera_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return camera_id

def update_camera(camera_id, camera_data):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    UPDATE cameras
    SET name=?, main_url=?, sub_url=?, ptz_ip=?, ptz_port=?, ptz_user=?, ptz_pass=?,
        motion_enabled=?, motion_sensitivity=?, motion_threshold=?, pre_roll=?, post_roll=?
    WHERE id=?
    """, (
        camera_data['name'], camera_data['main_url'], camera_data['sub_url'],
        camera_data.get('ptz_ip'), camera_data.get('ptz_port'), camera_data.get('ptz_user'), camera_data.get('ptz_pass'),
        camera_data.get('motion_enabled', 1), camera_data.get('motion_sensitivity', 50),
        camera_data.get('motion_threshold', 25), camera_data.get('pre_roll', 0), camera_data.get('post_roll', 5),
        camera_id
    ))
    conn.commit()
    conn.close()
    return cursor.rowcount > 0

def delete_camera(camera_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM cameras WHERE id=?", (camera_id,))
    conn.commit()
    conn.close()
    return cursor.rowcount > 0

# Recordings Operations
def add_recording(camera_id, filepath, start_time=None):
    if not start_time:
        start_time = datetime.now().isoformat()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO recordings (camera_id, start_time, filepath)
    VALUES (?, ?, ?)
    """, (camera_id, start_time, filepath))
    recording_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return recording_id

def update_recording_end(recording_id, end_time=None, duration=None):
    if not end_time:
        end_time = datetime.now().isoformat()
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if duration is None:
        # Calculate duration based on start_time
        row = cursor.execute("SELECT start_time FROM recordings WHERE id=?", (recording_id,)).fetchone()
        if row:
            start = datetime.fromisoformat(row['start_time'])
            end = datetime.fromisoformat(end_time)
            duration = (end - start).total_seconds()
            
    cursor.execute("""
    UPDATE recordings
    SET end_time=?, duration=?
    WHERE id=?
    """, (end_time, duration, recording_id))
    conn.commit()
    conn.close()
    return duration

def get_recordings(camera_id=None, date_str=None):
    # date_str: YYYY-MM-DD
    conn = get_db_connection()
    query = "SELECT * FROM recordings"
    params = []
    
    conditions = []
    if camera_id is not None:
        conditions.append("camera_id = ?")
        params.append(camera_id)
    if date_str is not None:
        conditions.append("date(start_time) = date(?)")
        params.append(date_str)
        
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
        
    query += " ORDER BY start_time DESC"
    
    recordings = [dict(row) for row in conn.execute(query, params).fetchall()]
    conn.close()
    return recordings

# Events Operations
def log_event(camera_id, event_type, details=None):
    timestamp = datetime.now().isoformat()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO events (camera_id, timestamp, event_type, details)
    VALUES (?, ?, ?, ?)
    """, (camera_id, timestamp, event_type, details))
    conn.commit()
    conn.close()

def get_events(camera_id=None, limit=100):
    conn = get_db_connection()
    query = "SELECT events.*, cameras.name as camera_name FROM events JOIN cameras ON events.camera_id = cameras.id"
    params = []
    if camera_id is not None:
        query += " WHERE events.camera_id = ?"
        params.append(camera_id)
    query += " ORDER BY timestamp DESC LIMIT ?"
    params.append(limit)
    events = [dict(row) for row in conn.execute(query, params).fetchall()]
    conn.close()
    return events
