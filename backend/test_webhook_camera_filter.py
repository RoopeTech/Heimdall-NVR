import pytest
import os
import sqlite3
import database
import notifications

def test_webhook_camera_filter_default(tmp_path, monkeypatch):
    test_db = str(tmp_path / "test_nvr.db")
    monkeypatch.setattr(database, "DB_PATH", test_db)
    database.init_db()

    # Verify default setting is 'all'
    setting = database.get_system_setting("webhook_enabled_cameras")
    assert setting == "all"

def test_webhook_camera_filter_behavior(tmp_path, monkeypatch):
    test_db = str(tmp_path / "test_nvr.db")
    monkeypatch.setattr(database, "DB_PATH", test_db)
    database.init_db()

    # Track notifications sent
    sent_notifications = []

    def mock_send_discord(webhook_url, message, video_path, snapshot_bytes, file_size_mb):
        sent_notifications.append(("discord", message))

    def mock_send_telegram(token, chat_id, message, video_path, snapshot_bytes, file_size_mb):
        sent_notifications.append(("telegram", message))

    monkeypatch.setattr(notifications, "_send_discord", mock_send_discord)
    monkeypatch.setattr(notifications, "_send_telegram", mock_send_telegram)
    database.set_system_setting("discord_webhook_url", "http://example.com/webhook")

    # Case 1: Default ('all') -> Camera 1 & Camera 2 both trigger alerts
    database.set_system_setting("webhook_enabled_cameras", "all")
    notifications._process_notifications("Front Door", None, None, camera_id=1)
    assert len(sent_notifications) == 1
    assert "Front Door" in sent_notifications[0][1]

    notifications._process_notifications("Backyard", None, None, camera_id=2)
    assert len(sent_notifications) == 2
    assert "Backyard" in sent_notifications[1][1]

    # Case 2: Only Camera 1 enabled -> Camera 2 is filtered out
    sent_notifications.clear()
    database.set_system_setting("webhook_enabled_cameras", "1")
    notifications._process_notifications("Front Door", None, None, camera_id=1)
    assert len(sent_notifications) == 1

    notifications._process_notifications("Backyard", None, None, camera_id=2)
    assert len(sent_notifications) == 1 # still 1 because camera_id=2 was skipped

    # Case 3: Multiple cameras enabled '1, 3'
    sent_notifications.clear()
    database.set_system_setting("webhook_enabled_cameras", "1,3")
    notifications._process_notifications("Garage", None, None, camera_id=3)
    assert len(sent_notifications) == 1

    notifications._process_notifications("Backyard", None, None, camera_id=2)
    assert len(sent_notifications) == 1 # still 1
