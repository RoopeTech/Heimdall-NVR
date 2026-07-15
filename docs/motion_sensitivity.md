# Understanding Motion Sensitivity in Heimdall NVR

Heimdall NVR utilizes OpenCV to analyze camera streams and detect motion in real-time. This guide explains how the sensitivity settings work under the hood and how to tune them effectively for your environment.

## How Motion Detection Works

To maximize CPU efficiency, Heimdall NVR employs a lightweight analysis pipeline rather than a heavy AI neural network. 

1. **Downscaling:** The live stream (specifically the secondary `sub_url` stream) is captured and resized down to a 320x240 frame. This provides enough pixel density to catch motion without bogging down the server.
2. **Grayscale & Blurring:** The frame is converted to black and white, and a heavy Gaussian blur is applied to smooth out tiny noise or static artifacts from the camera sensor.
3. **Background Subtraction:** The system continuously compares the current frame against a running "background model." 
4. **Contour Area Measurement:** Any significant differences are grouped into "contours" (shapes). The system calculates the physical area (number of pixels) of these shapes.

## The Sensitivity Slider (1 - 100)

The **Motion Sensitivity** setting (configurable per-camera from 1 to 100) directly dictates the **minimum contour area** required to trigger an event. It maps inversely to pixel area:

*   **Sensitivity 1 (Lowest):** The system requires a massive pixel change to trigger motion. Internally, a contour must be nearly `5,000` pixels large on the downscaled frame. This is useful for ignoring everything except large vehicles or people walking directly in front of the lens.
*   **Sensitivity 50 (Default):** A balanced middle ground requiring around `2,500` pixels of change. This generally ignores swaying branches but catches people and cars.
*   **Sensitivity 100 (Highest):** The system requires an incredibly small pixel change. A contour only needs to be `50` pixels large. At this setting, small bugs, heavy rain, or light changes will easily trigger a motion event.

### The Math
If you are curious, the exact internal formula used is:
`Minimum Area = 5000 - (Sensitivity * 49.5)`

## Tuning Your Cameras

Because every camera has a different field of view (FOV) and distance from the target, **there is no universal sensitivity setting.**

*   **Wide-angle / Distant Cameras:** A person 50 feet away on a wide-angle camera will occupy very few pixels. You will need a **higher sensitivity (70-90)** to detect them.
*   **Narrow / Close-up Cameras:** A person walking up to a porch camera will occupy the entire frame. You can afford a **lower sensitivity (20-40)** to prevent false positives from wind or rain.

## Record Modes

*   **Motion Mode:** If motion is detected based on your sensitivity threshold, an event is logged and recording begins immediately. It will continue recording until the motion stops, plus the configurable **Post-Roll** duration (default 10 seconds).
*   **Hybrid Mode:** The camera records 24/7 without interruption, but the motion detection pipeline still runs to log "Motion Events" in the timeline for easy scrubbing.
*   **Always Mode:** Records 24/7, but the OpenCV motion detection pipeline is completely disabled for that camera to achieve near-zero CPU usage.
