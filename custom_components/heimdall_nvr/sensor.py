"""Support for Heimdall NVR system sensors."""
import logging
from typing import Dict, Any, Optional

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
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
    """Set up Heimdall NVR server sensors."""
    api: HeimdallApiClient = hass.data[DOMAIN][entry.entry_id]

    entities = [
        HeimdallTotalCamerasSensor(api, entry.entry_id),
        HeimdallActiveCamerasSensor(api, entry.entry_id),
        HeimdallRetentionSensor(api, entry.entry_id),
    ]
    async_add_entities(entities, update_before_add=True)

class HeimdallServerBaseSensor(SensorEntity):
    """Base class for Heimdall NVR server sensors."""

    def __init__(self, api: HeimdallApiClient, entry_id: str) -> None:
        """Initialize server sensor base."""
        self.api = api
        self._entry_id = entry_id

    @property
    def device_info(self) -> DeviceInfo:
        """Return device information for Heimdall NVR Server."""
        return DeviceInfo(
            identifiers={(DOMAIN, self._entry_id)},
            name="Heimdall NVR Server",
            manufacturer="RoopeTech",
            model="NVR System Backend",
        )

class HeimdallTotalCamerasSensor(HeimdallServerBaseSensor):
    """Sensor reporting total camera count on NVR."""

    _attr_name = "Heimdall NVR Total Cameras"
    _attr_icon = "mdi:cctv"

    def __init__(self, api: HeimdallApiClient, entry_id: str) -> None:
        super().__init__(api, entry_id)
        self._attr_unique_id = f"heimdall_nvr_{entry_id}_total_cameras"
        self._state: Optional[int] = None

    @property
    def native_value(self) -> Optional[int]:
        return self._state

    async def async_update(self) -> None:
        try:
            cams = await self.api.async_get_cameras()
            self._state = len(cams)
        except Exception as err:
            _LOGGER.debug("Error fetching total camera sensor count: %s", err)

class HeimdallActiveCamerasSensor(HeimdallServerBaseSensor):
    """Sensor reporting active camera count on NVR."""

    _attr_name = "Heimdall NVR Active Cameras"
    _attr_icon = "mdi:video-check"

    def __init__(self, api: HeimdallApiClient, entry_id: str) -> None:
        super().__init__(api, entry_id)
        self._attr_unique_id = f"heimdall_nvr_{entry_id}_active_cameras"
        self._state: Optional[int] = None

    @property
    def native_value(self) -> Optional[int]:
        return self._state

    async def async_update(self) -> None:
        try:
            cams = await self.api.async_get_cameras()
            self._state = sum(1 for c in cams if c.get("is_active", 1))
        except Exception as err:
            _LOGGER.debug("Error fetching active camera sensor count: %s", err)

class HeimdallRetentionSensor(HeimdallServerBaseSensor):
    """Sensor reporting storage retention days setting."""

    _attr_name = "Heimdall NVR Retention Days"
    _attr_icon = "mdi:harddisk"
    _attr_native_unit_of_measurement = "days"

    def __init__(self, api: HeimdallApiClient, entry_id: str) -> None:
        super().__init__(api, entry_id)
        self._attr_unique_id = f"heimdall_nvr_{entry_id}_retention_days"
        self._state: Optional[int] = None

    @property
    def native_value(self) -> Optional[int]:
        return self._state

    async def async_update(self) -> None:
        try:
            settings = await self.api.async_get_settings()
            retention = settings.get("retention_days", "0")
            self._state = int(retention) if retention.isdigit() else 0
        except Exception as err:
            _LOGGER.debug("Error fetching retention sensor state: %s", err)
