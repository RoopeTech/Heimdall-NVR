import React, { useState, useEffect } from 'react';
import CameraGrid from './components/CameraGrid';
import CameraDetail from './components/CameraDetail';
import EventLog from './components/EventLog';
import Settings from './components/Settings';
import './App.css';

export default function App() {
  const [cameras, setCameras] = useState([]);
  const [recordings, setRecordings] = useState([]);
  const [events, setEvents] = useState([]);
  const [activeTab, setActiveTab] = useState('grid');
  const [selectedCamera, setSelectedCamera] = useState(null);
  
  // States for deep-linked playback from event click
  const [initialRecording, setInitialRecording] = useState(null);
  const [initialOffset, setInitialOffset] = useState(0);

  const fetchCameras = async () => {
    try {
      const res = await fetch('/api/cameras');
      if (res.ok) {
        const data = await res.json();
        setCameras(data);
      }
    } catch (e) {
      console.error('Error fetching cameras:', e);
    }
  };

  const fetchRecordings = async () => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const res = await fetch(`/api/recordings?date=${todayStr}`);
      if (res.ok) {
        const data = await res.json();
        setRecordings(data);
      }
    } catch (e) {
      console.error('Error fetching recordings:', e);
    }
  };

  const fetchEvents = async () => {
    try {
      const res = await fetch('/api/events?limit=40');
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } catch (e) {
      console.error('Error fetching events:', e);
    }
  };

  // Poll database updates
  useEffect(() => {
    fetchCameras();
    fetchRecordings();
    fetchEvents();

    const interval = setInterval(() => {
      fetchRecordings();
      fetchEvents();
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const handleSelectCamera = (camera) => {
    setInitialRecording(null);
    setInitialOffset(0);
    setSelectedCamera(camera);
  };

  const handleCloseDetail = () => {
    setSelectedCamera(null);
    setInitialRecording(null);
    setInitialOffset(0);
    fetchRecordings(); // refresh recordings in grid view
  };

  const handleEventClick = (event) => {
    // Find the camera associated with this event
    const cam = cameras.find(c => c.id === event.camera_id);
    if (!cam) return;

    // Check if the event has a corresponding recording
    const eventTime = new Date(event.timestamp).getTime();
    
    // Find a recording for this camera that covers the event time
    const matchingRec = recordings.find(rec => {
      if (rec.camera_id !== cam.id) return false;
      const start = new Date(rec.start_time).getTime();
      const end = rec.end_time ? new Date(rec.end_time).getTime() : Date.now();
      return eventTime >= start && eventTime <= end;
    });

    if (matchingRec) {
      const start = new Date(matchingRec.start_time).getTime();
      const offsetSeconds = Math.max(0, (eventTime - start) / 1000);
      setInitialRecording(matchingRec);
      setInitialOffset(offsetSeconds);
    }

    setSelectedCamera(cam);
  };

  // Compute active stats
  const activeCamerasCount = cameras.length;
  const recordingCamerasCount = cameras.filter(cam => 
    recordings.some(r => r.camera_id === cam.id && !r.end_time)
  ).length;

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-container">
          <span className="logo-icon">📹</span>
          <span className="logo-text">Antigravity NVR</span>
        </div>

        <nav className="nav-tabs">
          <button 
            className={`nav-tab ${activeTab === 'grid' ? 'active' : ''}`}
            onClick={() => setActiveTab('grid')}
          >
            📺 Live Stream Grid
          </button>
          <button 
            className={`nav-tab ${activeTab === 'events' ? 'active' : ''}`}
            onClick={() => setActiveTab('events')}
          >
            🔔 Activity Logs
          </button>
          <button 
            className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            ⚙️ System Settings
          </button>
        </nav>

        <div style={{ display: 'flex', gap: '16px', fontSize: '13px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Devices:</span>
            <span style={{ fontWeight: '700' }}>{activeCamerasCount}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Recording:</span>
            <span style={{ fontWeight: '700', color: recordingCamerasCount > 0 ? 'var(--accent-motion)' : 'var(--text-primary)' }}>
              {recordingCamerasCount} active
            </span>
          </div>
        </div>
      </header>

      <main className="app-main">
        {activeTab === 'grid' && (
          <div className="dashboard-grid">
            <CameraGrid 
              cameras={cameras} 
              recordings={recordings}
              onSelectCamera={handleSelectCamera}
              onRefreshRecordings={fetchRecordings}
            />
            <EventLog 
              events={events.slice(0, 10)} 
              onEventClick={handleEventClick}
            />
          </div>
        )}

        {activeTab === 'events' && (
          <div className="view-container">
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
              <EventLog 
                events={events} 
                onEventClick={handleEventClick}
              />
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <Settings 
            cameras={cameras} 
            onReload={fetchCameras}
          />
        )}
      </main>

      {selectedCamera && (
        <CameraDetail 
          camera={selectedCamera}
          onClose={handleCloseDetail}
          recordings={recordings}
          onRefreshRecordings={fetchRecordings}
          initialRecording={initialRecording}
          initialOffset={initialOffset}
        />
      )}
    </div>
  );
}
