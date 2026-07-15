import os
import threading
import httpx
import database
import io

def send_motion_notification_async(camera_name, video_path, snapshot_bytes):
    """
    Spawns a background thread to send notifications.
    """
    thread = threading.Thread(
        target=_process_notifications,
        args=(camera_name, video_path, snapshot_bytes),
        daemon=True
    )
    thread.start()

def send_test_notification(discord_webhook, telegram_token, telegram_chat, notif_service, notif_media):
    message = "✅ Heimdall NVR: Test Notification Successful!"
    
    # We won't send an actual video, just a dummy image so they can verify media uploads if enabled
    dummy_image = None
    if notif_media in ["picture", "both"]:
        try:
            import cv2
            import numpy as np
            img = np.zeros((360, 640, 3), dtype=np.uint8)
            img[:] = (20, 15, 10)
            cv2.putText(img, "TEST NOTIFICATION", (160, 190), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 0), 2)
            _, buf = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 80])
            dummy_image = buf.tobytes()
        except:
            pass

    def _run_test():
        if discord_webhook and notif_service in ["discord", "both"]:
            _send_discord(discord_webhook, message, None, dummy_image, 0)
            
        if telegram_token and telegram_chat and notif_service in ["telegram", "both"]:
            _send_telegram(telegram_token, telegram_chat, message, None, dummy_image, 0)
            
    threading.Thread(target=_run_test, daemon=True).start()

def _process_notifications(camera_name, video_path, snapshot_bytes):
    discord_webhook = database.get_system_setting("discord_webhook_url")
    telegram_token = database.get_system_setting("telegram_bot_token")
    telegram_chat = database.get_system_setting("telegram_chat_id")
    notif_service = database.get_system_setting("notification_service") or "both"
    notif_media = database.get_system_setting("notification_media") or "both"
    
    # Filter media based on user preference
    if notif_media == "picture":
        video_path = None
    elif notif_media == "video":
        snapshot_bytes = None
        
    file_size_mb = 0
    if video_path and os.path.exists(video_path):
        file_size_mb = os.path.getsize(video_path) / (1024 * 1024)
        
    message = f"🚨 **Motion Detected** on camera **{camera_name}**!"
    
    if discord_webhook and notif_service in ["discord", "both"]:
        _send_discord(discord_webhook, message, video_path, snapshot_bytes, file_size_mb)
        
    if telegram_token and telegram_chat and notif_service in ["telegram", "both"]:
        _send_telegram(telegram_token, telegram_chat, message, video_path, snapshot_bytes, file_size_mb)

def _send_discord(webhook_url, message, video_path, snapshot_bytes, file_size_mb):
    try:
        # Discord free limit is typically 8MB
        if video_path and file_size_mb < 8.0:
            with open(video_path, 'rb') as f:
                files = {'file': (os.path.basename(video_path), f, 'video/mp4')}
                httpx.post(webhook_url, data={'content': message}, files=files, timeout=30.0)
        else:
            # Fallback to snapshot
            msg = message
            if file_size_mb >= 8.0:
                msg += f"\n*(Video was {file_size_mb:.1f}MB, which exceeds Discord limits. Showing snapshot instead. Check NVR for full video.)*"
            
            if snapshot_bytes:
                files = {'file': ('snapshot.jpg', snapshot_bytes, 'image/jpeg')}
                httpx.post(webhook_url, data={'content': msg}, files=files, timeout=15.0)
            else:
                httpx.post(webhook_url, json={'content': msg}, timeout=10.0)
    except Exception as e:
        print(f"Error sending Discord webhook: {e}")

def _send_telegram(token, chat_id, message, video_path, snapshot_bytes, file_size_mb):
    try:
        # Telegram limit for bot API is 50MB
        if video_path and file_size_mb < 49.5:
            url = f"https://api.telegram.org/bot{token}/sendVideo"
            with open(video_path, 'rb') as f:
                files = {'video': (os.path.basename(video_path), f, 'video/mp4')}
                data = {'chat_id': chat_id, 'caption': message}
                res = httpx.post(url, data=data, files=files, timeout=60.0)
                
                if res.status_code != 200:
                    # Fallback to photo if video rejected for some other reason
                    _send_telegram_photo(token, chat_id, message + "\n*(Video upload failed)*", snapshot_bytes)
        else:
            msg = message
            if file_size_mb >= 49.5:
                msg += f"\n*(Video was {file_size_mb:.1f}MB, exceeding Telegram limits. Check NVR for full video.)*"
            _send_telegram_photo(token, chat_id, msg, snapshot_bytes)
    except Exception as e:
        print(f"Error sending Telegram webhook: {e}")

def _send_telegram_photo(token, chat_id, message, snapshot_bytes):
    try:
        if snapshot_bytes:
            url = f"https://api.telegram.org/bot{token}/sendPhoto"
            files = {'photo': ('snapshot.jpg', snapshot_bytes, 'image/jpeg')}
            data = {'chat_id': chat_id, 'caption': message}
            httpx.post(url, data=data, files=files, timeout=15.0)
        else:
            url = f"https://api.telegram.org/bot{token}/sendMessage"
            data = {'chat_id': chat_id, 'text': message}
            httpx.post(url, data=data, timeout=10.0)
    except Exception as e:
        print(f"Error sending Telegram photo/message: {e}")
