import React, { useState, useEffect } from 'react';
import CameraGrid from './components/CameraGrid';
import CameraDetail from './components/CameraDetail';
import EventLog from './components/EventLog';
import Settings from './components/Settings';
import Login from './components/Login';
import RecordingsArchive from './components/RecordingsArchive';
import './App.css';

export default function App() {
  const [cameras, setCameras] = useState([]);
  const [recordings, setRecordings] = useState([]);
  const [events, setEvents] = useState([]);
  const [activeTab, setActiveTab] = useState('grid');
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [appTitle, setAppTitle] = useState('Heimdall NVR');
  
  // Auth states
  const [token, setToken] = useState(localStorage.getItem('session_token') || '');
  const [user, setUser] = useState(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  
  // Change Password form states
  const [currPwd, setCurrPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmNewPwd, setConfirmNewPwd] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  
  // States for deep-linked playback from event click
  const [initialRecording, setInitialRecording] = useState(null);
  const [initialOffset, setInitialOffset] = useState(0);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAppTitle(data.app_title);
        document.title = data.app_title;
      }
    } catch (e) {
      console.error('Error fetching settings:', e);
    }
  };

  const fetchCameras = async () => {
    try {
      const res = await fetch('/api/cameras', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
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
      const d = new Date();
      const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const res = await fetch(`/api/recordings?date=${todayStr}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
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
      const res = await fetch('/api/events?limit=40', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } catch (e) {
      console.error('Error fetching events:', e);
    }
  };

  const checkUpdateStatus = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/settings/check_update', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUpdateAvailable(data.update_available);
      }
    } catch (e) {
      console.error('Error checking updates:', e);
    }
  };

  // Verify token session on startup
  useEffect(() => {
    const initSession = async () => {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('token');
      if (urlToken) {
        localStorage.setItem('session_token', urlToken);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      
      const storedToken = urlToken || localStorage.getItem('session_token');
      if (storedToken) {
        try {
          const res = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${storedToken}` }
          });
          if (res.ok) {
            const userData = await res.json();
            setUser(userData);
            setToken(storedToken);
            return;
          }
        } catch (e) {
          console.error('Session validation error:', e);
        }
      }
      handleLogoutLocal();
    };
    initSession();
  }, []);

  // Poll database updates when user is authenticated
  useEffect(() => {
    if (!user || !token) return;

    fetchSettings();
    fetchCameras();
    fetchRecordings();
    fetchEvents();
    checkUpdateStatus();

    const interval = setInterval(() => {
      fetchRecordings();
      fetchEvents();
    }, 4000);

    return () => clearInterval(interval);
  }, [user, token]);

  const handleLoginSuccess = (newToken, newUser) => {
    localStorage.setItem('session_token', newToken);
    setToken(newToken);
    setUser(newUser);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (e) {
      console.error('Error calling logout API:', e);
    }
    handleLogoutLocal();
  };

  const handleLogoutLocal = () => {
    localStorage.removeItem('session_token');
    setToken('');
    setUser(null);
    setActiveTab('grid');
    setShowProfileMenu(false);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwdError('');
    setPwdSuccess('');

    if (newPwd !== confirmNewPwd) {
      setPwdError('New passwords do not match');
      return;
    }

    try {
      const res = await fetch('/api/auth/change_password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          current_password: currPwd,
          new_password: newPwd
        })
      });

      if (res.ok) {
        setPwdSuccess('Password updated successfully!');
        setCurrPwd('');
        setNewPwd('');
        setConfirmNewPwd('');
        
        if (user.default_password_warning) {
          setUser({ ...user, default_password_warning: false });
        }
        
        setTimeout(() => {
          setShowChangePassword(false);
          setPwdSuccess('');
        }, 1500);
      } else {
        const data = await res.json();
        setPwdError(data.detail || 'Failed to update password');
      }
    } catch (err) {
      setPwdError('Network error updating password');
    }
  };

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

  if (!user) {
    return <Login appTitle={appTitle} onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="app-container">
      {updateAvailable && (
        <div style={{
          background: 'var(--primary)',
          color: '#000',
          padding: '8px 16px',
          textAlign: 'center',
          fontSize: '13px',
          fontWeight: '600',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 4px 12px rgba(0, 242, 254, 0.2)',
          zIndex: 1000,
        }}>
          🚀 System update available! New commits are ready in your repository. 
          <button 
            onClick={() => setActiveTab('settings')} 
            style={{
              background: '#fff',
              color: '#000',
              border: 'none',
              padding: '2px 8px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
              marginLeft: '10px',
              fontSize: '11px'
            }}
          >
            Go to Updates
          </button>
        </div>
      )}

      {user.default_password_warning && (
        <div style={{
          background: 'var(--accent-warning)',
          color: '#000',
          padding: '8px 16px',
          textAlign: 'center',
          fontSize: '13px',
          fontWeight: '600',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 4px 12px rgba(245, 158, 11, 0.2)',
          zIndex: 1000,
        }}>
          ⚠️ Warning: You are using the default admin password. Please change it immediately in your Profile settings.
        </div>
      )}

      <header className="app-header">
        <div className="logo-container">
          <span className="logo-icon">📹</span>
          <span className="logo-text">{appTitle}</span>
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
            className={`nav-tab ${activeTab === 'recordings' ? 'active' : ''}`} 
            onClick={() => setActiveTab('recordings')}
          >
            <span className="tab-icon">📼</span> Recordings
          </button>
          {user.role === 'admin' && (
            <button 
              className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              ⚙️ System Settings
            </button>
          )}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
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

          <div style={{ position: 'relative' }}>
            <button 
              className="btn btn-secondary" 
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              👤 {user.username} <span style={{ fontSize: '9px', opacity: 0.7, textTransform: 'uppercase' }}>({user.role})</span>
            </button>
            
            {showProfileMenu && (
              <div className="glass-panel" style={{
                position: 'absolute',
                right: 0,
                top: '40px',
                width: '180px',
                zIndex: 100,
                padding: '8px',
                border: '1px solid var(--border-light)',
                boxShadow: 'var(--glass-shadow)',
                background: 'rgba(15, 23, 42, 0.95)',
              }}>
                <button 
                  className="settings-nav-btn" 
                  style={{ width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: '12px', border: 'none', background: 'none', cursor: 'pointer' }}
                  onClick={() => {
                    setShowChangePassword(true);
                    setShowProfileMenu(false);
                  }}
                >
                  🔑 Change Password
                </button>
                <div style={{ height: '1px', background: 'var(--border-light)', margin: '4px 0' }} />
                <button 
                  className="settings-nav-btn" 
                  style={{ width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: '12px', border: 'none', background: 'none', color: 'var(--accent-motion)', cursor: 'pointer' }}
                  onClick={handleLogout}
                >
                  🚪 Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="app-main">
        {activeTab === 'grid' && (
          <CameraGrid 
            cameras={cameras} 
            recordings={recordings}
            onSelectCamera={handleSelectCamera}
            onRefreshRecordings={fetchRecordings}
            token={token}
          />
        )}


        {activeTab === 'events' && (
          <div className="view-container">
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
              <EventLog 
                events={events} 
                onEventClick={handleEventClick}
                token={token}
              />
            </div>
          </div>
        )}

        {activeTab === 'recordings' && (
          <RecordingsArchive 
            cameras={cameras} 
            token={token}
          />
        )}

        {activeTab === 'settings' && user.role === 'admin' && (
          <Settings 
            cameras={cameras} 
            onReload={fetchCameras}
            onReloadSettings={fetchSettings}
            token={token}
            currentUser={user}
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
          token={token}
        />
      )}

      {showChangePassword && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyItems: 'center', zIndex: 1000 }}>
          <div className="modal-content glass-panel" style={{ maxWidth: '400px', width: '90%', margin: 'auto', padding: '24px' }}>
            <h3 style={{ fontSize: '18px', marginBottom: '16px' }}>Change Password</h3>
            {pwdError && (
              <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--accent-motion)', borderRadius: '6px', color: 'var(--accent-motion)', fontSize: '12px', marginBottom: '12px' }}>
                {pwdError}
              </div>
            )}
            {pwdSuccess && (
              <div style={{ padding: '8px 12px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid var(--accent-success)', borderRadius: '6px', color: 'var(--accent-success)', fontSize: '12px', marginBottom: '12px' }}>
                {pwdSuccess}
              </div>
            )}
            <form onSubmit={handleChangePassword}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '10px' }}>Current Password</label>
                <input 
                  type="password" 
                  className="form-input" 
                  value={currPwd} 
                  onChange={(e) => setCurrPwd(e.target.value)} 
                  required 
                />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '10px' }}>New Password</label>
                <input 
                  type="password" 
                  className="form-input" 
                  value={newPwd} 
                  onChange={(e) => setNewPwd(e.target.value)} 
                  required 
                />
              </div>
              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label className="form-label" style={{ fontSize: '10px' }}>Confirm New Password</label>
                <input 
                  type="password" 
                  className="form-input" 
                  value={confirmNewPwd} 
                  onChange={(e) => setConfirmNewPwd(e.target.value)} 
                  required 
                />
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => {
                  setShowChangePassword(false);
                  setCurrPwd('');
                  setNewPwd('');
                  setConfirmNewPwd('');
                  setPwdError('');
                  setPwdSuccess('');
                }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
