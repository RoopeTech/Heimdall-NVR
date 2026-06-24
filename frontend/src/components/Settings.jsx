import React, { useState, useEffect } from 'react';

export default function Settings({ cameras, onReload, onReloadSettings }) {
  const [activeTab, setActiveTab] = useState('list');
  const [editingCamera, setEditingCamera] = useState(null);
  const [appTitleInput, setAppTitleInput] = useState('');
  
  // Form State
  const [name, setName] = useState('');
  const [mainUrl, setMainUrl] = useState('');
  const [subUrl, setSubUrl] = useState('');
  const [ptzIp, setPtzIp] = useState('');
  const [ptzPort, setPtzPort] = useState(80);
  const [ptzUser, setPtzUser] = useState('');
  const [ptzPass, setPtzPass] = useState('');
  const [ptzType, setPtzType] = useState('onvif');
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [sensitivity, setSensitivity] = useState(50);
  const [threshold, setThreshold] = useState(25);
  const [preRoll, setPreRoll] = useState(0);
  const [postRoll, setPostRoll] = useState(5);
  const [recordMode, setRecordMode] = useState('motion');
  const [rtspUser, setRtspUser] = useState('');
  const [rtspPass, setRtspPass] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Clear notifications after 3 seconds
  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess('');
        setError('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  // Load app title settings when settings loads or activeTab changes
  useEffect(() => {
    const fetchSysSettings = async () => {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          setAppTitleInput(data.app_title || '');
        }
      } catch (e) {
        console.error('Error fetching settings inside Settings.jsx:', e);
      }
    };
    fetchSysSettings();
  }, [activeTab]);

  const handleSaveSystemSettings = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_title: appTitleInput }),
      });
      if (res.ok) {
        setSuccess('System settings updated successfully!');
        if (onReloadSettings) {
          onReloadSettings();
        }
      } else {
        setError('Failed to update system settings.');
      }
    } catch (err) {
      setError('Network error saving system settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicate = (cam) => {
    setEditingCamera(null);
    setName(`${cam.name} - Copy`);
    setMainUrl(cam.main_url);
    setSubUrl(cam.sub_url);
    setPtzIp(cam.ptz_ip || '');
    setPtzPort(cam.ptz_port || 80);
    setPtzUser(cam.ptz_user || '');
    setPtzPass(cam.ptz_pass || '');
    setPtzType(cam.ptz_type || 'onvif');
    setMotionEnabled(cam.motion_enabled === 1);
    setSensitivity(cam.motion_sensitivity);
    setThreshold(cam.motion_threshold);
    setPreRoll(cam.pre_roll || 0);
    setPostRoll(cam.post_roll || 5);
    setRecordMode(cam.record_mode || 'motion');
    setRtspUser(cam.rtsp_user || '');
    setRtspPass(cam.rtsp_pass || '');
    setActiveTab('form');
  };

  const loadCameraIntoForm = (cam) => {
    setEditingCamera(cam);
    setName(cam.name);
    setMainUrl(cam.main_url);
    setSubUrl(cam.sub_url);
    setPtzIp(cam.ptz_ip || '');
    setPtzPort(cam.ptz_port || 80);
    setPtzUser(cam.ptz_user || '');
    setPtzPass(cam.ptz_pass || '');
    setPtzType(cam.ptz_type || 'onvif');
    setMotionEnabled(cam.motion_enabled === 1);
    setSensitivity(cam.motion_sensitivity);
    setThreshold(cam.motion_threshold);
    setPreRoll(cam.pre_roll || 0);
    setPostRoll(cam.post_roll || 5);
    setRecordMode(cam.record_mode || 'motion');
    setRtspUser(cam.rtsp_user || '');
    setRtspPass(cam.rtsp_pass || '');
    setActiveTab('form');
  };

  const resetForm = () => {
    setEditingCamera(null);
    setName('');
    setMainUrl('');
    setSubUrl('');
    setPtzIp('');
    setPtzPort(80);
    setPtzUser('');
    setPtzPass('');
    setPtzType('onvif');
    setMotionEnabled(true);
    setSensitivity(50);
    setThreshold(25);
    setPreRoll(0);
    setPostRoll(5);
    setRecordMode('motion');
    setRtspUser('');
    setRtspPass('');
  };

  const handleCreateNew = () => {
    resetForm();
    setActiveTab('form');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    const payload = {
      name,
      main_url: mainUrl,
      sub_url: subUrl,
      ptz_ip: ptzIp || null,
      ptz_port: parseInt(ptzPort) || null,
      ptz_user: ptzUser || null,
      ptz_pass: ptzPass || null,
      ptz_type: ptzType,
      motion_enabled: motionEnabled ? 1 : 0,
      motion_sensitivity: parseInt(sensitivity),
      motion_threshold: parseInt(threshold),
      pre_roll: parseInt(preRoll),
      post_roll: parseInt(postRoll),
      record_mode: recordMode,
      rtsp_user: rtspUser || null,
      rtsp_pass: rtspPass || null,
    };

    try {
      const url = editingCamera ? `/api/cameras/${editingCamera.id}` : '/api/cameras';
      const method = editingCamera ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setSuccess(editingCamera ? 'Camera updated successfully!' : 'Camera added successfully!');
        resetForm();
        setActiveTab('list');
        onReload();
      } else {
        const data = await response.json();
        setError(data.detail || 'Failed to save camera.');
      }
    } catch (err) {
      setError('Network error saving camera configuration.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this camera? This will remove all recording links as well.')) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/cameras/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setSuccess('Camera deleted successfully.');
        onReload();
      } else {
        setError('Failed to delete camera.');
      }
    } catch (err) {
      setError('Network error deleting camera.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-grid view-container">
      <div className="settings-sidebar">
        <button 
          className={`settings-nav-btn ${activeTab === 'list' ? 'active' : ''}`}
          onClick={() => setActiveTab('list')}
        >
          📷 Camera Devices
        </button>
        <button 
          className={`settings-nav-btn ${activeTab === 'form' && !editingCamera ? 'active' : ''}`}
          onClick={handleCreateNew}
        >
          ➕ Add Camera
        </button>
        <button 
          className={`settings-nav-btn ${activeTab === 'system' ? 'active' : ''}`}
          onClick={() => setActiveTab('system')}
        >
          ⚙️ Branding Settings
        </button>
        {activeTab === 'form' && editingCamera && (
          <button className="settings-nav-btn active">
            📝 Edit: {editingCamera.name}
          </button>
        )}
      </div>

      <div className="settings-content-card glass-panel fade-in">
        {success && (
          <div style={{ padding: '12px 16px', background: 'rgba(16,185,129,0.15)', border: '1px solid var(--accent-success)', borderRadius: '8px', color: 'var(--accent-success)', marginBottom: '16px' }}>
            {success}
          </div>
        )}
        {error && (
          <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.15)', border: '1px solid var(--accent-motion)', borderRadius: '8px', color: 'var(--accent-motion)', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        {activeTab === 'list' ? (
          <div>
            <h2 style={{ fontSize: '24px', marginBottom: '20px' }}>Camera Devices</h2>
            <div className="settings-cameras-list">
              {cameras.map((cam) => (
                <div key={cam.id} className="settings-camera-item">
                  <div>
                    <h4 style={{ fontSize: '16px', fontWeight: '600' }}>{cam.name}</h4>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      Main: <code style={{ color: 'var(--primary)' }}>{cam.main_url}</code>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Sub: <code style={{ color: 'var(--primary)' }}>{cam.sub_url}</code>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary" onClick={() => loadCameraIntoForm(cam)}>
                      Edit
                    </button>
                    <button className="btn btn-secondary" onClick={() => handleDuplicate(cam)}>
                      Duplicate
                    </button>
                    {cameras.length > 1 ? (
                      <button className="btn btn-danger" onClick={() => handleDelete(cam.id)}>
                        Delete
                      </button>
                    ) : (
                      <button className="btn btn-secondary" disabled title="At least one camera required" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button className="btn btn-primary" onClick={handleCreateNew}>
              Add New Camera Device
            </button>
          </div>
        ) : activeTab === 'system' ? (
          <form onSubmit={handleSaveSystemSettings}>
            <h2 style={{ fontSize: '24px', marginBottom: '20px' }}>Branding Settings</h2>
            
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label">Application Title</label>
              <input 
                type="text" 
                className="form-input" 
                value={appTitleInput} 
                onChange={(e) => setAppTitleInput(e.target.value)} 
                placeholder="e.g. My Home NVR"
                required
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Customize the name shown in the browser title bar, tabs, and top-left header logo.
              </span>
            </div>

            <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSave}>
            <h2 style={{ fontSize: '24px', marginBottom: '20px' }}>
              {editingCamera ? `Configure ${editingCamera.name}` : 'Add Camera Device'}
            </h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Camera Name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  placeholder="e.g. Back Yard, Living Room"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Main Stream URL (High Res)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={mainUrl} 
                  onChange={(e) => setMainUrl(e.target.value)} 
                  placeholder="rtsp://ip:554/h264"
                  required
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Used for recording high quality video clips to disk. Use <code>mock://camera1_main</code> for testing.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Sub-Stream URL (Low Res)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={subUrl} 
                  onChange={(e) => setSubUrl(e.target.value)} 
                  placeholder="rtsp://ip:554/h264_sub"
                  required
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Used for live grid streaming and motion detection analysis. Use <code>mock://camera1_sub</code> for testing.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">RTSP Stream Username (Optional)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={rtspUser} 
                  onChange={(e) => setRtspUser(e.target.value)} 
                  placeholder="e.g. admin"
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Credentials will be automatically stripped from pasted URLs and stored securely.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">RTSP Stream Password (Optional)</label>
                <input 
                  type="password" 
                  className="form-input" 
                  value={rtspPass} 
                  onChange={(e) => setRtspPass(e.target.value)} 
                  placeholder="••••••••"
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Masked password input to prevent plain-text exposure in your browser window.
                </span>
              </div>

              <div style={{ gridColumn: 'span 2', height: '1px', background: 'var(--border-light)', margin: '10px 0' }} />

              <div style={{ gridColumn: 'span 2' }}>
                <h3 style={{ fontSize: '16px', marginBottom: '16px' }}>PTZ Controls Configuration (Optional)</h3>
              </div>

              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">PTZ Protocol / Type</label>
                <select 
                  className="form-input" 
                  value={ptzType} 
                  onChange={(e) => setPtzType(e.target.value)}
                >
                  <option value="onvif">ONVIF (Standard)</option>
                  <option value="foscam_cgi">Foscam CGI (Old models, decoder_control.cgi)</option>
                  <option value="foscam_hd">Foscam HD (Newer models, CGIProxy.fcgi)</option>
                  <option value="camhi">CamHi / Boavision (hi3510, ptzctrl.cgi)</option>
                </select>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Choose ONVIF for standard cameras, Foscam, or CamHi (common on Boavision/HX cameras).
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Camera IP / Host</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={ptzIp} 
                  onChange={(e) => setPtzIp(e.target.value)} 
                  placeholder="e.g. 192.168.1.100"
                />
              </div>

              <div className="form-group">
                <label className="form-label">ONVIF Port</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={ptzPort} 
                  onChange={(e) => setPtzPort(e.target.value)} 
                  placeholder="80 or 8899"
                />
              </div>

              <div className="form-group">
                <label className="form-label">ONVIF Username</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={ptzUser} 
                  onChange={(e) => setPtzUser(e.target.value)} 
                  placeholder="admin"
                />
              </div>

              <div className="form-group">
                <label className="form-label">ONVIF Password</label>
                <input 
                  type="password" 
                  className="form-input" 
                  value={ptzPass} 
                  onChange={(e) => setPtzPass(e.target.value)} 
                  placeholder="••••••••"
                />
              </div>

              <div style={{ gridColumn: 'span 2', height: '1px', background: 'var(--border-light)', margin: '10px 0' }} />

              <div style={{ gridColumn: 'span 2' }}>
                <h3 style={{ fontSize: '16px', marginBottom: '16px' }}>Motion Detection & NVR Recording</h3>
              </div>

              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label" style={{ fontWeight: '600' }}>NVR Recording Mode</label>
                <select 
                  className="form-input" 
                  value={recordMode} 
                  onChange={(e) => {
                    const mode = e.target.value;
                    setRecordMode(mode);
                    if (mode === 'always' || mode === 'view_only') {
                      setMotionEnabled(false);
                    } else {
                      setMotionEnabled(true);
                    }
                  }}
                  style={{ width: '100%', height: '40px' }}
                >
                  <option value="motion">Motion Only (Record only on motion alerts)</option>
                  <option value="always">Always Record (Continuous 24/7, disable motion detection)</option>
                  <option value="hybrid">Hybrid (Continuous 24/7 + log motion events)</option>
                  <option value="view_only">View Only (No recording, live feed only)</option>
                </select>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Continuous recordings are automatically split into 15-minute segments for easy timeline scrubbing and playback.
                </span>
              </div>

              {motionEnabled && (
                <>
                  <div className="form-group">
                    <label className="form-label">Motion Sensitivity (1-100)</label>
                    <div className="range-slider-container">
                      <input 
                        type="range" 
                        min="1" 
                        max="100" 
                        className="range-slider" 
                        value={sensitivity} 
                        onChange={(e) => setSensitivity(e.target.value)} 
                      />
                      <span style={{ width: '30px', textAlign: 'right', fontWeight: 'bold' }}>{sensitivity}</span>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Higher value makes it trigger on smaller moving objects.
                    </span>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Pixel Difference Threshold (1-100)</label>
                    <div className="range-slider-container">
                      <input 
                        type="range" 
                        min="1" 
                        max="100" 
                        className="range-slider" 
                        value={threshold} 
                        onChange={(e) => setThreshold(e.target.value)} 
                      />
                      <span style={{ width: '30px', textAlign: 'right', fontWeight: 'bold' }}>{threshold}</span>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Lower value triggers on smaller changes in lighting/movement. Recommended: 15-30.
                    </span>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Pre-Roll Recording Cache (Seconds)</label>
                    <input 
                      type="number" 
                      min="0"
                      max="10"
                      className="form-input" 
                      value={preRoll} 
                      onChange={(e) => setPreRoll(e.target.value)} 
                    />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Seconds recorded BEFORE motion triggers (only supported on buffered mock streams currently).
                    </span>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Post-Roll Recording Buffer (Seconds)</label>
                    <input 
                      type="number" 
                      min="1"
                      max="60"
                      className="form-input" 
                      value={postRoll} 
                      onChange={(e) => setPostRoll(e.target.value)} 
                    />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Seconds to continue recording after motion stops. Avoids splitting recordings.
                    </span>
                  </div>
                </>
              )}
            </div>

            <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving...' : editingCamera ? 'Update Configuration' : 'Save Camera'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setActiveTab('list')}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
