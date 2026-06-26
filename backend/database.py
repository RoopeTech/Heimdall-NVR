import sqlite3
import os
import hashlib
import secrets
import base64
from datetime import datetime

try:
    from cryptography.fernet import Fernet
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
except ImportError:
    pass

# Password Hashing Helpers
def hash_password(password: str, salt: str = None) -> tuple[str, str]:
    if not salt:
        salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    )
    return key.hex(), salt

def verify_password(password: str, salt: str, password_hash: str) -> bool:
    h, _ = hash_password(password, salt)
    return h == password_hash

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
        ptz_type TEXT DEFAULT 'onvif',        -- 'onvif' | 'foscam_cgi' | 'foscam_hd'
        motion_enabled INTEGER DEFAULT 1,
        motion_sensitivity INTEGER DEFAULT 50, -- 1-100 (smaller = more sensitive / lower area threshold)
        motion_threshold INTEGER DEFAULT 25,   -- 1-100 (pixel intensity diff threshold)
        pre_roll INTEGER DEFAULT 0,            -- in seconds
        post_roll INTEGER DEFAULT 5,           -- in seconds
        record_mode TEXT DEFAULT 'motion',     -- 'motion' | 'always' | 'hybrid'
        rtsp_user TEXT,
        rtsp_pass TEXT,
        osd_enabled INTEGER DEFAULT 1,
        archive_days INTEGER DEFAULT 0,
        archive_path TEXT
    )
    """)
    
    # Migration: add ptz_type to existing databases
    try:
        cursor.execute("ALTER TABLE cameras ADD COLUMN ptz_type TEXT DEFAULT 'onvif'")
        conn.commit()
    except sqlite3.OperationalError:
        pass # Column already exists
        
    # Migration: add record_mode to existing databases
    try:
        cursor.execute("ALTER TABLE cameras ADD COLUMN record_mode TEXT DEFAULT 'motion'")
        conn.commit()
    except sqlite3.OperationalError:
        pass # Column already exists
        
    # Migration: add rtsp_user and rtsp_pass to existing databases
    try:
        cursor.execute("ALTER TABLE cameras ADD COLUMN rtsp_user TEXT")
        cursor.execute("ALTER TABLE cameras ADD COLUMN rtsp_pass TEXT")
        conn.commit()
    except sqlite3.OperationalError:
        pass # Columns already exist

    # Migration: add osd_enabled to existing databases
    try:
        cursor.execute("ALTER TABLE cameras ADD COLUMN osd_enabled INTEGER DEFAULT 1")
        conn.commit()
    except sqlite3.OperationalError:
        pass # Column already exists
        
    # Migration: add archive_days and archive_path to existing databases
    try:
        cursor.execute("ALTER TABLE cameras ADD COLUMN archive_days INTEGER DEFAULT 0")
        cursor.execute("ALTER TABLE cameras ADD COLUMN archive_path TEXT")
        conn.commit()
    except sqlite3.OperationalError:
        pass # Columns already exist

    # Migration: add web_ui_path to existing databases
    try:
        cursor.execute("ALTER TABLE cameras ADD COLUMN web_ui_path TEXT DEFAULT '/'")
        conn.commit()
    except sqlite3.OperationalError:
        pass # Column already exists

    # Migration: add stream_type and image_url and image_refresh_interval to existing databases
    try:
        cursor.execute("ALTER TABLE cameras ADD COLUMN stream_type TEXT DEFAULT 'rtsp'")
        conn.commit()
    except sqlite3.OperationalError:
        pass # Column already exists
    try:
        cursor.execute("ALTER TABLE cameras ADD COLUMN image_url TEXT")
        conn.commit()
    except sqlite3.OperationalError:
        pass # Column already exists
    try:
        cursor.execute("ALTER TABLE cameras ADD COLUMN image_refresh_interval INTEGER DEFAULT 3600")
        conn.commit()
    except sqlite3.OperationalError:
        pass # Column already exists

    
    # Create recordings table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS recordings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        camera_id INTEGER NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT,
        duration REAL,
        filepath TEXT NOT NULL,
        is_archived INTEGER DEFAULT 0,
        FOREIGN KEY (camera_id) REFERENCES cameras (id) ON DELETE CASCADE
    )
    """)
    
    # Migration: add is_archived to recordings table
    try:
        cursor.execute("ALTER TABLE recordings ADD COLUMN is_archived INTEGER DEFAULT 0")
        conn.commit()
    except sqlite3.OperationalError:
        pass # Column already exists
    
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
    
    # Create system_settings table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )
    """)
    
    # Create users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer'
    )
    """)
    
    # Create sessions table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
    """)

    # Create camera_groups table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS camera_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        sort_order INTEGER DEFAULT 0
    )
    """)

    # Create camera_group_members table (many-to-many)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS camera_group_members (
        group_id INTEGER NOT NULL,
        camera_id INTEGER NOT NULL,
        PRIMARY KEY (group_id, camera_id),
        FOREIGN KEY (group_id) REFERENCES camera_groups (id) ON DELETE CASCADE,
        FOREIGN KEY (camera_id) REFERENCES cameras (id) ON DELETE CASCADE
    )
    """)

    conn.commit()

    # Seed default admin user
    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] == 0:
        pwd_hash, salt = hash_password("admin")
        cursor.execute(
            "INSERT INTO users (username, password_hash, salt, role) VALUES (?, ?, ?, ?)",
            ("admin", pwd_hash, salt, "admin")
        )
        conn.commit()

    # Insert default settings
    cursor.execute("SELECT COUNT(*) FROM system_settings WHERE key = 'app_title'")
    if cursor.fetchone()[0] == 0:
        cursor.execute("INSERT INTO system_settings (key, value) VALUES ('app_title', 'Heimdall NVR')")
        conn.commit()
        
    cursor.execute("SELECT COUNT(*) FROM system_settings WHERE key = 'retention_days'")
    if cursor.fetchone()[0] == 0:
        cursor.execute("INSERT INTO system_settings (key, value) VALUES ('retention_days', '0')")
        conn.commit()
    
    # Insert default mock camera if database is brand new
    cursor.execute("SELECT COUNT(*) FROM cameras")
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
        INSERT INTO cameras (name, main_url, sub_url, ptz_ip, ptz_port, ptz_user, ptz_pass, ptz_type, motion_enabled, motion_sensitivity, motion_threshold)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            "Mock Camera 1",
            "mock://camera1_main",
            "mock://camera1_sub",
            "127.0.0.1",
            80,
            "admin",
            "admin",
            "onvif",
            1,
            50,
            25
        ))
        conn.commit()
        
    conn.close()

# ── Camera Group CRUD ──────────────────────────────────────────────────────────

def get_groups():
    """Return all groups with their member camera IDs."""
    conn = get_db_connection()
    groups = [dict(row) for row in conn.execute(
        "SELECT * FROM camera_groups ORDER BY sort_order, name"
    ).fetchall()]
    for g in groups:
        rows = conn.execute(
            "SELECT camera_id FROM camera_group_members WHERE group_id = ?",
            (g['id'],)
        ).fetchall()
        g['camera_ids'] = [r['camera_id'] for r in rows]
    conn.close()
    return groups

def add_group(name: str) -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO camera_groups (name) VALUES (?)", (name,))
    conn.commit()
    gid = cursor.lastrowid
    conn.close()
    return gid

def update_group(group_id: int, name: str):
    conn = get_db_connection()
    conn.execute("UPDATE camera_groups SET name = ? WHERE id = ?", (name, group_id))
    conn.commit()
    conn.close()

def delete_group(group_id: int):
    conn = get_db_connection()
    # ON DELETE CASCADE handles camera_group_members cleanup
    conn.execute("DELETE FROM camera_groups WHERE id = ?", (group_id,))
    conn.commit()
    conn.close()

def set_group_members(group_id: int, camera_ids: list):
    """Replace all camera members for a group."""
    conn = get_db_connection()
    conn.execute("DELETE FROM camera_group_members WHERE group_id = ?", (group_id,))
    for cid in camera_ids:
        conn.execute(
            "INSERT OR IGNORE INTO camera_group_members (group_id, camera_id) VALUES (?, ?)",
            (group_id, cid)
        )
    conn.commit()
    conn.close()

# ── Camera CRUD Operations ─────────────────────────────────────────────────────
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
    INSERT INTO cameras (name, main_url, sub_url, ptz_ip, ptz_port, ptz_user, ptz_pass, ptz_type, motion_enabled, motion_sensitivity, motion_threshold, pre_roll, post_roll, record_mode, rtsp_user, rtsp_pass, osd_enabled, web_ui_path, stream_type, image_url, image_refresh_interval)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        camera_data['name'], camera_data.get('main_url', ''), camera_data.get('sub_url', ''),
        camera_data.get('ptz_ip'), camera_data.get('ptz_port'), camera_data.get('ptz_user'), camera_data.get('ptz_pass'),
        camera_data.get('ptz_type', 'onvif'),
        camera_data.get('motion_enabled', 1), camera_data.get('motion_sensitivity', 50),
        camera_data.get('motion_threshold', 25), camera_data.get('pre_roll', 0), camera_data.get('post_roll', 5),
        camera_data.get('record_mode', 'motion'),
        camera_data.get('rtsp_user'), camera_data.get('rtsp_pass'),
        camera_data.get('osd_enabled', 1),
        camera_data.get('web_ui_path', '/'),
        camera_data.get('stream_type', 'rtsp'),
        camera_data.get('image_url'),
        camera_data.get('image_refresh_interval', 3600)
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
    SET name=?, main_url=?, sub_url=?, ptz_ip=?, ptz_port=?, ptz_user=?, ptz_pass=?, ptz_type=?,
        motion_enabled=?, motion_sensitivity=?, motion_threshold=?, pre_roll=?, post_roll=?, record_mode=?, rtsp_user=?, rtsp_pass=?, osd_enabled=?, web_ui_path=?,
        stream_type=?, image_url=?, image_refresh_interval=?
    WHERE id=?
    """, (
        camera_data['name'], camera_data.get('main_url', ''), camera_data.get('sub_url', ''),
        camera_data.get('ptz_ip'), camera_data.get('ptz_port'), camera_data.get('ptz_user'), camera_data.get('ptz_pass'),
        camera_data.get('ptz_type', 'onvif'),
        camera_data.get('motion_enabled', 1), camera_data.get('motion_sensitivity', 50),
        camera_data.get('motion_threshold', 25), camera_data.get('pre_roll', 0), camera_data.get('post_roll', 5),
        camera_data.get('record_mode', 'motion'),
        camera_data.get('rtsp_user'), camera_data.get('rtsp_pass'),
        camera_data.get('osd_enabled', 1),
        camera_data.get('web_ui_path', '/'),
        camera_data.get('stream_type', 'rtsp'),
        camera_data.get('image_url'),
        camera_data.get('image_refresh_interval', 3600),
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

def get_recording_by_filename(filename):
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM recordings WHERE filepath = ?", (filename,)).fetchone()
    conn.close()
    return dict(row) if row else None

def get_recordings_to_archive(camera_id, cutoff_time):
    conn = get_db_connection()
    query = "SELECT * FROM recordings WHERE camera_id = ? AND start_time < ? AND is_archived = 0"
    rows = conn.execute(query, (camera_id, cutoff_time)).fetchall()
    conn.close()
    return [dict(row) for row in rows]

def mark_recording_archived(recording_id):
    conn = get_db_connection()
    conn.execute("UPDATE recordings SET is_archived = 1 WHERE id = ?", (recording_id,))
    conn.commit()
    conn.close()

def get_expired_recordings(cutoff_time):
    conn = get_db_connection()
    expired = [dict(row) for row in conn.execute("SELECT * FROM recordings WHERE start_time < ?", (cutoff_time,)).fetchall()]
    conn.close()
    return expired

def delete_recording(recording_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM recordings WHERE id = ?", (recording_id,))
    conn.commit()
    conn.close()
    return True

def get_cipher(password: str, salt: bytes):
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(password.encode()))
    return Fernet(key)

def export_config(encryption_password=None):
    conn = get_db_connection()
    cameras = [dict(row) for row in conn.execute("SELECT * FROM cameras").fetchall()]
    settings = [dict(row) for row in conn.execute("SELECT * FROM system_settings").fetchall()]
    users = [dict(row) for row in conn.execute("SELECT * FROM users").fetchall()]
    conn.close()
    
    is_encrypted = False
    salt_b64 = None
    
    if encryption_password:
        salt = os.urandom(16)
        salt_b64 = base64.b64encode(salt).decode('utf-8')
        f = get_cipher(encryption_password, salt)
        
        for cam in cameras:
            if cam.get('rtsp_pass'):
                cam['rtsp_pass'] = f.encrypt(cam['rtsp_pass'].encode('utf-8')).decode('utf-8')
            if cam.get('ptz_pass'):
                cam['ptz_pass'] = f.encrypt(cam['ptz_pass'].encode('utf-8')).decode('utf-8')
        is_encrypted = True

    return {
        "cameras": cameras,
        "system_settings": settings,
        "users": users,
        "is_encrypted": is_encrypted,
        "salt": salt_b64
    }

def import_config(config_data, decryption_password=None):
    if not isinstance(config_data, dict):
        return False, "Invalid backup file format"
    if "cameras" not in config_data or "system_settings" not in config_data:
        return False, "Backup file missing required configuration tables"
        
    if config_data.get("is_encrypted"):
        if not decryption_password:
            return False, "Backup is encrypted but no password was provided"
        try:
            salt = base64.b64decode(config_data["salt"])
            f = get_cipher(decryption_password, salt)
            for cam in config_data["cameras"]:
                if cam.get('rtsp_pass'):
                    cam['rtsp_pass'] = f.decrypt(cam['rtsp_pass'].encode('utf-8')).decode('utf-8')
                if cam.get('ptz_pass'):
                    cam['ptz_pass'] = f.decrypt(cam['ptz_pass'].encode('utf-8')).decode('utf-8')
        except Exception:
            return False, "Failed to decrypt backup (incorrect password or corrupted file)"

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # 1. Restore cameras
        cursor.execute("DELETE FROM cameras")
        for cam in config_data["cameras"]:
            cursor.execute("""
            INSERT INTO cameras (id, name, main_url, sub_url, ptz_ip, ptz_port, ptz_user, ptz_pass, ptz_type, motion_enabled, motion_sensitivity, motion_threshold, pre_roll, post_roll, record_mode, rtsp_user, rtsp_pass, osd_enabled, archive_days, archive_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                cam.get('id'), cam['name'], cam['main_url'], cam['sub_url'],
                cam.get('ptz_ip'), cam.get('ptz_port'), cam.get('ptz_user'), cam.get('ptz_pass'),
                cam.get('ptz_type', 'onvif'),
                cam.get('motion_enabled', 1), cam.get('motion_sensitivity', 50),
                cam.get('motion_threshold', 25), cam.get('pre_roll', 0), cam.get('post_roll', 5),
                cam.get('record_mode', 'motion'),
                cam.get('rtsp_user'), cam.get('rtsp_pass'),
                cam.get('osd_enabled', 1),
                cam.get('archive_days', 0), cam.get('archive_path')
            ))
            
        # 2. Restore system settings
        cursor.execute("DELETE FROM system_settings")
        for setting in config_data["system_settings"]:
            cursor.execute(
                "INSERT INTO system_settings (key, value) VALUES (?, ?)",
                (setting['key'], setting['value'])
            )
            
        # 3. Restore users
        if "users" in config_data and isinstance(config_data["users"], list) and len(config_data["users"]) > 0:
            cursor.execute("DELETE FROM users")
            for usr in config_data["users"]:
                cursor.execute(
                    "INSERT INTO users (id, username, password_hash, salt, role) VALUES (?, ?, ?, ?, ?)",
                    (usr.get('id'), usr['username'], usr['password_hash'], usr['salt'], usr['role'])
                )
        conn.commit()
        return True, "Success"
    except Exception as e:
        conn.rollback()
        return False, f"Database import error: {str(e)}"
    finally:
        conn.close()

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

def get_events(camera_id=None, date=None, limit=100):
    conn = get_db_connection()
    query = "SELECT events.*, cameras.name as camera_name FROM events JOIN cameras ON events.camera_id = cameras.id"
    params = []
    conditions = []
    if camera_id is not None:
        conditions.append("events.camera_id = ?")
        params.append(camera_id)
    if date is not None:
        conditions.append("DATE(events.timestamp) = ?")
        params.append(date)
        
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
        
    query += " ORDER BY timestamp DESC LIMIT ?"
    params.append(limit)
    events = [dict(row) for row in conn.execute(query, params).fetchall()]
    conn.close()
    return events

# System Settings Operations
def get_system_setting(key):
    conn = get_db_connection()
    row = conn.execute("SELECT value FROM system_settings WHERE key = ?", (key,)).fetchone()
    conn.close()
    return row['value'] if row else None

def set_system_setting(key, value):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)", (key, value))
    conn.commit()
    conn.close()

# User CRUD Operations
def create_user(username, password, role='viewer'):
    conn = get_db_connection()
    cursor = conn.cursor()
    pwd_hash, salt = hash_password(password)
    try:
        cursor.execute(
            "INSERT INTO users (username, password_hash, salt, role) VALUES (?, ?, ?, ?)",
            (username, pwd_hash, salt, role)
        )
        user_id = cursor.lastrowid
        conn.commit()
    except sqlite3.IntegrityError:
        user_id = None
    finally:
        conn.close()
    return user_id

def get_user_by_username(username):
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    conn.close()
    return dict(row) if row else None

def get_user(user_id):
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def get_users():
    conn = get_db_connection()
    rows = conn.execute("SELECT id, username, role FROM users").fetchall()
    conn.close()
    return [dict(row) for row in rows]

def update_user(user_id, username, role, password=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    if password:
        pwd_hash, salt = hash_password(password)
        cursor.execute(
            "UPDATE users SET username = ?, role = ?, password_hash = ?, salt = ? WHERE id = ?",
            (username, role, pwd_hash, salt, user_id)
        )
    else:
        cursor.execute(
            "UPDATE users SET username = ?, role = ? WHERE id = ?",
            (username, role, user_id)
        )
    conn.commit()
    count = cursor.rowcount
    conn.close()
    return count > 0

def delete_user(user_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    count = cursor.rowcount
    conn.close()
    return count > 0

# Session CRUD Operations
def create_session(user_id, token, expires_at):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (token, user_id, datetime.now().isoformat(), expires_at)
    )
    conn.commit()
    conn.close()

def get_session_user(token):
    conn = get_db_connection()
    now_str = datetime.now().isoformat()
    row = conn.execute(
        """
        SELECT users.id, users.username, users.role 
        FROM sessions 
        JOIN users ON sessions.user_id = users.id 
        WHERE sessions.token = ? AND sessions.expires_at > ?
        """,
        (token, now_str)
    ).fetchone()
    conn.close()
    return dict(row) if row else None

def delete_session(token):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()

def clean_expired_sessions():
    conn = get_db_connection()
    cursor = conn.cursor()
    now_str = datetime.now().isoformat()
    cursor.execute("DELETE FROM sessions WHERE expires_at < ?", (now_str,))
    conn.commit()
    conn.close()
