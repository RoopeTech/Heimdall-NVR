import asyncio
import socket
import time
from urllib.parse import urlparse

class CameraProxyManager:
    def __init__(self):
        # Maps camera_id -> {"port": int, "server": asyncio.Server, "last_active": float}
        self.active_tunnels = {}

    def get_free_port(self):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(('0.0.0.0', 0))
            return s.getsockname()[1]

    async def _forward(self, src_reader, dst_writer, camera_id):
        try:
            while True:
                data = await src_reader.read(4096)
                if not data:
                    break
                
                # Update activity timestamp so tunnel doesn't timeout while in use
                if camera_id in self.active_tunnels:
                    self.active_tunnels[camera_id]["last_active"] = time.time()
                
                dst_writer.write(data)
                await dst_writer.drain()
        except Exception:
            pass
        finally:
            try:
                dst_writer.close()
            except Exception:
                pass

    async def _handle_client(self, reader, writer, target_host, target_port, camera_id):
        try:
            target_reader, target_writer = await asyncio.open_connection(target_host, target_port)
            
            # Update activity
            if camera_id in self.active_tunnels:
                self.active_tunnels[camera_id]["last_active"] = time.time()

            await asyncio.gather(
                self._forward(reader, target_writer, camera_id),
                self._forward(target_reader, writer, camera_id)
            )
        except Exception as e:
            print(f"[Proxy] Error connecting to camera {camera_id} at {target_host}:{target_port}: {e}")
            writer.close()

    async def start_proxy(self, camera_id: int, camera_url: str) -> int:
        # If already running, return existing port
        if camera_id in self.active_tunnels:
            self.active_tunnels[camera_id]["last_active"] = time.time()
            return self.active_tunnels[camera_id]["port"]

        # Parse target IP from camera_url
        parsed = urlparse(camera_url)
        target_host = parsed.hostname
        target_port = parsed.port or 80

        if not target_host:
            raise ValueError("Invalid camera URL")

        proxy_port = self.get_free_port()

        # Define handler factory to capture context
        async def handler(reader, writer):
            await self._handle_client(reader, writer, target_host, target_port, camera_id)

        server = await asyncio.start_server(handler, '0.0.0.0', proxy_port)
        
        self.active_tunnels[camera_id] = {
            "port": proxy_port,
            "server": server,
            "last_active": time.time()
        }
        
        print(f"[Proxy] Started TCP tunnel on port {proxy_port} routing to {target_host}:{target_port}")
        return proxy_port

    async def stop_proxy(self, camera_id: int):
        if camera_id in self.active_tunnels:
            info = self.active_tunnels.pop(camera_id)
            server = info["server"]
            server.close()
            await server.wait_closed()
            print(f"[Proxy] Stopped TCP tunnel for camera {camera_id} on port {info['port']}")

    async def cleanup_loop(self):
        """Background task to kill unused tunnels after 15 minutes of inactivity."""
        while True:
            await asyncio.sleep(60)
            now = time.time()
            for cam_id in list(self.active_tunnels.keys()):
                info = self.active_tunnels.get(cam_id)
                if info and (now - info["last_active"] > 900): # 15 minutes
                    print(f"[Proxy] Auto-closing idle tunnel for camera {cam_id}")
                    await self.stop_proxy(cam_id)

# Global singleton
proxy_manager = CameraProxyManager()
