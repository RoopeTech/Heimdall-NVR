import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * CameraStream — polls /api/cameras/{id}/snapshot every POLL_MS milliseconds.
 *
 * Why polling instead of MJPEG <img>?
 *   - MJPEG fires onLoad as soon as HTTP connects, before any frame arrives,
 *     so a black/blank stream looks identical to a working one.
 *   - fetch() returns a real HTTP status each call, so we know exactly when
 *     the camera has no frame (503) vs is truly offline (network error).
 *   - Blob URLs let us swap frames atomically with no flicker.
 */
const POLL_MS = 150; // ~6-7 fps — good balance of smoothness vs CPU/bandwidth
const ERROR_THRESHOLD = 4; // consecutive failures before showing error state

function CameraStream({ cameraId, token, className, style }) {
  const [blobUrl, setBlobUrl]           = useState(null);
  const [status, setStatus]             = useState('loading'); // 'loading' | 'live' | 'error'
  const intervalRef                     = useRef(null);
  const prevBlobRef                     = useRef(null);
  const consecutiveErrorsRef            = useRef(0);
  const mountedRef                      = useRef(true);

  const fetchFrame = useCallback(async () => {
    try {
      const res = await fetch(`/api/cameras/${cameraId}/snapshot`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const blob = await res.blob();
      if (!mountedRef.current) return;

      // Swap blob URL atomically to avoid flicker
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      setStatus('live');
      consecutiveErrorsRef.current = 0;

      // Revoke the old URL after a short delay so the img has time to paint it
      const old = prevBlobRef.current;
      prevBlobRef.current = url;
      if (old) setTimeout(() => URL.revokeObjectURL(old), 500);

    } catch {
      if (!mountedRef.current) return;
      consecutiveErrorsRef.current += 1;
      if (consecutiveErrorsRef.current >= ERROR_THRESHOLD) {
        setStatus('error');
      }
    }
  }, [cameraId, token]);

  useEffect(() => {
    mountedRef.current = true;
    setStatus('loading');
    setBlobUrl(null);
    consecutiveErrorsRef.current = 0;

    // Kick off immediately, then poll
    fetchFrame();
    intervalRef.current = setInterval(fetchFrame, POLL_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
      if (prevBlobRef.current) URL.revokeObjectURL(prevBlobRef.current);
    };
  }, [cameraId, fetchFrame]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Actual frame — always rendered so it retains its size */}
      {blobUrl && (
        <img
          src={blobUrl}
          className={className}
          style={style}
          alt="camera feed"
          draggable={false}
        />
      )}

      {/* Loading shimmer — shown until first frame arrives */}
      {status === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(10, 14, 26, 0.85)',
          color: 'var(--text-muted)', fontSize: '12px', gap: '8px',
          borderRadius: 'inherit',
        }}>
          <span style={{ fontSize: '22px', animation: 'pulse 1.5s ease-in-out infinite' }}>📡</span>
          <span>Connecting...</span>
        </div>
      )}

      {/* Error / offline state */}
      {status === 'error' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(10, 14, 26, 0.85)',
          color: 'var(--text-secondary)', fontSize: '12px', gap: '6px',
          borderRadius: 'inherit',
        }}>
          <span style={{ fontSize: '24px' }}>⚠️</span>
          <span style={{ fontWeight: '600' }}>Stream Unavailable</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Retrying...</span>
        </div>
      )}
    </div>
  );
}

export default function CameraGrid({ cameras, recordings, onSelectCamera, onRefreshRecordings, token }) {
  const [layout, setLayout] = useState('grid-layout-2'); // default 2x2 grid

  const getLayoutClass = () => {
    if (cameras.length === 1) return 'grid-layout-1';
    return layout;
  };

  const isCameraRecording = (camId) =>
    recordings.some(r => r.camera_id === camId && !r.end_time);

  const triggerMockMotion = async (e, camId, currentState) => {
    e.stopPropagation();
    try {
      await fetch(`/api/cameras/${camId}/mock_motion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled: !currentState }),
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
                <CameraStream
                  cameraId={cam.id}
                  token={token}
                  className="camera-stream-img"
                />
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
                      title={isRecording ? 'Stop Simulated Motion' : 'Trigger Simulated Motion'}
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
