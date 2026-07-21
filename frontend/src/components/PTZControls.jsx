import React, { useState } from 'react';

export default function PTZControls({ cameraId, isMock, token }) {
  const [activeDir, setActiveDir] = useState(null);
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState(0.0);
  const [tilt, setTilt] = useState(0.0);

  const sendCommand = async (action, p = 0.0, t = 0.0, z = 1.0) => {
    try {
      await fetch(`/api/cameras/${cameraId}/ptz`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action, pan: p, tilt: t, zoom: z }),
      });
    } catch (err) {
      console.error('PTZ Error:', err);
    }
  };

  const handleStartMove = (direction, p, t, z) => {
    setActiveDir(direction);
    
    // For mock simulation, we update client state so we can track zoom level locally
    if (isMock) {
      let nextPan = pan;
      let nextTilt = tilt;
      let nextZoom = zoom;

      if (direction === 'left') nextPan = Math.max(-1.0, pan - 0.25);
      if (direction === 'right') nextPan = Math.min(1.0, pan + 0.25);
      if (direction === 'up') nextTilt = Math.min(1.0, tilt + 0.25);
      if (direction === 'down') nextTilt = Math.max(-1.0, tilt - 0.25);
      if (direction === 'zoom-in') nextZoom = Math.min(3.0, zoom + 0.25);
      if (direction === 'zoom-out') nextZoom = Math.max(1.0, zoom - 0.25);

      setPan(nextPan);
      setTilt(nextTilt);
      setZoom(nextZoom);
      
      sendCommand('move', nextPan, nextTilt, nextZoom);
    } else {
      // Real camera: send direction vectors
      sendCommand('move', p, t, z);
    }
  };

  const handleStopMove = () => {
    setActiveDir(null);
    if (!isMock) {
      sendCommand('stop');
    }
  };

  const handleReset = () => {
    setPan(0.0);
    setTilt(0.0);
    setZoom(1.0);
    sendCommand('move', 0.0, 0.0, 1.0);
  };

  const handleGoHome = () => {
    setPan(0.0);
    setTilt(0.0);
    setZoom(1.0);
    sendCommand('home');
  };

  return (
    <div className="ptz-joystick-container fade-in">
      <h3 className="form-label" style={{ marginBottom: '12px', textAlign: 'center' }}>
        PTZ Camera Control {isMock ? '(Simulated)' : ''}
      </h3>
      
      <div className="ptz-grid">
        <button 
          className="ptz-btn" 
          style={{ gridColumn: '2', gridRow: '1' }}
          title="Tilt Up"
          onMouseDown={() => handleStartMove('up', 0.0, 1.0, zoom)}
          onMouseUp={handleStopMove}
          onMouseLeave={handleStopMove}
        >
          ▲
        </button>
        <button 
          className="ptz-btn" 
          style={{ gridColumn: '1', gridRow: '2' }}
          title="Pan Left"
          onMouseDown={() => handleStartMove('left', -1.0, 0.0, zoom)}
          onMouseUp={handleStopMove}
          onMouseLeave={handleStopMove}
        >
          ◀
        </button>
        <button 
          className="ptz-btn ptz-center" 
          style={{ gridColumn: '2', gridRow: '2' }}
          title="Reset Center"
          onClick={handleReset}
        >
          ⌖
        </button>
        <button 
          className="ptz-btn" 
          style={{ gridColumn: '3', gridRow: '2' }}
          title="Pan Right"
          onMouseDown={() => handleStartMove('right', 1.0, 0.0, zoom)}
          onMouseUp={handleStopMove}
          onMouseLeave={handleStopMove}
        >
          ▶
        </button>
        <button 
          className="ptz-btn" 
          style={{ gridColumn: '2', gridRow: '3' }}
          title="Tilt Down"
          onMouseDown={() => handleStartMove('down', 0.0, -1.0, zoom)}
          onMouseUp={handleStopMove}
          onMouseLeave={handleStopMove}
        >
          ▼
        </button>
      </div>

      <div className="zoom-controls" style={{ display: 'flex', gap: '8px', width: '100%' }}>
        <button 
          className="zoom-btn"
          onMouseDown={() => handleStartMove('zoom-in', 0.0, 0.0, zoom + 0.25)}
          onMouseUp={handleStopMove}
          onMouseLeave={handleStopMove}
          style={{ flex: 1 }}
        >
          🔍 +
        </button>
        <button 
          className="zoom-btn"
          onMouseDown={() => handleStartMove('zoom-out', 0.0, 0.0, Math.max(1.0, zoom - 0.25))}
          onMouseUp={handleStopMove}
          onMouseLeave={handleStopMove}
          style={{ flex: 1 }}
        >
          🔍 -
        </button>
        <button 
          className="zoom-btn"
          onClick={handleGoHome}
          style={{ flex: 1, background: 'rgba(14, 165, 233, 0.1)', borderColor: 'rgba(14, 165, 233, 0.25)', color: 'var(--primary)' }}
          title="Go to Home Position"
        >
          🏠 Home
        </button>
      </div>

      {isMock && (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'center' }}>
          Pan: {pan.toFixed(2)} | Tilt: {tilt.toFixed(2)} | Zoom: {zoom.toFixed(2)}x
        </div>
      )}
    </div>
  );
}
