# Changelog

All notable changes to the NVR project will be documented in this file.

## [1.1.0] - 2026-07-01

### Added
- **Live Audio & WebRTC**: Overhauled the live streaming engine to use `go2rtc` for ultra-low latency WebRTC streaming with full audio support!
- **Recorded Audio**: Recordings now convert and preserve the raw camera audio into AAC format so they can be played natively in the browser.
- **Cross-Platform Auto-Installer**: The backend now features a fully automated bootstrapping script that downloads the correct static `ffmpeg` and `go2rtc` binaries for your OS (Windows, Linux, macOS) on first launch. No manual dependencies required!
- **Streaming Fallback Setting**: Added a "Streaming Engine" toggle to the Settings page. Users who encounter issues with WebRTC can easily uncheck this box to instantly fall back to the legacy MJPEG engine.

## [1.0.2] - 2026-07-01

### Fixed
- **Settings UI Layout**: Fixed a bug where extremely long camera stream URLs would stretch the container and push the Edit/Duplicate/Delete action buttons completely off the right edge of the screen.

## [1.0.1] - 2026-07-01

### Added
- **Stream Quality Profiles**: Added a quality toggle (HD, SD, Low) in the Camera Detail view for optimized remote viewing on poor cellular connections.
- **Azure Entra SSO Integration**: Added support for importing Federation Metadata XML for one-click OIDC configuration, along with a setup guide UI.
- **Website Stream Type**: Added support for embedding external websites or web apps via iframes in the camera grid.

### Changed
- **Adaptive Polling**: Switched the frontend streaming engine from rigid timers to asynchronous loops to prevent request pile-ups and bandwidth exhaustion on high-latency networks.
- **Unified Archives**: Merged the Event Log into the Recordings Archive tab for a more seamless playback experience.
- **Semantic Versioning**: Migrated the internal update engine to use standard Semantic Versioning (SemVer) and added an integrated Changelog viewer in the Settings UI!

### Fixed
- **Browser Video Scrubbing (HTTP 206)**: The backend API was rewritten to fully support HTTP Range requests (`206 Partial Content`). Browsers will now flawlessly seek and scrub video files!
- **Timeline Gaps**: Clicking an empty space on the timeline now intelligently snaps the playhead back to the nearest preceding recording segment (similar to Blue Iris) instead of dumping you into Live View.
- **Archive Navigation**: Selecting a recording in the archive now automatically scrolls smoothly to the top of the page so the player is immediately visible.
- **System Updates**: The application update logic now gracefully handles environments where `npm` is missing without crashing.
