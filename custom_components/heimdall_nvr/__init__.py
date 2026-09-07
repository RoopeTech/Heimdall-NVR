"""The Heimdall NVR Home Assistant Integration."""
import logging
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.exceptions import ConfigEntryNotReady

from .const import DOMAIN, CONF_URL, CONF_USERNAME, CONF_PASSWORD
from .api import HeimdallApiClient

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["camera", "binary_sensor", "sensor"]

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Heimdall NVR from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    url = entry.data[CONF_URL]
    username = entry.data[CONF_USERNAME]
    password = entry.data[CONF_PASSWORD]

    session = async_get_clientsession(hass)
    api = HeimdallApiClient(url, username, password, session)

    try:
        authenticated = await api.async_login()
        if not authenticated:
            _LOGGER.error("Failed to authenticate with Heimdall NVR at %s", url)
            return False
    except Exception as err:
        _LOGGER.error("Error connecting to Heimdall NVR at %s: %s", url, err)
        raise ConfigEntryNotReady from err

    hass.data[DOMAIN][entry.entry_id] = api

    # Register the main NVR server device in the device registry
    device_registry = dr.async_get(hass)
    device_registry.async_get_or_create(
        config_entry_id=entry.entry_id,
        identifiers={(DOMAIN, entry.entry_id)},
        name="Heimdall NVR Server",
        manufacturer="RoopeTech",
        model="NVR System Backend",
    )

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)

    return unload_ok
