# Heimdall NVR Home Assistant Integration

This custom component allows **Home Assistant** to connect to your **Heimdall NVR (RTNVR)** server.

## 🚀 Features

* **Camera Platform**: Automatically discovers all cameras from your Heimdall NVR server and presents live video feeds (MJPEG) and snapshot previews in Home Assistant.
* **Motion Sensors**: Creates individual motion binary sensors (`binary_sensor.<camera_name>_motion`) for triggering automations.
* **Server Health Sensors**: Reports total camera count, active cameras, and storage retention settings.
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
3. Add your Heimdall NVR repository URL and select category **Integration**.
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
