import React, { useState, useEffect, useRef, useCallback } from 'react';
import WebRTCPlayer from './WebRTCPlayer';
import PTZControls from './PTZControls';

/**
 * CameraStream — polls /api/cameras/{id}/snapshot every POLL_MS milliseconds.
 * Switching from MJPEG <img> to fetch() polling because MJPEG fires onLoad
 * before any frame arrives, making blank streams indistinguishable from live ones.
 */
const POLL_MS = 150;
const ERROR_THRESHOLD = 4;

function CameraStream({ camera, token, className, style, streamProfile, useWebrtc, micStream }) {
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
      const res = await fetch(`/api/cameras/${camera?.id}/snapshot?profile=${streamProfile}`, {
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
  }, [camera?.id, token, isImageStream, streamProfile]);

  useEffect(() => {
    mountedRef.current = true;
    if (isImageStream) {
      setStatus('live');
      const interval = Math.max(10000, (camera.image_refresh_interval || 3600) * 1000);
      intervalRef.current = setInterval(() => {
        setRefreshKey(Date.now());
      }, interval);
    } else if (isWebsiteStream || useWebrtc) {
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
  }, [camera?.id, fetchFrame, isImageStream, camera?.image_refresh_interval, useWebrtc, isWebsiteStream]);

  // Overlay style — fills the positioned ancestor (camera-stream-container)
  const overlayStyle = {
    position: 'absolute',
    top: 0, left: 0, width: '100%', height: '100%',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: '8px',
  };

  return (
    <>
      {isWebsiteStream ? (
        <iframe
          src={camera.main_url}
          className={className}
          style={{ ...style, border: 'none', backgroundColor: '#000', pointerEvents: 'auto' }}
          title={camera.name}
          allow="microphone; camera; autoplay; fullscreen; display-capture; clipboard-read; clipboard-write"
          allowFullScreen
        />
      ) : useWebrtc && !isImageStream ? (
        <WebRTCPlayer cameraId={camera.id} token={token} className={className} style={{ ...style, objectFit: 'contain' }} micStream={micStream} />
      ) : isImageStream ? (
        <img
          src={`/api/cameras/${camera.id}/proxy_image?token=${token}&t=${refreshKey}`}
          className={className}
          style={style}
          alt="Proxy Stream"
          draggable={false}
          onError={() => setStatus('error')}
        />
      ) : blobUrl ? (
        <img src={blobUrl} className={className} style={style} alt="camera feed" draggable={false} />
      ) : null}
      {status === 'loading' && (
        <div style={{ ...overlayStyle, background: 'rgba(10,14,26,0.85)', color: 'var(--text-muted)', fontSize: '13px' }}>
          <span style={{ fontSize: '24px', animation: 'pulse 1.5s ease-in-out infinite' }}>📡</span>
          <span>Connecting...</span>
        </div>
      )}
      {status === 'error' && (
        <div style={{ ...overlayStyle, background: 'rgba(10,14,26,0.85)', color: 'var(--text-secondary)', fontSize: '13px' }}>
          <span style={{ fontSize: '28px' }}>⚠️</span>
          <span style={{ fontWeight: '600' }}>Stream Unavailable</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Retrying...</span>
        </div>
      )}
    </>
  );
}


export default function CameraDetail({ camera, onClose, recordings, onRefreshRecordings, initialRecording, initialOffset, token, useWebrtc }) {
  const [playbackMode, setPlaybackMode] = useState(false);
  const [activeRecording, setActiveRecording] = useState(null);
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState(null);
  const [mockMotionActive, setMockMotionActive] = useState(false);
  const [micStream, setMicStream] = useState(null);
  const [isTalking, setIsTalking] = useState(false);
  const [micError, setMicError] = useState('');
  const [cameraEvents, setCameraEvents] = useState([]);
  const [dayRecordings, setDayRecordings] = useState([]);
  const d = new Date();
  const localTodayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const [selectedDate, setSelectedDate] = useState(localTodayStr);
  const [theatreMode, setTheatreMode] = useState(true);
  const [streamProfile, setStreamProfile] = useState('hd');
  const videoRef = useRef(null);

  const isMock = camera.sub_url.startsWith('mock://');

  const [zoomScale, setZoomScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const touchStartRef = useRef({ distance: 0, x: 0, y: 0, scale: 1 });
  const containerRef = useRef(null);
  const [videoSrc, setVideoSrc] = useState(null);
  const seekOffsetRef = useRef(0);

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

  useEffect(() => {
    return () => {
      if (micStream) {
        micStream.getTracks().forEach(t => t.stop());
      }
    };
  }, [micStream]);

  const handleTalkDown = async (e) => {
    e.preventDefault();
    if (!useWebrtc) {
      setMicError('WebRTC is required for two-way audio');
      return;
    }
    try {
      setMicError('');
      let stream = micStream;
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setMicStream(stream);
      }
      setIsTalking(true);
    } catch (err) {
      console.error('Mic error:', err);
      setMicError('Mic access denied');
    }
  };

  const handleTalkUp = (e) => {
    e.preventDefault();
    setIsTalking(false);
  };

  // Keyboard navigation & Esc to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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
    fetchTimelineData();
    const interval = setInterval(() => {
      fetchTimelineData();
    }, 3000);
    return () => clearInterval(interval);
  }, [camera.id, selectedDate]);

  const fetchTimelineData = async () => {
    try {
      const evRes = await fetch(`/api/events?camera_id=${camera.id}&date=${selectedDate}&limit=500`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (evRes.ok) {
        setCameraEvents(await evRes.json());
      }
      const recRes = await fetch(`/api/recordings?camera_id=${camera.id}&date=${selectedDate}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (recRes.ok) {
        setDayRecordings(await recRes.json());
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
      setVideoSrc(null);
      return;
    }

    setPlaybackMode(true);
    setActiveRecording(recording);
    
    // Set playhead position
    const start = new Date(recording.start_time);
    const playbackTime = new Date(start.getTime() + offsetSeconds * 1000);
    setCurrentPlaybackTime(playbackTime);

    // Save seek offset and src
    seekOffsetRef.current = offsetSeconds;
    const srcUrl = `/api/recordings/play/${recording.filepath}?token=${token}`;
    setVideoSrc(srcUrl);

    // Seek the video player if already mounted and loaded
    if (videoRef.current) {
      try {
        videoRef.current.currentTime = offsetSeconds;
        videoRef.current.play().catch(err => console.log("Play failed: ", err));
      } catch (err) {
        console.log("Seek failed: ", err);
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = seekOffsetRef.current;
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
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ enabled: nextState })
      });
      if (res.ok) {
        setMockMotionActive(nextState);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const restartStream = async () => {
    try {
      await fetch(`/api/cameras/${camera.id}/restart`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      // Force the camera stream to briefly show loading state by clearing the blob
      // In the context of this refactor, if you have issues, consider exposing a method to trigger re-fetch
    } catch (e) {
      console.error("Error restarting stream:", e);
    }
  };



  return (
    <div className="modal-overlay">
      <div className={`modal-content glass-panel glow-blue${theatreMode ? ' theatre-mode' : ''}`}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className={`camera-status-dot ${playbackMode ? '' : (camera.motion_enabled ? 'recording' : '')}`} />
            <h2 style={{ fontSize: '20px', fontWeight: '700' }}>
              {camera.name} {playbackMode ? '(Playback)' : '(Live Grid)'}
            </h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {!playbackMode && camera.stream_type !== 'website' && camera.stream_type !== 'image_url' && (
              <select
                value={streamProfile}
                onChange={(e) => setStreamProfile(e.target.value)}
                className="form-input"
                style={{ width: 'auto', padding: '6px 28px 6px 12px', height: 'auto', fontSize: '12px', minWidth: '100px', backgroundColor: 'rgba(0,0,0,0.4)', borderColor: 'var(--border-light)' }}
              >
                <option value="hd">JPEG HD (Max Quality)</option>
                <option value="sd">JPEG SD (Good)</option>
                <option value="low">JPEG Low (3G/Poor Wifi)</option>
              </select>
            )}
            <button
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '13px' }}
              onClick={restartStream}
              title="Restart the camera stream if it gets stuck"
            >
              ↻ Restart Stream
            </button>
            <button
              className={`btn-theatre${theatreMode ? ' active' : ''}`}
              onClick={() => setTheatreMode(t => !t)}
              title={theatreMode ? 'Exit Theatre Mode' : 'Theatre Mode — expand video'}
            >
              {theatreMode ? '⊡ Exit Theatre' : '⛶ Theatre Mode'}
            </button>
            <button className="btn btn-secondary btn-icon" onClick={onClose} style={{ fontSize: '20px' }}>✕</button>
          </div>
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
              <CameraStream 
                camera={camera} 
                token={token} 
                className="camera-stream-img" 
                style={transformStyle}
                streamProfile={streamProfile}
                useWebrtc={useWebrtc}
                micStream={isTalking ? micStream : null}
              />
            ) : (
              <video
                ref={videoRef}
                src={videoSrc}
                className="camera-stream-img"
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={handleTimeUpdate}
                onEnded={handleVideoEnded}
                controls
                autoPlay
                style={transformStyle}
              />
            )}
            
            {playbackMode && (
              <div style={{ position: 'absolute', bottom: '16px', right: '16px', zIndex: 20, display: 'flex', gap: '8px' }}>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = videoSrc;
                    a.download = `${camera.name.replace(/\\s+/g, '_')}-clip.mp4`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }}
                  title="Download this recording to your PC"
                >
                  💾 Download Clip
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={() => handlePlayRecording(null)}
                >
                  📡 Back to Live Feed
                </button>
              </div>
            )}
          </div>

        </div>

        {/* Right Side: PTZ Controls, Event Log, Mock Switch */}
        <div className="modal-body-right">
          {useWebrtc && !camera.main_url.includes('website') && (
            <div className="glass-panel" style={{ padding: '16px', marginBottom: '16px' }}>
              <h4 style={{ fontSize: '13px', marginBottom: '8px', color: 'var(--text-secondary)' }}>Two-Way Audio</h4>
              <button 
                className="btn btn-primary"
                onMouseDown={handleTalkDown}
                onMouseUp={handleTalkUp}
                onMouseLeave={handleTalkUp}
                onTouchStart={handleTalkDown}
                onTouchEnd={handleTalkUp}
                style={{ 
                  width: '100%', 
                  background: isTalking ? 'var(--accent-danger)' : undefined,
                  borderColor: micError ? 'var(--accent-danger)' : undefined,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  userSelect: 'none'
                }}
                title={micError || "Hold to Talk"}
              >
                {isTalking ? '🎤 Talking...' : '🎙️ Hold to Talk'}
              </button>
              {micError && <div style={{ color: 'var(--accent-danger)', fontSize: '11px', marginTop: '6px', textAlign: 'center' }}>{micError}</div>}
            </div>
          )}
          <PTZControls cameraId={camera.id} isMock={isMock} token={token} />

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

      {/* Mobile-only sticky back button — prominently visible on Android/touch devices */}
      <button
        className="mobile-back-bar"
        onClick={onClose}
        aria-label="Back to camera grid"
      >
        ← Back to Cameras
      </button>
    </div>
  );
}
