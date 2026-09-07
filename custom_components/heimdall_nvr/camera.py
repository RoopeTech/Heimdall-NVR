"""Support for Heimdall NVR cameras."""
import logging
from typing import Optional, Dict, Any, List

from homeassistant.components.camera import Camera, CameraEntityFeature
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .api import HeimdallApiClient

_LOGGER = logging.getLogger(__name__)

async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Heimdall NVR camera entities from config entry."""
    api: HeimdallApiClient = hass.data[DOMAIN][entry.entry_id]

    try:
        raw_cameras = await api.async_get_cameras()
    except Exception as err:
        _LOGGER.error("Failed to fetch cameras from Heimdall NVR: %s", err)
        return

    server_device_id: Optional[str] = None
    if hasattr(dr, "async_get_device_id_by_identifier"):
        try:
            server_device_id = dr.async_get_device_id_by_identifier(
                hass, (DOMAIN, entry.entry_id), config_entry_id=entry.entry_id
            )
        except ValueError:
            pass
    if not server_device_id:
        device_registry = dr.async_get(hass)
        device_entry = device_registry.async_get_device(
            identifiers={(DOMAIN, entry.entry_id)}
        )
        if device_entry:
            server_device_id = device_entry.id

    entities = [
        HeimdallCamera(api, cam, entry.entry_id, via_device_id=server_device_id)
        for cam in raw_cameras
    ]
    async_add_entities(entities, update_before_add=True)

class HeimdallCamera(Camera):
    """Representation of a Heimdall NVR camera entity."""

    _attr_supported_features = CameraEntityFeature.STREAM

    def __init__(
        self,
        api: HeimdallApiClient,
        camera_data: Dict[str, Any],
        entry_id: str,
        via_device_id: Optional[str] = None,
    ) -> None:
        """Initialize the camera entity."""
        super().__init__()
        self.api = api
        self._entry_id = entry_id
        self._via_device_id = via_device_id
        self._cam_id: int = camera_data["id"]
        self._name: str = camera_data.get("name", f"Camera {self._cam_id}")
        self._camera_data = camera_data

        self._attr_name = self._name
        self._attr_unique_id = f"heimdall_nvr_{entry_id}_cam_{self._cam_id}"

    @property
    def device_info(self) -> DeviceInfo:
        """Return device information for Home Assistant device registry."""
        info = DeviceInfo(
            identifiers={(DOMAIN, f"{self._entry_id}_cam_{self._cam_id}")},
            name=self._name,
            manufacturer="Heimdall NVR",
            model=f"IP Camera ({self._camera_data.get('recording_mode', 'standard')})",
        )
        if self._via_device_id:
            info["via_device_id"] = self._via_device_id
        return info

    @property
    def is_on(self) -> bool:
        """Return true if camera is active."""
        return bool(self._camera_data.get("is_active", 1))

    @property
    def is_recording(self) -> bool:
        """Return true if camera is actively recording."""
        mode = self._camera_data.get("recording_mode", "view_only")
        return mode in ["continuous", "motion", "hybrid"]

    @property
    def extra_state_attributes(self) -> Dict[str, Any]:
        """Return additional camera details as attributes."""
        return {
            "camera_id": self._cam_id,
            "recording_mode": self._camera_data.get("recording_mode"),
            "sub_url": self._camera_data.get("sub_url"),
            "ptz_enabled": bool(self._camera_data.get("ptz_enabled", 0)),
            "ptz_protocol": self._camera_data.get("ptz_protocol"),
        }

    async def async_camera_image(
        self, width: Optional[int] = None, height: Optional[int] = None
    ) -> Optional[bytes]:
        """Return a still JPEG frame image from the camera."""
        return await self.api.async_get_snapshot(self._cam_id, hq=True)

    async def handle_async_mjpeg_stream(self, request):
        """Generate live MJPEG stream response."""
        return await super().handle_async_mjpeg_stream(request)

    @property
    def mjpeg_stream_url(self) -> str:
        """Return the URL for the MJPEG stream from Heimdall NVR."""
        return self.api.get_live_stream_url(self._cam_id)

    async def stream_source(self) -> Optional[str]:
        """Return the RTSP stream URL for Home Assistant stream engine & Google Cast."""
        main_url = self._camera_data.get("main_url") or self._camera_data.get("sub_url")
        user = self._camera_data.get("rtsp_user")
        password = self._camera_data.get("rtsp_pass")

        if not main_url:
            return None

        # Inject credentials into RTSP URL if separated in database
        if user and password and main_url.startswith("rtsp://") and "@" not in main_url:
            raw_host_path = main_url[7:]
            main_url = f"rtsp://{user}:{password}@{raw_host_path}"

        return main_url

    async def async_update(self) -> None:
        """Update camera metadata from NVR."""
        try:
            cameras = await self.api.async_get_cameras()
            for cam in cameras:
                if cam["id"] == self._cam_id:
                    self._camera_data = cam
                    self._attr_name = cam.get("name", self._name)
                    break
        except Exception as err:
            _LOGGER.warning("Could not update state for camera %s: %s", self._cam_id, err)
