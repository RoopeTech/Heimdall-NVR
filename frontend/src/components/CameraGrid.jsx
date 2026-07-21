import React, { useState, useEffect, useRef, useCallback } from 'react';
import WebRTCPlayer from './WebRTCPlayer';

/**
 * CameraStream — polls /api/cameras/{id}/snapshot every POLL_MS milliseconds.
 * Renders as a React Fragment so img is a direct child of the container.
 */
const POLL_MS = 150;
const ERROR_THRESHOLD = 4;

function CameraStream({ camera, token, className, useWebrtc }) {
  const [blobUrl, setBlobUrl]        = useState(null);
  const [status, setStatus]          = useState('loading');
  const intervalRef                  = useRef(null);
  const prevBlobRef                  = useRef(null);
  const consecutiveErrorsRef         = useRef(0);
  const mountedRef                   = useRef(true);
  const [refreshKey, setRefreshKey]  = useState(Date.now());

  const isImageStream = camera?.stream_type === 'image_url';
  const isWebsiteStream = camera?.stream_type === 'website';

  const fetchFrame = useCallback(async () => {
    if (isImageStream || isWebsiteStream) return;
    try {
      const res = await fetch(`/api/cameras/${camera?.id}/snapshot`, {
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
  }, [camera?.id, token, isImageStream]);

  useEffect(() => {
    mountedRef.current = true;
    if (isImageStream) {
      setStatus('live');
      const interval = Math.max(10000, (camera.image_refresh_interval || 3600) * 1000);
      intervalRef.current = setInterval(() => {
        setRefreshKey(Date.now());
      }, interval);
    } else if (isWebsiteStream) {
      setStatus('live');
    } else {
      setStatus('loading');
      setBlobUrl(null);
      consecutiveErrorsRef.current = 0;
      
      const pollLoop = async () => {
        if (!mountedRef.current) return;
        const start = Date.now();
        await fetchFrame();
        if (!mountedRef.current) return;
        const elapsed = Date.now() - start;
        const delay = Math.max(30, POLL_MS - elapsed);
        intervalRef.current = setTimeout(pollLoop, delay);
      };
      pollLoop();
    }
    return () => {
      mountedRef.current = false;
      if (isImageStream) {
        clearInterval(intervalRef.current);
      } else {
        clearTimeout(intervalRef.current);
      }
      if (prevBlobRef.current) {
        URL.revokeObjectURL(prevBlobRef.current);
        prevBlobRef.current = null;
      }
    };
  }, [camera?.id, fetchFrame, isImageStream, camera?.image_refresh_interval]);

  const overlayStyle = {
    position: 'absolute',
    top: 0, left: 0, width: '100%', height: '100%',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: '8px',
    background: 'rgba(6,9,19,0.92)',
  };

  return (
    <>
      {isWebsiteStream ? (
        <iframe
          src={camera.main_url}
          className={className}
          style={{ border: 'none', pointerEvents: 'none', backgroundColor: '#000' }}
          title={camera.name}
          allow="microphone; camera; autoplay; fullscreen; display-capture; clipboard-read; clipboard-write"
          allowFullScreen
        />
      ) : useWebrtc && !isWebsiteStream && !isImageStream ? (
        <WebRTCPlayer cameraId={camera.id} token={token} className={className} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      ) : isImageStream ? (
        <img
          src={`/api/cameras/${camera.id}/proxy_image?token=${token}&t=${refreshKey}`}
          className={className}
          alt="Proxy Stream"
          draggable={false}
          onError={() => setStatus('error')}
        />
      ) : blobUrl ? (
        <img src={blobUrl} className={className} alt="camera feed" draggable={false} />
      ) : null}
      {status === 'loading' && (
        <div style={{ ...overlayStyle, color: 'var(--text-muted)', fontSize: '12px' }}>
          <span style={{ fontSize: '28px', animation: 'pulse 1.5s ease-in-out infinite' }}>📡</span>
          <span>Connecting...</span>
        </div>
      )}
      {status === 'error' && (
        <div style={{ ...overlayStyle, color: 'var(--text-secondary)', fontSize: '12px' }}>
          <span style={{ fontSize: '28px' }}>⚠️</span>
          <span style={{ fontWeight: '600' }}>Stream Unavailable</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Retrying...</span>
        </div>
      )}
    </>
  );
}

// Compute optimal grid columns for N cameras to maximize tile size
function getGridCols(count) {
  if (count <= 1) return 1;
  if (count <= 2) return 2;
  if (count <= 4) return 2;
  if (count <= 6) return 3;
  if (count <= 9) return 3;
  if (count <= 12) return 4;
  return 4;
}

// Layout presets — columns the user can force-override with the selector
const LAYOUT_PRESETS = [
  { value: 'auto',  label: 'Auto' },
  { value: '1',     label: '1×' },
  { value: '2',     label: '2×' },
  { value: '3',     label: '3×' },
  { value: '4',     label: '4×' },
];

export default function CameraGrid({ cameras, recordings, onSelectCamera, onRefreshRecordings, token, useWebrtc }) {
  const [layoutCols, setLayoutCols] = useState(() => {
    return localStorage.getItem('nvr_layout_cols') || 'auto';
  });
  const [groups, setGroups]         = useState([]);
  const [activeGroup, setActiveGroup] = useState(() => {
    const saved = localStorage.getItem('nvr_active_group');
    if (!saved || saved === 'null') return null;
    const parsed = parseInt(saved, 10);
    return isNaN(parsed) ? null : parsed;
  });

  // Save activeGroup and layoutCols to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('nvr_active_group', activeGroup === null ? 'null' : activeGroup.toString());
  }, [activeGroup]);
  
  useEffect(() => {
    localStorage.setItem('nvr_layout_cols', layoutCols);
  }, [layoutCols]);

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

  const cols = layoutCols === 'auto'
    ? getGridCols(visibleCameras.length)
    : parseInt(layoutCols, 10);

  const count = visibleCameras.length;

  return (
    <div className="nvr-montage-root fade-in">

      {/* ── Slim toolbar ── */}
      <div className="nvr-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500' }}>
            📹 {count} Camera{count !== 1 ? 's' : ''}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Group filter chips */}
          {groups.length > 0 && (
            <div className="group-filter-bar" style={{ marginBottom: 0 }}>
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

          {/* Layout selector */}
          <div className="nvr-layout-btns">
            {LAYOUT_PRESETS.map(p => (
              <button
                key={p.value}
                className={`nvr-layout-btn ${layoutCols === p.value ? 'active' : ''}`}
                onClick={() => setLayoutCols(p.value)}
                title={`${p.label} column layout`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Camera mosaic grid ── */}
      {count === 0 && cameras.length > 0 ? (
        <div className="nvr-empty-state glass-panel">
          <h3>No cameras in this group</h3>
          <p>Add cameras to this group in Settings → Camera Groups.</p>
        </div>
      ) : count === 0 ? (
        <div className="nvr-empty-state glass-panel">
          <h3>No Cameras Configured</h3>
          <p>Go to Settings to add your first IP Camera stream.</p>
        </div>
      ) : (
        <div
          className="nvr-mosaic"
          style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
          }}
        >
          {visibleCameras.map((cam) => {
            const isRecording = isCameraRecording(cam.id);
            const isMock = cam.sub_url?.startsWith('mock://');

            return (
              <div
                key={cam.id}
                className={`nvr-cell ${isRecording ? 'nvr-cell-recording' : ''}`}
                onClick={() => onSelectCamera(cam)}
                title={`${cam.name} — click to open detail view`}
              >
                {/* Full-bleed stream */}
                <div className="nvr-cell-stream">
                  <CameraStream camera={cam} token={token} className="nvr-cell-img" />
                </div>

                {/* Top-left: camera name label */}
                <div className="nvr-cell-label">
                  <span className={`nvr-status-dot ${isRecording ? 'rec' : ''}`} />
                  <span className="nvr-cam-name">{cam.name}</span>
                  {isMock && <span className="nvr-badge-sim">SIM</span>}
                </div>

                {/* Top-right: REC badge */}
                {isRecording && (
                  <div className="nvr-cell-rec-badge">
                    🔴 REC
                  </div>
                )}

                {/* Bottom-right: action buttons (mock trigger + open detail) */}
                <div className="nvr-cell-actions" onClick={e => e.stopPropagation()}>
                  {isMock && (
                    <button
                      className={`nvr-action-btn ${isRecording ? 'danger' : ''}`}
                      onClick={(e) => triggerMockMotion(e, cam.id, isRecording)}
                      title={isRecording ? 'Stop Motion' : 'Trigger Motion'}
                    >
                      {isRecording ? '⏹' : '🏃'}
                    </button>
                  )}
                  <button
                    className="nvr-action-btn"
                    onClick={() => onSelectCamera(cam)}
                    title="Open Detail / PTZ"
                  >
                    ⛶
                  </button>
                </div>

                {/* Hover shimmer overlay */}
                <div className="nvr-cell-hover-ring" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
