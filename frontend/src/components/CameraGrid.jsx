import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * CameraStream — polls /api/cameras/{id}/snapshot every POLL_MS milliseconds.
 *
 * Renders as a React Fragment (no wrapper div) so that img and overlays are
 * direct absolute-positioned children of camera-stream-container, which now
 * uses flex:1 to fill the resized card height.
 */
const POLL_MS = 150;
const ERROR_THRESHOLD = 4;

function CameraStream({ cameraId, token, className }) {
  const [blobUrl, setBlobUrl]        = useState(null);
  const [status, setStatus]          = useState('loading');
  const intervalRef                  = useRef(null);
  const prevBlobRef                  = useRef(null);
  const consecutiveErrorsRef         = useRef(0);
  const mountedRef                   = useRef(true);

  const fetchFrame = useCallback(async () => {
    try {
      const res = await fetch(`/api/cameras/${cameraId}/snapshot`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (!mountedRef.current) return;
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      setStatus('live');
      consecutiveErrorsRef.current = 0;
      const old = prevBlobRef.current;
      prevBlobRef.current = url;
      if (old) setTimeout(() => URL.revokeObjectURL(old), 500);
    } catch {
      if (!mountedRef.current) return;
      consecutiveErrorsRef.current += 1;
      if (consecutiveErrorsRef.current >= ERROR_THRESHOLD) setStatus('error');
    }
  }, [cameraId, token]);

  useEffect(() => {
    mountedRef.current = true;
    setStatus('loading');
    setBlobUrl(null);
    consecutiveErrorsRef.current = 0;
    fetchFrame();
    intervalRef.current = setInterval(fetchFrame, POLL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
      if (prevBlobRef.current) {
        URL.revokeObjectURL(prevBlobRef.current);
        prevBlobRef.current = null;
      }
    };
  }, [cameraId, fetchFrame]);

  const overlayStyle = {
    position: 'absolute',
    top: 0, left: 0, width: '100%', height: '100%',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: '8px',
  };

  return (
    <>
      {blobUrl && (
        <img src={blobUrl} className={className} alt="camera feed" draggable={false} />
      )}
      {status === 'loading' && (
        <div style={{ ...overlayStyle, background: 'rgba(10,14,26,0.85)', color: 'var(--text-muted)', fontSize: '12px' }}>
          <span style={{ fontSize: '22px', animation: 'pulse 1.5s ease-in-out infinite' }}>📡</span>
          <span>Connecting...</span>
        </div>
      )}
      {status === 'error' && (
        <div style={{ ...overlayStyle, background: 'rgba(10,14,26,0.85)', color: 'var(--text-secondary)', fontSize: '12px' }}>
          <span style={{ fontSize: '24px' }}>⚠️</span>
          <span style={{ fontWeight: '600' }}>Stream Unavailable</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Retrying...</span>
        </div>
      )}
    </>
  );
}

export default function CameraGrid({ cameras, recordings, onSelectCamera, onRefreshRecordings, token }) {
  const [layout, setLayout] = useState('grid-layout-2');
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null); // null = "All"

  // Fetch camera groups
  useEffect(() => {
    if (!token) return;
    fetch('/api/groups', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => Array.isArray(data) ? setGroups(data) : setGroups([]))
      .catch(() => setGroups([]));
  }, [token]);

  // Filter cameras by active group
  const visibleCameras = activeGroup === null
    ? cameras
    : cameras.filter(c => {
        const grp = groups.find(g => g.id === activeGroup);
        return grp ? grp.camera_ids.includes(c.id) : true;
      });

  const isCameraRecording = (camId) =>
    recordings.some(r => r.camera_id === camId && !r.end_time);

  const triggerMockMotion = async (e, camId, currentState) => {
    e.stopPropagation();
    try {
      await fetch(`/api/cameras/${camId}/mock_motion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled: !currentState }),
      });
      onRefreshRecordings();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="view-container fade-in">
      {/* ── Header row ── */}
      <div className="grid-controls">
        <h2 style={{ fontSize: '24px', fontWeight: '700' }}>📹 Camera Stream Monitor</h2>
        {cameras.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Default layout:</span>
            <select className="grid-select" value={layout} onChange={(e) => setLayout(e.target.value)}>
              <option value="grid-layout-1">Single Column</option>
              <option value="grid-layout-2">2 Columns</option>
              <option value="grid-layout-3">3 Columns</option>
              <option value="grid-layout-4">2×2 Grid</option>
            </select>
          </div>
        )}
      </div>

      {/* ── Group filter chips ── */}
      {groups.length > 0 && (
        <div className="group-filter-bar">
          <button
            className={`group-chip ${activeGroup === null ? 'active' : ''}`}
            onClick={() => setActiveGroup(null)}
          >
            All
            <span className="group-chip-count">{cameras.length}</span>
          </button>
          {groups.map(g => (
            <button
              key={g.id}
              className={`group-chip ${activeGroup === g.id ? 'active' : ''}`}
              onClick={() => setActiveGroup(g.id)}
            >
              {g.name}
              <span className="group-chip-count">{g.camera_ids.length}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Camera tiles ── */}
      <div className={`cameras-grid ${layout}`}>
        {visibleCameras.map((cam) => {
          const isRecording = isCameraRecording(cam.id);
          const isMock = cam.sub_url.startsWith('mock://');

          return (
            <div
              key={cam.id}
              className={`camera-card glass-panel ${isRecording ? 'glow-red' : ''}`}
              onClick={() => onSelectCamera(cam)}
              title="Drag bottom-right corner to resize"
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
                <CameraStream cameraId={cam.id} token={token} className="camera-stream-img" />
                <div className="camera-card-badges">
                  {isRecording && <span className="badge badge-rec">🔴 REC</span>}
                  <span className="badge badge-sub">Substream</span>
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
                      title={isRecording ? 'Stop Motion' : 'Trigger Motion'}
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

        {visibleCameras.length === 0 && cameras.length > 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)', width: '100%' }} className="glass-panel">
            <h3>No cameras in this group</h3>
            <p style={{ fontSize: '14px', marginTop: '8px' }}>Add cameras to this group in Settings → Camera Groups.</p>
          </div>
        )}

        {cameras.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-secondary)', width: '100%' }} className="glass-panel">
            <h3>No Cameras Configured</h3>
            <p style={{ fontSize: '14px', marginTop: '8px' }}>Go to Settings to add your first IP Camera stream.</p>
          </div>
        )}
      </div>
    </div>
  );
}
