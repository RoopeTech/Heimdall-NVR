import React, { useState } from 'react';

export default function CameraGrid({ cameras, recordings, onSelectCamera, onRefreshRecordings, token }) {
  const [layout, setLayout] = useState('grid-layout-2'); // default 2x2 grid

  const getLayoutClass = () => {
    if (cameras.length === 1) return 'grid-layout-1';
    return layout;
  };

  // Helper to check if a camera is currently recording
  const isCameraRecording = (camId) => {
    // If there is a recording with no end_time in list, it is recording
    return recordings.some(r => r.camera_id === camId && !r.end_time);
  };

  const triggerMockMotion = async (e, camId, currentState) => {
    e.stopPropagation(); // prevent opening detailed modal
    try {
      await fetch(`/api/cameras/${camId}/mock_motion`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ enabled: !currentState })
      });
      onRefreshRecordings();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="view-container fade-in">
      <div className="grid-controls">
        <h2 style={{ fontSize: '24px', fontWeight: '700' }}>📹 Camera Stream Monitor</h2>
        {cameras.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Grid Layout:</span>
            <select 
              className="grid-select" 
              value={layout} 
              onChange={(e) => setLayout(e.target.value)}
            >
              <option value="grid-layout-1">Single Fullscreen</option>
              <option value="grid-layout-2">2 Columns</option>
              <option value="grid-layout-3">3 Columns</option>
              <option value="grid-layout-4">Grid (2x2)</option>
            </select>
          </div>
        )}
      </div>

      <div className={`cameras-grid ${getLayoutClass()}`}>
        {cameras.map((cam) => {
          const isRecording = isCameraRecording(cam.id);
          const isMock = cam.sub_url.startsWith('mock://');

          return (
            <div 
              key={cam.id} 
              className={`camera-card glass-panel ${isRecording ? 'glow-red' : ''}`}
              onClick={() => onSelectCamera(cam)}
            >
              <div className="camera-card-header">
                <div className="camera-card-title">
                  <span className={`camera-status-dot ${isRecording ? 'recording' : ''}`} />
                  {cam.name}
                </div>
                {isMock && (
                  <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-muted)' }}>
                    Simulated
                  </span>
                )}
              </div>

              <div className="camera-stream-container">
                <img 
                  className="camera-stream-img" 
                  src={`/api/cameras/${cam.id}/live?t=${Date.now()}&token=${token}`}
                  alt={cam.name}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
                <div className="camera-stream-placeholder" style={{ display: 'none' }}>
                  <span>⚠️ Camera Offline</span>
                  <span style={{ fontSize: '12px' }}>Check RTSP stream URL</span>
                </div>
                
                <div className="camera-card-badges">
                  {isRecording && <span className="badge badge-rec">🔴 REC</span>}
                  <span className="badge badge-sub">Substream View</span>
                </div>
              </div>

              <div className="camera-card-footer">
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {isRecording ? '🎥 Recording clip...' : 'Idle'}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {isMock && (
                    <button 
                      className={`btn btn-icon ${isRecording ? 'btn-danger' : 'btn-secondary'}`}
                      onClick={(e) => triggerMockMotion(e, cam.id, isRecording)}
                      title={isRecording ? "Stop Simulated Motion" : "Trigger Simulated Motion"}
                      style={{ width: '32px', height: '32px', fontSize: '12px' }}
                    >
                      {isRecording ? '⏹️' : '🏃'}
                    </button>
                  )}
                  <button 
                    className="btn btn-primary" 
                    onClick={() => onSelectCamera(cam)}
                    style={{ padding: '6px 12px', fontSize: '12px' }}
                  >
                    Timeline & PTZ
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {cameras.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '80px 20px', color: 'var(--text-secondary)' }} className="glass-panel">
            <h3>No Cameras Configured</h3>
            <p style={{ fontSize: '14px', marginTop: '8px' }}>Go to Settings to add your first IP Camera stream.</p>
          </div>
        )}
      </div>
    </div>
  );
}
