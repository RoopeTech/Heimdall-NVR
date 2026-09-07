"""Support for Heimdall NVR motion binary sensors."""
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
)
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
    """Set up Heimdall NVR motion binary sensor entities."""
    api: HeimdallApiClient = hass.data[DOMAIN][entry.entry_id]

    try:
        raw_cameras = await api.async_get_cameras()
    except Exception as err:
        _LOGGER.error("Failed to fetch cameras for motion sensors: %s", err)
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
        HeimdallMotionSensor(api, cam, entry.entry_id, via_device_id=server_device_id)
        for cam in raw_cameras
    ]
    async_add_entities(entities, update_before_add=True)

class HeimdallMotionSensor(BinarySensorEntity):
    """Motion binary sensor for a Heimdall NVR camera."""

    _attr_device_class = BinarySensorDeviceClass.MOTION

    def __init__(
        self,
        api: HeimdallApiClient,
        camera_data: Dict[str, Any],
        entry_id: str,
        via_device_id: Optional[str] = None,
    ) -> None:
        """Initialize motion binary sensor."""
        self.api = api
        self._entry_id = entry_id
        self._via_device_id = via_device_id
        self._cam_id: int = camera_data["id"]
        self._cam_name: str = camera_data.get("name", f"Camera {self._cam_id}")
        self._is_on: bool = False

        self._attr_name = f"{self._cam_name} Motion"
        self._attr_unique_id = f"heimdall_nvr_{entry_id}_cam_{self._cam_id}_motion"

    @property
    def device_info(self) -> DeviceInfo:
        """Return device info matching camera."""
        info = DeviceInfo(
            identifiers={(DOMAIN, f"{self._entry_id}_cam_{self._cam_id}")},
            name=self._cam_name,
            manufacturer="Heimdall NVR",
        )
        if self._via_device_id:
            info["via_device_id"] = self._via_device_id
        return info

    @property
    def is_on(self) -> bool:
        """Return true if motion is currently detected."""
        return self._is_on

    async def async_update(self) -> None:
        """Check latest event log for recent motion on this camera."""
        try:
            events = await self.api.async_get_events(camera_id=self._cam_id, limit=5)
            if not events:
                self._is_on = False
                return

            # Check if latest event occurred within last 30 seconds
            latest_event = events[0]
            event_time_str = latest_event.get("start_time") or latest_event.get("timestamp")
            
            if event_time_str:
                try:
                    # Clean ISO format string
                    clean_time = event_time_str.replace("Z", "+00:00")
                    dt = datetime.fromisoformat(clean_time)
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)

                    now = datetime.now(timezone.utc)
                    diff_seconds = (now - dt).total_seconds()
                    
                    # Consider motion active if logged within the last 25 seconds
                    self._is_on = 0 <= diff_seconds <= 25
                except ValueError:
                    self._is_on = False
            else:
                self._is_on = False
        except Exception as err:
            _LOGGER.debug("Error checking motion events for camera %s: %s", self._cam_id, err)
            self._is_on = False
