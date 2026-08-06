"""API Client for communicating with Heimdall NVR server."""
import logging
import asyncio
from typing import Dict, Any, List, Optional
import aiohttp

_LOGGER = logging.getLogger(__name__)

class HeimdallApiClient:
    """API client for Heimdall NVR backend."""

    def __init__(self, base_url: str, username: str, password: str, session: aiohttp.ClientSession):
        """Initialize the API client."""
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self.session = session
        self.token: Optional[str] = None

    async def async_login(self) -> bool:
        """Authenticate with the Heimdall NVR server and retrieve session token."""
        url = f"{self.base_url}/api/auth/login"
        payload = {"username": self.username, "password": self.password}

        try:
            async with self.session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=10)) as response:
                if response.status == 200:
                    data = await response.json()
                    self.token = data.get("token")
                    _LOGGER.debug("Successfully authenticated with Heimdall NVR")
                    return True
                else:
                    _LOGGER.error("Failed login attempt to %s: HTTP %s", url, response.status)
                    return False
        except Exception as err:
            _LOGGER.error("Connection error during login to Heimdall NVR (%s): %s", url, err)
            raise

    def _headers(self) -> Dict[str, str]:
        """Return headers with authorization token if available."""
        headers = {}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    async def async_get_cameras(self) -> List[Dict[str, Any]]:
        """Fetch all cameras configured in Heimdall NVR."""
        url = f"{self.base_url}/api/cameras"
        if self.token:
            url += f"?token={self.token}"

        async with self.session.get(url, headers=self._headers(), timeout=aiohttp.ClientTimeout(total=10)) as response:
            if response.status == 401:
                if await self.async_login():
                    return await self.async_get_cameras()
            response.raise_for_status()
            return await response.json()

    async def async_get_snapshot(self, camera_id: int, hq: bool = True) -> Optional[bytes]:
        """Fetch latest camera JPEG snapshot."""
        profile = "hd" if hq else "sd"
        url = f"{self.base_url}/api/cameras/{camera_id}/snapshot?profile={profile}"
        if self.token:
            url += f"&token={self.token}"

        async with self.session.get(url, headers=self._headers(), timeout=aiohttp.ClientTimeout(total=10)) as response:
            if response.status == 401:
                if await self.async_login():
                    return await self.async_get_snapshot(camera_id, hq)
            if response.status == 200:
                return await response.read()
            _LOGGER.warning("Could not fetch snapshot for camera %s: HTTP %s", camera_id, response.status)
            return None

    def get_live_stream_url(self, camera_id: int) -> str:
        """Get live MJPEG stream URL with session token appended."""
        stream_url = f"{self.base_url}/api/cameras/{camera_id}/live"
        if self.token:
            stream_url += f"?token={self.token}"
        return stream_url

    async def async_get_settings(self) -> Dict[str, Any]:
        """Fetch system settings from Heimdall NVR."""
        url = f"{self.base_url}/api/settings"
        if self.token:
            url += f"?token={self.token}"

        async with self.session.get(url, headers=self._headers(), timeout=aiohttp.ClientTimeout(total=10)) as response:
            if response.status == 401:
                if await self.async_login():
                    return await self.async_get_settings()
            response.raise_for_status()
            return await response.json()

    async def async_get_events(self, camera_id: Optional[int] = None, limit: int = 20) -> List[Dict[str, Any]]:
        """Fetch motion event logs."""
        url = f"{self.base_url}/api/events?limit={limit}"
        if camera_id is not None:
            url += f"&camera_id={camera_id}"
        if self.token:
            url += f"&token={self.token}"

        async with self.session.get(url, headers=self._headers(), timeout=aiohttp.ClientTimeout(total=10)) as response:
            if response.status == 401:
                if await self.async_login():
                    return await self.async_get_events(camera_id, limit)
            if response.status == 200:
                return await response.json()
            return []
