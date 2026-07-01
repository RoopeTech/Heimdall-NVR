# Changelog

All notable changes to the NVR project will be documented in this file.

## [Unreleased]

### Added
- **Stream Quality Profiles**: Added a quality toggle (HD, SD, Low) in the Camera Detail view for optimized remote viewing on poor cellular connections.
- **Azure Entra SSO Integration**: Added support for importing Federation Metadata XML for one-click OIDC configuration, along with a setup guide UI.
- **Website Stream Type**: Added support for embedding external websites or web apps via iframes in the camera grid.

### Changed
- **Adaptive Polling**: Switched the frontend streaming engine from rigid timers to asynchronous loops to prevent request pile-ups and bandwidth exhaustion on high-latency networks.
- **Unified Archives**: Merged the Event Log into the Recordings Archive tab for a more seamless playback experience.

### Fixed
- **Timeline Scrubbing**: Fixed an issue where clicking on the timeline would fail to scrub the video playback due to authentication tokens in the stream URL.
- **Archive Navigation**: Selecting a recording in the archive now automatically scrolls smoothly to the top of the page so the player is immediately visible.
- **System Updates**: The application update logic now gracefully handles environments where `npm` is missing without crashing.
