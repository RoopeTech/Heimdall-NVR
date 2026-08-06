"""Config flow for Heimdall NVR integration."""
import logging
import voluptuous as vol
import aiohttp

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import DOMAIN, CONF_URL, CONF_USERNAME, CONF_PASSWORD, DEFAULT_PORT
from .api import HeimdallApiClient

_LOGGER = logging.getLogger(__name__)

DATA_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_URL, default="http://192.168.1.100:8000"): str,
        vol.Required(CONF_USERNAME, default="admin"): str,
        vol.Required(CONF_PASSWORD): str,
    }
)

class HeimdallNvrConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Heimdall NVR."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Handle the initial step."""
        errors = {}

        if user_input is not None:
            url = user_input[CONF_URL].rstrip("/")
            username = user_input[CONF_USERNAME]
            password = user_input[CONF_PASSWORD]

            # Ensure host has http/https protocol prefix
            if not url.startswith("http://") and not url.startswith("https://"):
                url = f"http://{url}"
                user_input[CONF_URL] = url

            session = async_get_clientsession(self.hass)
            client = HeimdallApiClient(url, username, password, session)

            try:
                success = await client.async_login()
                if success:
                    # Prevent duplicate entries for the same URL
                    await self.async_set_unique_id(url)
                    self._abort_if_unique_id_configured()

                    return self.async_create_entry(
                        title=f"Heimdall NVR ({url})",
                        data=user_input,
                    )
                else:
                    errors["base"] = "invalid_auth"
            except aiohttp.ClientConnectorError:
                errors["base"] = "cannot_connect"
            except Exception as err:
                _LOGGER.exception("Unexpected exception during Heimdall NVR setup: %s", err)
                errors["base"] = "unknown"

        return self.async_show_form(
            step_id="user", data_schema=DATA_SCHEMA, errors=errors
        )
