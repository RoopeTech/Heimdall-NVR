import React, { useState, useEffect, useRef } from 'react';
import Timeline from './Timeline';
import PTZControls from './PTZControls';

export default function CameraDetail({ camera, onClose, recordings, onRefreshRecordings, initialRecording, initialOffset }) {
  const [playbackMode, setPlaybackMode] = useState(false);
  const [activeRecording, setActiveRecording] = useState(null);
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState(null);
  const [mockMotionActive, setMockMotionActive] = useState(true);
  const [cameraEvents, setCameraEvents] = useState([]);
  const videoRef = useRef(null);

  const isMock = camera.sub_url.startsWith('mock://');

  const [zoomScale, setZoomScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const touchStartRef = useRef({ distance: 0, x: 0, y: 0, scale: 1 });
  const containerRef = useRef(null);

  // Reset zoom when camera or playback mode changes
  useEffect(() => {
    resetZoom();
  }, [camera.id, playbackMode]);

  const resetZoom = () => {
    setZoomScale(1);
    setPanX(0);
    setPanY(0);
    setIsDragging(false);
  };

  const handleWheel = (e) => {
    // Zoom in/out
    const zoomFactor = 0.15;
    let newScale = zoomScale + (e.deltaY < 0 ? zoomFactor : -zoomFactor);
    newScale = Math.max(1, Math.min(8, newScale));
    
    if (newScale === 1) {
      setPanX(0);
      setPanY(0);
    }
    setZoomScale(newScale);
  };

  const handleMouseDown = (e) => {
    if (zoomScale <= 1) return;
    if (playbackMode) {
      const rect = containerRef.current.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      if (clickY > rect.height - 60) return; // avoid dragging controls
    }
    setIsDragging(true);
    setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    
    // Simple boundary clamping to keep image on screen
    const maxPanX = (zoomScale - 1) * (containerRef.current?.clientWidth || 600) / 2;
    const maxPanY = (zoomScale - 1) * (containerRef.current?.clientHeight || 400) / 2;
    
    setPanX(Math.max(-maxPanX, Math.min(maxPanX, dx)));
    setPanY(Math.max(-maxPanY, Math.min(maxPanY, dy)));
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  const getTouchDistance = (t1, t2) => {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      if (zoomScale > 1) {
        if (playbackMode) {
          const rect = containerRef.current.getBoundingClientRect();
          const touchY = e.touches[0].clientY - rect.top;
          if (touchY > rect.height - 60) return; // avoid dragging controls
        }
        setIsDragging(true);
        setDragStart({ x: e.touches[0].clientX - panX, y: e.touches[0].clientY - panY });
      }
    } else if (e.touches.length === 2) {
      setIsDragging(false);
      const dist = getTouchDistance(e.touches[0], e.touches[1]);
      touchStartRef.current = {
        distance: dist,
        x: panX,
        y: panY,
        scale: zoomScale
      };
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 1 && isDragging) {
      const dx = e.touches[0].clientX - dragStart.x;
      const dy = e.touches[0].clientY - dragStart.y;
      
      const maxPanX = (zoomScale - 1) * (containerRef.current?.clientWidth || 600) / 2;
      const maxPanY = (zoomScale - 1) * (containerRef.current?.clientHeight || 400) / 2;
      
      setPanX(Math.max(-maxPanX, Math.min(maxPanX, dx)));
      setPanY(Math.max(-maxPanY, Math.min(maxPanY, dy)));
    } else if (e.touches.length === 2) {
      const dist = getTouchDistance(e.touches[0], e.touches[1]);
      const start = touchStartRef.current;
      if (start.distance > 0) {
        const factor = dist / start.distance;
        let newScale = start.scale * factor;
        newScale = Math.max(1, Math.min(8, newScale));
        
        if (newScale === 1) {
          setPanX(0);
          setPanY(0);
        } else {
          const maxPanX = (newScale - 1) * (containerRef.current?.clientWidth || 600) / 2;
          const maxPanY = (newScale - 1) * (containerRef.current?.clientHeight || 400) / 2;
          setPanX(Math.max(-maxPanX, Math.min(maxPanX, start.x * factor)));
          setPanY(Math.max(-maxPanY, Math.min(maxPanY, start.y * factor)));
        }
        setZoomScale(newScale);
      }
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const transformStyle = {
    transform: `translate(${panX}px, ${panY}px) scale(${zoomScale})`,
    transformOrigin: 'center center',
    cursor: zoomScale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
    transition: isDragging ? 'none' : 'transform 0.1s ease-out',
    touchAction: 'none',
  };

  // Load initial recording deep link if provided from Activity Log click
  useEffect(() => {
    if (initialRecording) {
      // Small timeout to ensure video element is mounted if it is rendered
      setTimeout(() => {
        handlePlayRecording(initialRecording, initialOffset || 0);
      }, 100);
    }
  }, [initialRecording, initialOffset]);

  // Poll camera-specific events & recordings
  useEffect(() => {
    fetchEvents();
    const interval = setInterval(() => {
      fetchEvents();
    }, 3000);
    return () => clearInterval(interval);
  }, [camera.id]);

  const fetchEvents = async () => {
    try {
      const res = await fetch(`/api/events?camera_id=${camera.id}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setCameraEvents(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handlePlayRecording = (recording, offsetSeconds) => {
    if (!recording) {
      // Clicked on a blank space in timeline, go back to Live
      setPlaybackMode(false);
      setActiveRecording(null);
      setCurrentPlaybackTime(null);
      return;
    }

    setPlaybackMode(true);
    setActiveRecording(recording);
    
    // Set playhead position
    const start = new Date(recording.start_time);
    const playbackTime = new Date(start.getTime() + offsetSeconds * 1000);
    setCurrentPlaybackTime(playbackTime);

    // Seek the video player
    if (videoRef.current) {
      videoRef.current.src = `/api/recordings/play/${recording.filepath}`;
      videoRef.current.currentTime = offsetSeconds;
      videoRef.current.play().catch(err => console.log("Play failed: ", err));
    }
  };

  // Listen to video time updates to move the timeline playhead
  const handleTimeUpdate = () => {
    if (!videoRef.current || !activeRecording) return;
    const start = new Date(activeRecording.start_time);
    const playbackTime = new Date(start.getTime() + videoRef.current.currentTime * 1000);
    setCurrentPlaybackTime(playbackTime);
  };

  const handleVideoEnded = () => {
    // Return to live view or stay on the frame
    setPlaybackMode(false);
    setActiveRecording(null);
    setCurrentPlaybackTime(null);
    onRefreshRecordings(); // refresh recordings in case a new one was saved
  };

  const toggleMockMotion = async () => {
    const nextState = !mockMotionActive;
    try {
      const res = await fetch(`/api/cameras/${camera.id}/mock_motion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState })
      });
      if (res.ok) {
        setMockMotionActive(nextState);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const selectedDate = new Date().toISOString().split('T')[0]; // today's date

  return (
    <div className="modal-overlay">
      <div className="modal-content glass-panel glow-blue">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className={`camera-status-dot ${playbackMode ? '' : (camera.motion_enabled ? 'recording' : '')}`} />
            <h2 style={{ fontSize: '20px', fontWeight: '700' }}>
              {camera.name} {playbackMode ? '(Playback)' : '(Live Grid)'}
            </h2>
          </div>
          <button className="btn btn-secondary btn-icon" onClick={onClose} style={{ fontSize: '20px' }}>
            ✕
          </button>
        </div>

        {/* Left Side: Video Player & Timeline */}
        <div className="modal-body-left">
          <div 
            ref={containerRef}
            className="camera-stream-container" 
            style={{ borderRadius: '12px', overflow: 'hidden' }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUpOrLeave}
            onMouseLeave={handleMouseUpOrLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {zoomScale > 1 && (
              <button 
                className="btn btn-secondary" 
                onClick={resetZoom}
                style={{ 
                  position: 'absolute', 
                  top: '16px', 
                  left: '16px', 
                  zIndex: 30, 
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1px solid var(--border-light)',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: 'white',
                  cursor: 'pointer'
                }}
              >
                🔍 Reset Zoom ({(zoomScale * 100).toFixed(0)}%)
              </button>
            )}

            {!playbackMode ? (
              <img 
                className="camera-stream-img"
                src={`/api/cameras/${camera.id}/live?t=${Date.now()}`}
                alt={camera.name}
                style={transformStyle}
                draggable={false}
              />
            ) : (
              <video
                ref={videoRef}
                className="camera-stream-img"
                onTimeUpdate={handleTimeUpdate}
                onEnded={handleVideoEnded}
                controls
                autoPlay
                style={transformStyle}
              />
            )}
            
            {playbackMode && (
              <button 
                className="btn btn-primary" 
                onClick={() => handlePlayRecording(null)}
                style={{ position: 'absolute', bottom: '16px', right: '16px', zIndex: 20 }}
              >
                📡 Back to Live Feed
              </button>
            )}
          </div>

          <Timeline 
            recordings={recordings.filter(r => r.camera_id === camera.id)}
            selectedDate={selectedDate}
            onPlayRecording={handlePlayRecording}
            currentPlaybackTime={playbackMode ? currentPlaybackTime : new Date()}
          />
        </div>

        {/* Right Side: PTZ Controls, Event Log, Mock Switch */}
        <div className="modal-body-right">
          <PTZControls cameraId={camera.id} isMock={isMock} />

          {isMock && (
            <div className="glass-panel" style={{ padding: '16px', border: '1px dashed var(--border-glow)' }}>
              <h4 style={{ fontSize: '13px', marginBottom: '8px', color: 'var(--text-secondary)' }}>⚙️ Simulation Panel</h4>
              <button 
                className={`btn ${mockMotionActive ? 'btn-danger' : 'btn-primary'}`}
                onClick={toggleMockMotion}
                style={{ width: '100%' }}
              >
                {mockMotionActive ? '⏹️ Stop Simulated Intruder' : '🏃 Start Simulated Intruder'}
              </button>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'center' }}>
                Enabling simulated intruder triggers motion detection and saves clips.
              </div>
            </div>
          )}

          <div style={{ flex: 1, overflowY: 'auto' }}>
            <h4 style={{ fontSize: '14px', marginBottom: '12px', fontWeight: '700' }}>Recent Clips ({recordings.filter(r => r.camera_id === camera.id).length})</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {recordings
                .filter(r => r.camera_id === camera.id)
                .slice(0, 5)
                .map(rec => (
                  <div 
                    key={rec.id}
                    onClick={() => handlePlayRecording(rec, 0)}
                    style={{
                      padding: '10px',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--border-light)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      transition: 'var(--transition-fast)'
                    }}
                    className="event-item"
                  >
                    <div>
                      <div style={{ fontWeight: '600' }}>
                        {new Date(rec.start_time).toLocaleTimeString()}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        {rec.duration ? `${rec.duration.toFixed(1)}s` : 'Active'}
                      </div>
                    </div>
                    <span style={{ color: 'var(--primary)' }}>▶ Play</span>
                  </div>
                ))}
              {recordings.filter(r => r.camera_id === camera.id).length === 0 && (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>
                  No recordings logged for this camera yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
