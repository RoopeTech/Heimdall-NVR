# AI Object Detection Implementation Plan

Adding AI object detection to the NVR is the best way to eliminate false positives (like wind, shadows, or bugs) and ensure you only get notified when something important—like a person or a vehicle—is actually there.

## Proposed Architecture: OpenCV DNN + YOLOv8 ONNX

Instead of installing massive, bloated machine learning libraries like PyTorch or TensorFlow, we can use a highly optimized approach:
1. **YOLOv8 Nano**: The current state-of-the-art lightweight model for real-time object detection.
2. **ONNX Format**: We will use a pre-exported `.onnx` version of YOLOv8.
3. **OpenCV DNN**: Because we are already using `cv2` (OpenCV) for our video streams, OpenCV has a built-in `dnn` module that can natively run ONNX models on the CPU extremely fast without requiring *any* new heavy dependencies.

## Detection Pipeline (Two-Stage Approach)

Running an AI model on a 30 FPS stream 24/7 requires immense computing power. To keep the NVR extremely lightweight and capable of running on low-end hardware, we will use a **Two-Stage Pipeline**:

1. **Stage 1 (Motion Trigger)**: We continue using the existing, ultra-fast `MOG2` pixel-change motion detection.
2. **Stage 2 (AI Verification)**: When `MOG2` detects motion, it immediately pauses and sends that single frame to the AI model. The AI scans the frame for specific objects (e.g., Person, Car, Dog).
3. **Result**: If the AI finds a matching object, the recording and webhooks are triggered. If it finds nothing (e.g., it was just a tree shadow moving), the event is silently discarded.

## Proposed Changes

### 1. Database & Settings
- Add new `system_settings` variables:
  - `ai_detection_enabled` (boolean)
  - `ai_confidence_threshold` (e.g., `0.5` for 50%)
  - `ai_target_classes` (comma-separated list, e.g., `person,car,truck,dog,cat,bird`)

### 2. Backend Model Manager (`backend/ai_detector.py`) [NEW]
- Create a new module that automatically downloads the `yolov8n.onnx` file (and `classes.txt`) on first startup if it doesn't exist.
- Wraps `cv2.dnn.readNetFromONNX()` to load the model.
- Provides a function `detect_objects(frame, threshold)` that returns a list of bounding boxes and labels found in the image.

### 3. Integration (`backend/camera_manager.py`)
- Inject the AI verification step directly after the existing `_update_motion_state` threshold check.
- If AI is enabled, the camera thread asks the `ai_detector` to scan the frame. If a target object is detected, it draws a bounding box on the frame, logs the specific object found, and starts the recording.

### 4. Frontend Settings (`frontend/src/components/Settings.jsx`)
- Add an **"AI Object Detection"** configuration section.
- Allow users to toggle AI on/off, set the confidence slider, and use checkboxes to select which objects they care about (People, Vehicles, Animals, etc.).

> [!IMPORTANT]
> **Performance Considerations**
> Because this relies on the CPU, running inference on multiple cameras simultaneously during a major motion event (like a storm) might cause a small CPU spike. The two-stage pipeline largely mitigates this, but it's something to keep in mind for lower-end CPUs.

> [!WARNING]
> **Webhooks & Snapshots**
> By drawing the AI bounding boxes directly onto the frames, the snapshot sent to your Discord/Telegram will clearly show a box around the intruder, making notifications incredibly useful!

## Open Questions

1. **Hardware Acceleration**: For now, this will run purely on the CPU using OpenCV. Do you have a dedicated NVIDIA GPU or Google Coral you plan to use in the future, or is a highly-optimized CPU approach ideal for your setup?
2. **Recording Delay**: Passing a frame to the AI might take ~100-300ms on a CPU. The recording will start a fraction of a second later than pure pixel motion. Is this acceptable, or would you prefer we buffer the previous few seconds of video to ensure the "pre-roll" is always captured?
