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
          <div className="camera-stream-container" style={{ borderRadius: '12px', overflow: 'hidden' }}>
            {!playbackMode ? (
              <img 
                className="camera-stream-img"
                src={`/api/cameras/${camera.id}/live?t=${Date.now()}`}
                alt={camera.name}
              />
            ) : (
              <video
                ref={videoRef}
                className="camera-stream-img"
                onTimeUpdate={handleTimeUpdate}
                onEnded={handleVideoEnded}
                controls
                autoPlay
              />
            )}
            
            {playbackMode && (
              <button 
                className="btn btn-primary" 
                onClick={() => handlePlayRecording(null)}
                style={{ position: 'absolute', bottom: '16px', right: '16px', zindex: 20 }}
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
