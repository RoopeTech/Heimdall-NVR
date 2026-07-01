import React, { useEffect, useRef, useState } from 'react';

export default function WebRTCPlayer({ cameraId, token, style, className }) {
  const videoRef = useRef(null);
  const pcRef = useRef(null);
  const [error, setError] = useState(null);
  const [isMuted, setIsMuted] = useState(true);

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

  const wrapperStyle = { ...style, position: 'relative', overflow: 'hidden' };
  const objectFit = wrapperStyle.objectFit || 'contain';
  delete wrapperStyle.objectFit; // ensure objectFit applies only to the video

  return (
    <div style={wrapperStyle} className={className}>
      <video
        ref={videoRef}
        style={{ width: '100%', height: '100%', objectFit }}
        autoPlay
        playsInline
        muted={isMuted} // React manages muted state now
        controls={false}
      />
      
      {/* Custom Audio Toggle Overlay */}
      <div 
        onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }}
        style={{
          position: 'absolute',
          bottom: '12px',
          right: '12px',
          background: 'rgba(0, 0, 0, 0.65)',
          color: '#fff',
          padding: '6px 8px',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
          backdropFilter: 'blur(4px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
          transition: 'all 0.2s',
          userSelect: 'none'
        }}
        title={isMuted ? "Unmute Audio" : "Mute Audio"}
        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.85)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.65)'}
      >
        {isMuted ? "🔇" : "🔊"}
      </div>
    </div>
  );
}
