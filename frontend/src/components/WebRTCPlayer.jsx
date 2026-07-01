import React, { useEffect, useRef, useState } from 'react';

export default function WebRTCPlayer({ cameraId, token, style, className }) {
  const videoRef = useRef(null);
  const pcRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    pcRef.current = pc;

    pc.ontrack = (event) => {
      if (videoRef.current && event.streams && event.streams[0]) {
        videoRef.current.srcObject = event.streams[0];
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        setError("Connection lost");
      }
    };

    // go2rtc requires recvonly transceivers
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .then(() => {
        // Send offer to our proxy endpoint
        const offer = pc.localDescription.sdp;
        return fetch(`/api/cameras/${cameraId}/webrtc?token=${token}`, {
          method: 'POST',
          body: offer
        });
      })
      .then(async response => {
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`WebRTC Error (${response.status}): ${text}`);
        }
        return response.text();
      })
      .then(answer => {
        return pc.setRemoteDescription(new RTCSessionDescription({
          type: 'answer',
          sdp: answer
        }));
      })
      .catch(err => {
        console.error("WebRTC Error:", err);
        setError(err.message);
      });

    return () => {
      pc.close();
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [cameraId, token]);

  if (error) {
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', color: 'var(--accent-danger)' }}>
        <p>⚠️ {error}</p>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      style={style}
      className={className}
      autoPlay
      playsInline
      muted // Required by browsers for autoplay!
      controls={false} // Hidden controls for live view (can be overridden or handled externally)
    />
  );
}
