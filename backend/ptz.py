import requests
import hashlib
import base64
import os
import time
from datetime import datetime

# Helper to create WS-UsernameToken headers for ONVIF authentication
def get_ws_auth_header(username, password):
    if not username:
        return ""
    
    # Generate nonce and timestamp
    nonce_bytes = os.urandom(16)
    nonce_b64 = base64.b64encode(nonce_bytes).decode('utf-8')
    
    created = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    
    # Calculate password digest: SHA1(Nonce + Created + Password)
    hasher = hashlib.sha1()
    hasher.update(nonce_bytes)
    hasher.update(created.encode('utf-8'))
    hasher.update(password.encode('utf-8'))
    digest = base64.b64encode(hasher.digest()).decode('utf-8')
    
    return f"""
    <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"
                   xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
        <wsse:UsernameToken>
            <wsse:Username>{username}</wsse:Username>
            <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">{digest}</wsse:Password>
            <wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">{nonce_b64}</wsse:Nonce>
            <wsu:Created>{created}</wsu:Created>
        </wsse:UsernameToken>
    </wsse:Security>
    """

def wrap_soap_envelope(header_content, body_content):
    return f"""<?xml version="1.0" encoding="utf-8"?>
    <soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
                   xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl"
                   xmlns:tt="http://www.onvif.org/ver10/schema">
        <soap:Header>
            {header_content}
        </soap:Header>
        <soap:Body>
            {body_content}
        </soap:Body>
    </soap:Envelope>
    """

def get_ptz_service_url(ip, port, username, password):
    # Try to discover the PTZ service URL from Device Management
    device_url = f"http://{ip}:{port}/onvif/device_service"
    
    body = """
    <tds:GetCapabilities xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
        <tds:Category>PTZ</tds:Category>
    </tds:GetCapabilities>
    """
    
    headers = {
        "Content-Type": "application/soap+xml; charset=utf-8; action=\"http://www.onvif.org/ver10/device/wsdl/GetCapabilities\""
    }
    
    auth_header = get_ws_auth_header(username, password)
    soap_request = wrap_soap_envelope(auth_header, body)
    
    try:
        response = requests.post(device_url, data=soap_request, headers=headers, timeout=5)
        if response.status_code == 200:
            # Simple XML parsing to find PTZ URL
            text = response.text
            start_tag = "<tt:XAddr>"
            end_tag = "</tt:XAddr>"
            if start_tag in text:
                ptz_url = text.split(start_tag)[1].split(end_tag)[0]
                # Replace host if returned as internal IP
                if "://" in ptz_url:
                    parts = ptz_url.split("://")[1].split("/")
                    path = "/".join(parts[1:])
                    return f"http://{ip}:{port}/{path}"
                return ptz_url
    except Exception as e:
        print(f"Error getting capabilities: {e}")
        
    # Fallback to standard ONVIF path
    return f"http://{ip}:{port}/onvif/ptz_service"

def send_onvif_ptz(ip, port, username, password, action, x=0.0, y=0.0, z=0.0, profile="Profile_1", preset_token=None):
    ptz_url = get_ptz_service_url(ip, port, username, password)
    
    auth_header = get_ws_auth_header(username, password)
    
    # Construct Body based on action
    if action == "move":
        # ContinuousMove
        body = f"""
        <tptz:ContinuousMove>
            <tptz:ProfileToken>{profile}</tptz:ProfileToken>
            <tptz:Velocity>
                <tt:PanTilt x="{x}" y="{y}" xmlns:tt="http://www.onvif.org/ver10/schema"/>
                <tt:Zoom x="{z}" xmlns:tt="http://www.onvif.org/ver10/schema"/>
            </tptz:Velocity>
        </tptz:ContinuousMove>
        """
        soap_action = "http://www.onvif.org/ver20/ptz/wsdl/ContinuousMove"
        
    elif action == "stop":
        # Stop
        body = f"""
        <tptz:Stop>
            <tptz:ProfileToken>{profile}</tptz:ProfileToken>
            <tptz:PanTilt>true</tptz:PanTilt>
            <tptz:Zoom>true</tptz:Zoom>
        </tptz:Stop>
        """
        soap_action = "http://www.onvif.org/ver20/ptz/wsdl/Stop"
        
    elif action == "goto_preset":
        body = f"""
        <tptz:GotoPreset>
            <tptz:ProfileToken>{profile}</tptz:ProfileToken>
            <tptz:PresetToken>{preset_token}</tptz:PresetToken>
        </tptz:GotoPreset>
        """
        soap_action = "http://www.onvif.org/ver20/ptz/wsdl/GotoPreset"
        
    elif action == "home":
        body = f"""
        <tptz:GotoHomePosition>
            <tptz:ProfileToken>{profile}</tptz:ProfileToken>
        </tptz:GotoHomePosition>
        """
        soap_action = "http://www.onvif.org/ver20/ptz/wsdl/GotoHomePosition"
        
    else:
        raise ValueError(f"Unknown PTZ action: {action}")
        
    soap_request = wrap_soap_envelope(auth_header, body)
    
    headers = {
        "Content-Type": f"application/soap+xml; charset=utf-8; action=\"{soap_action}\""
    }
    
    try:
        response = requests.post(ptz_url, data=soap_request, headers=headers, timeout=5)
        return response.status_code == 200
    except Exception as e:
        print(f"Error sending PTZ command: {e}")
        return False

def send_foscam_ptz(ip, port, username, password, ptz_type, action, x=0.0, y=0.0, z=0.0):
    # ptz_type is either 'foscam_cgi' (old) or 'foscam_hd' (CGIProxy)
    # action is either "move", "stop", or "home"
    
    if ptz_type == "foscam_cgi":
        cmd = None
        if action == "move":
            # Command mapping: 0=up, 2=down, 4=left, 6=right
            if y > 0.1: cmd = 0
            elif y < -0.1: cmd = 2
            elif x < -0.1: cmd = 4
            elif x > 0.1: cmd = 6
        elif action == "home":
            cmd = 31 # Go to preset 1 (Home)
        elif action == "stop":
            # Stop command: 1 (stops up/down), 5 (stops left/right)
            url_stop_pt = f"http://{ip}:{port}/decoder_control.cgi?command=1&usr={username}&pwd={password}"
            url_stop_lr = f"http://{ip}:{port}/decoder_control.cgi?command=5&usr={username}&pwd={password}"
            try:
                requests.get(url_stop_pt, timeout=3)
                requests.get(url_stop_lr, timeout=3)
                return True
            except Exception as e:
                print(f"Foscam CGI Stop Error: {e}")
                return False
                
        if cmd is not None:
            url = f"http://{ip}:{port}/decoder_control.cgi?command={cmd}&usr={username}&pwd={password}"
            try:
                res = requests.get(url, timeout=3)
                return res.status_code == 200
            except Exception as e:
                print(f"Foscam CGI Move Error: {e}")
                return False
                
    elif ptz_type == "foscam_hd":
        cmd_str = None
        if action == "move":
            if y > 0.1: cmd_str = "ptzMoveUp"
            elif y < -0.1: cmd_str = "ptzMoveDown"
            elif x < -0.1: cmd_str = "ptzMoveLeft"
            elif x > 0.1: cmd_str = "ptzMoveRight"
            elif z > 1.1: cmd_str = "zoomIn"
            elif z < 0.9: cmd_str = "zoomOut"
        elif action == "home":
            cmd_str = "goHome"
        elif action == "stop":
            cmd_str = "ptzStopRun"
            
        if cmd_str:
            url = f"http://{ip}:{port}/cgi-bin/CGIProxy.fcgi?cmd={cmd_str}&usr={username}&pwd={password}"
            try:
                res = requests.get(url, timeout=3)
                return res.status_code == 200
            except Exception as e:
                print(f"Foscam HD PTZ Error: {e}")
                return False
                
    return False

def send_ptz(ip, port, username, password, ptz_type, action, x=0.0, y=0.0, z=0.0):
    if ptz_type == "camhi":
        return send_camhi_ptz(ip, port, username, password, action, x, y, z)
    elif not ptz_type or ptz_type == "onvif":
        return send_onvif_ptz(ip, port, username, password, action, x, y, z)
    else:
        return send_foscam_ptz(ip, port, username, password, ptz_type, action, x, y, z)

def send_camhi_ptz(ip, port, username, password, action, x=0.0, y=0.0, z=0.0):
    # CamHi cameras (hi3510 / Huaxin) use /cgi-bin/hi3510/ptzctrl.cgi
    act = None
    if action == "move":
        if y > 0.1: act = "up"
        elif y < -0.1: act = "down"
        elif x < -0.1: act = "left"
        elif x > 0.1: act = "right"
        elif z > 1.1: act = "zoomin"
        elif z < 0.9: act = "zoomout"
    elif action == "stop":
        act = "stop"
        
    if act:
        url = f"http://{ip}:{port}/cgi-bin/hi3510/ptzctrl.cgi?-step=0&-act={act}&-speed=45"
        try:
            from requests.auth import HTTPBasicAuth
            # Attempt with basic auth (often required by CamHi firmware)
            res = requests.get(url, auth=HTTPBasicAuth(username, password), timeout=3)
            return res.status_code == 200
        except Exception as e:
            print(f"CamHi PTZ Error: {e}")
            return False
            
    return False
