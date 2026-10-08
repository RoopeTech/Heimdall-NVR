# Heimdall NVR Home Assistant Integration

This custom component allows **Home Assistant** to connect to your **Heimdall NVR** server.

## 🚀 Features

* **Camera Platform**: Automatically discovers all cameras from your Heimdall NVR server. Supports live MJPEG streaming and RTSP stream sources for the Home Assistant stream engine and Google Cast. Snapshot previews are also available.
* **Motion Binary Sensors**: Creates individual motion binary sensors (`binary_sensor.<camera_name>_motion`) that show `on` for 25 seconds after a motion event is logged, enabling automations.
* **Server Health Sensors**: Reports three system metrics:
  - `sensor.<nvr_name>_total_cameras` — total configured cameras
  - `sensor.<nvr_name>_active_cameras` — currently active cameras
  - `sensor.<nvr_name>_retention_days` — global recording retention setting
* **Config Flow**: Easy setup via the Home Assistant Web UI.

---

## 🛠️ Installation Instructions

### Method 1: Manual Copy (Recommended)

1. Copy the `heimdall_nvr` folder into your Home Assistant's `custom_components` directory:
   ```text
   <home-assistant-config>/custom_components/heimdall_nvr/
   ```
2. Restart Home Assistant.
3. In Home Assistant, navigate to **Settings → Devices & Services → Add Integration**.
4. Search for **Heimdall NVR**.
5. Enter your Heimdall NVR Server URL (e.g., `http://192.168.1.100:8000`), Username, and Password.

---

### Method 2: HACS (Home Assistant Community Store)

1. Go to **HACS → Integrations**.
2. Click the 3 dots in the top right corner and choose **Custom Repositories**.
3. Add `https://github.com/RoopeTech/Heimdall-NVR` and select category **Integration**.
4. Click **Install**.
5. Restart Home Assistant and add the integration via **Settings → Devices & Services**.

---

## 📺 Adding Cameras to Lovelace Dashboard

Add a standard **Picture Glance** or **Picture Entity** card:

```yaml
type: picture-glance
title: Front Yard Camera
camera_image: camera.front_yard
entities:
  - binary_sensor.front_yard_motion
camera_view: live
```

### Using the RTSP Stream (Higher Quality)

For better quality, use the stream source instead of MJPEG:

```yaml
type: picture-entity
entity: camera.front_yard
camera_view: live
```

Home Assistant will use the RTSP stream source provided by the integration for Google Cast and the built-in stream engine.

---

## ⚡ Motion Automation Example

Trigger an automation when motion is detected:

```yaml
alias: Motion Detected - Notify
trigger:
  - platform: state
    entity_id: binary_sensor.front_yard_motion
    to: "on"
action:
  - service: notify.mobile_app
    data:
      message: "Motion detected at Front Yard"
```

---

## 📂 Entity Naming Convention

| Entity | Description |
| :--- | :--- |
| `camera.<camera_name>` | Camera entity with MJPEG stream, snapshots, and RTSP source |
| `binary_sensor.<camera_name>_motion` | Motion sensor (active for 25s after event) |
| `sensor.<nvr_name>_total_cameras` | Total configured cameras on the NVR |
| `sensor.<nvr_name>_active_cameras` | Currently active (enabled) cameras |
| `sensor.<nvr_name>_retention_days` | Global recording retention days |

All entities register under a **Heimdall NVR Server** Hub device in the Home Assistant device registry.
