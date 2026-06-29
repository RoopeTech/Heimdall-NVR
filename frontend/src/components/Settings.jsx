import React, { useState, useEffect } from 'react';

export default function Settings({ cameras, onReload, onReloadSettings, token, currentUser }) {
  const [activeTab, setActiveTab] = useState('list');
  const [editingCamera, setEditingCamera] = useState(null);
  const [appTitleInput, setAppTitleInput] = useState('');
  const [retentionDaysInput, setRetentionDaysInput] = useState('0');

  // SSO Settings State
  const [ssoEnabled, setSsoEnabled] = useState('0');
  const [ssoClientId, setSsoClientId] = useState('');
  const [ssoClientSecret, setSsoClientSecret] = useState('');
  const [ssoAuthUrl, setSsoAuthUrl] = useState('');
  const [ssoTokenUrl, setSsoTokenUrl] = useState('');
  const [ssoProfileUrl, setSsoProfileUrl] = useState('');

  // Bulk Edit State
  const [selectedCameras, setSelectedCameras] = useState([]);
  const [bulkFields, setBulkFields] = useState({
    streamType: false,
    rtspCreds: false,
    recordMode: false,
    motionSettings: false,
    archiveSettings: false
  });

  // User Management State
  const [userList, setUserList] = useState([]);
  const [userUsername, setUserUsername] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userRole, setUserRole] = useState('viewer');
  const [editingUser, setEditingUser] = useState(null);
  const [showUserForm, setShowUserForm] = useState(false);

  // Camera Groups State
  const [groups, setGroups] = useState([]);
  const [newGroupName, setNewGroupName] = useState('');

  const fetchGroups = async () => {
    try {
      const res = await fetch('/api/groups', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGroups(data);
      }
    } catch (err) {
      console.error('Error fetching groups:', err);
    }
  };

  const handleAddGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: newGroupName.trim() })
      });
      if (response.ok) {
        setSuccess(`Group "${newGroupName.trim()}" created successfully!`);
        setNewGroupName('');
        fetchGroups();
      } else {
        const data = await response.json();
        setError(data.detail || 'Failed to create group.');
      }
    } catch (err) {
      setError('Network error creating group.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGroup = async (group) => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`/api/groups/${group.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: group.name,
          camera_ids: group.camera_ids
        })
      });
      if (response.ok) {
        setSuccess(`Group "${group.name}" updated successfully!`);
        fetchGroups();
      } else {
        const data = await response.json();
        setError(data.detail || 'Failed to save group.');
      }
    } catch (err) {
      setError('Network error saving group.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = async (id, name) => {
    if (!confirm(`Are you sure you want to delete the camera group "${name}"?`)) return;
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`/api/groups/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        setSuccess(`Group "${name}" deleted successfully.`);
        fetchGroups();
      } else {
        const data = await response.json();
        setError(data.detail || 'Failed to delete group.');
      }
    } catch (err) {
      setError('Network error deleting group.');
    } finally {
      setLoading(false);
    }
  };

  const handleGroupNameChange = (id, newName) => {
    setGroups(groups.map(g => g.id === id ? { ...g, name: newName } : g));
  };

  const handleGroupCameraToggle = (groupId, cameraId) => {
    setGroups(groups.map(g => {
      if (g.id === groupId) {
        const exists = g.camera_ids?.includes(cameraId) || false;
        const newIds = exists 
          ? g.camera_ids.filter(id => id !== cameraId)
          : [...(g.camera_ids || []), cameraId];
        return { ...g, camera_ids: newIds };
      }
      return g;
    }));
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUserList(data);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'users' && currentUser?.role === 'admin') {
      fetchUsers();
    }
    if (activeTab === 'groups' && currentUser?.role === 'admin') {
      fetchGroups();
    }
  }, [activeTab]);

  const handleSaveUser = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    const payload = {
      username: userUsername,
      role: userRole,
    };
    if (userPassword || !editingUser) {
      payload.password = userPassword;
    }

    try {
      const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';
      const method = editingUser ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setSuccess(editingUser ? 'User account updated successfully!' : 'User account created successfully!');
        setShowUserForm(false);
        setEditingUser(null);
        setUserUsername('');
        setUserPassword('');
        setUserRole('viewer');
        fetchUsers();
      } else {
        const data = await response.json();
        setError(data.detail || 'Failed to save user account.');
      }
    } catch (err) {
      setError('Network error saving user account.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (id) => {
    if (id === currentUser.id) {
      alert("You cannot delete your own admin account.");
      return;
    }
    if (!confirm('Are you sure you want to delete this user?')) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/users/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setSuccess('User deleted successfully.');
        fetchUsers();
      } else {
        const data = await response.json();
        setError(data.detail || 'Failed to delete user.');
      }
    } catch (err) {
      setError('Network error deleting user.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
    setUserUsername(user.username);
    setUserRole(user.role);
    setUserPassword('');
    setShowUserForm(true);
  };

  const handleCreateNewUser = () => {
    setEditingUser(null);
    setUserUsername('');
    setUserRole('viewer');
    setUserPassword('');
    setShowUserForm(true);
  };
  
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
  const [webUiPath, setWebUiPath] = useState('/');
  const [rtspPass, setRtspPass] = useState('');
  const [osdEnabled, setOsdEnabled] = useState(true);
  const [archiveDays, setArchiveDays] = useState(0);
  const [archivePath, setArchivePath] = useState('');
  const [streamType, setStreamType] = useState('rtsp');
  const [imageUrl, setImageUrl] = useState('');
  const [imageRefreshInterval, setImageRefreshInterval] = useState(3600);

  // Auto-force View Only mode for image URL cameras
  React.useEffect(() => {
    if (streamType === 'image_url') {
      setRecordMode('view_only');
      setMotionEnabled(false);
    }
  }, [streamType]);

  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [updatingState, setUpdatingState] = useState('');

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
    if (!token) return;
    const fetchSysSettings = async () => {
      try {
        const res = await fetch('/api/settings', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setAppTitleInput(data.app_title || '');
          setRetentionDaysInput(data.retention_days || '0');
          setSsoEnabled(data.sso_enabled || '0');
          setSsoClientId(data.sso_client_id || '');
          setSsoClientSecret(data.sso_client_secret || '');
          setSsoAuthUrl(data.sso_auth_url || '');
          setSsoTokenUrl(data.sso_token_url || '');
          setSsoProfileUrl(data.sso_profile_url || '');
        }
      } catch (e) {
        console.error('Error fetching settings inside Settings.jsx:', e);
      }
    };
    fetchSysSettings();
    if (activeTab === 'system') {
      fetchUpdateStatus();
    }
  }, [activeTab]);

  const handleSaveBulk = async (e) => {
    e.preventDefault();
    if (!confirm(`Are you sure you want to bulk update ${selectedCameras.length} cameras?`)) return;
    
    setLoading(true);
    setError('');
    
    try {
      const partial = {};
      if (bulkFields.streamType) {
        partial.stream_type = streamType;
        partial.image_url = streamType === 'image_url' ? imageUrl : null;
        partial.image_refresh_interval = parseInt(imageRefreshInterval) || 3600;
      }
      if (bulkFields.rtspCreds) {
        partial.rtsp_user = rtspUser;
        partial.rtsp_pass = rtspPass;
      }
      if (bulkFields.recordMode) {
        partial.record_mode = recordMode;
        partial.motion_enabled = (recordMode === 'motion' || recordMode === 'hybrid') ? 1 : 0;
      }
      if (bulkFields.motionSettings) {
        partial.motion_sensitivity = sensitivity;
        partial.motion_threshold = threshold;
        partial.pre_roll = preRoll;
        partial.post_roll = postRoll;
      }
      if (bulkFields.archiveSettings) {
        partial.archive_days = parseInt(archiveDays) || 0;
        partial.archive_path = archivePath;
      }

      for (const camId of selectedCameras) {
        const cam = cameras.find(c => c.id === camId);
        if (!cam) continue;
        
        const payload = { ...cam, ...partial };
        
        await fetch(`/api/cameras/${camId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
      }
      
      setSuccess(`Successfully updated ${selectedCameras.length} cameras!`);
      setSelectedCameras([]);
      setActiveTab('list');
      if (onReload) onReload();
    } catch (err) {
      setError('Error during bulk update: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleCameraSelection = (camId) => {
    setSelectedCameras(prev => prev.includes(camId) ? prev.filter(id => id !== camId) : [...prev, camId]);
  };

  const selectAllCameras = () => {
    if (selectedCameras.length === cameras.length && cameras.length > 0) setSelectedCameras([]);
    else setSelectedCameras(cameras.map(c => c.id));
  };

  const handleSaveSystemSettings = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          app_title: appTitleInput,
          retention_days: parseInt(retentionDaysInput) || 0
        }),
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

  const handleSaveSsoSettings = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          sso_enabled: ssoEnabled,
          sso_client_id: ssoClientId,
          sso_client_secret: ssoClientSecret,
          sso_auth_url: ssoAuthUrl,
          sso_token_url: ssoTokenUrl,
          sso_profile_url: ssoProfileUrl
        }),
      });
      if (res.ok) {
        setSuccess('SSO settings updated successfully!');
      } else {
        setError('Failed to update SSO settings.');
      }
    } catch (err) {
      setError('Network error saving SSO settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportConfig = async () => {
    const password = window.prompt("Enter a password to encrypt your camera passwords (or leave blank to save them unencrypted):");
    if (password === null) return; // user cancelled

    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/settings/backup', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password: password || null })
      });
      if (res.ok) {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const d = new Date();
        const localTodayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        a.download = `nvr_config_${localTodayStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setSuccess('Configuration exported successfully.');
      } else {
        setError('Failed to export configuration.');
      }
    } catch (err) {
      setError('Network error exporting configuration.');
    } finally {
      setLoading(false);
    }
  };

  const handleImportConfig = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!confirm('WARNING: Importing configuration will overwrite all current cameras, user accounts, and settings. You may be logged out. Are you sure you want to proceed?')) {
      e.target.value = '';
      return;
    }
    
    setLoading(true);
    setError('');
    setSuccess('');
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const payload = JSON.parse(event.target.result);
        
        let password = null;
        if (payload.is_encrypted) {
          password = window.prompt("This backup is encrypted. Please enter the password:");
          if (password === null) {
            e.target.value = '';
            setLoading(false);
            return;
          }
        }

        const res = await fetch('/api/settings/restore', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            data: payload,
            password: password
          })
        });
        
        if (res.ok) {
          setSuccess('Configuration imported successfully! Reloading NVR...');
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        } else {
          const data = await res.json();
          setError(data.detail || 'Failed to import configuration.');
        }
      } catch (err) {
        setError('Invalid JSON backup file or network error during import.');
      } finally {
        setLoading(false);
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const fetchUpdateStatus = async () => {
    setCheckingUpdate(true);
    try {
      const res = await fetch('/api/settings/check_update', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUpdateStatus(data);
      }
    } catch (e) {
      console.error('Error checking updates:', e);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleApplyUpdate = async () => {
    if (!confirm('Are you sure you want to apply this update? The system will pull new code, compile assets, and restart the NVR backend. This will temporarily disrupt live viewing for about 10-15 seconds.')) {
      return;
    }
    
    setUpdatingState('updating');
    setError('');
    setSuccess('');
    
    try {
      const res = await fetch('/api/settings/apply_update', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setUpdatingState('success');
        setSuccess('Update applied successfully! Restarting server...');
        setTimeout(() => {
          window.location.reload();
        }, 12000);
      } else {
        const data = await res.json();
        setUpdatingState('error');
        setError(data.detail || 'Failed to apply update.');
      }
    } catch (err) {
      setUpdatingState('error');
      setError('Network error applying system update.');
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
    setOsdEnabled(cam.osd_enabled !== 0);
    setWebUiPath(cam.web_ui_path || '/');
    setStreamType(cam.stream_type || 'rtsp');
    setImageUrl(cam.image_url || '');
    setImageRefreshInterval(cam.image_refresh_interval || 3600);
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
    setOsdEnabled(cam.osd_enabled !== 0);
    setArchiveDays(cam.archive_days || 0);
    setArchivePath(cam.archive_path || '');
    setWebUiPath(cam.web_ui_path || '/');
    setStreamType(cam.stream_type || 'rtsp');
    setImageUrl(cam.image_url || '');
    setImageRefreshInterval(cam.image_refresh_interval || 3600);
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
    setOsdEnabled(true);
    setArchiveDays(0);
    setArchivePath('');
    setWebUiPath('/');
    setStreamType('rtsp');
    setImageUrl('');
    setImageRefreshInterval(3600);
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
      osd_enabled: osdEnabled ? 1 : 0,
      archive_days: parseInt(archiveDays) || 0,
      archive_path: archivePath || null,
      web_ui_path: webUiPath || '/',
      stream_type: streamType,
      image_url: streamType === 'image_url' ? imageUrl : null,
      image_refresh_interval: parseInt(imageRefreshInterval) || 3600,
    };

    try {
      const url = editingCamera ? `/api/cameras/${editingCamera.id}` : '/api/cameras';
      const method = editingCamera ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
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

  const handleOpenProxy = (cam) => {
    let path = cam.web_ui_path || '/';
    if (!path.startsWith('/')) path = '/' + path;
    if (path === '/') {
        window.open(`/api/proxy/${cam.id}/`, '_blank');
    } else {
        window.open(`/api/proxy/${cam.id}${path}`, '_blank');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this camera? This will remove all recording links as well.')) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/cameras/${id}`, { 
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
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
          ⚙️ System Settings
        </button>
        {currentUser?.role === 'admin' && (
          <button 
            className={`settings-nav-btn ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('users');
              fetchUsers();
            }}
          >
            👤 User Accounts
          </button>
        )}
        {currentUser?.role === 'admin' && (
          <button 
            className={`settings-nav-btn ${activeTab === 'groups' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('groups');
              fetchGroups();
            }}
          >
            🎯 Camera Groups
          </button>
        )}
        {currentUser?.role === 'admin' && (
          <button 
            className={`settings-nav-btn ${activeTab === 'sso' ? 'active' : ''}`}
            onClick={() => setActiveTab('sso')}
          >
            🔐 SSO
          </button>
        )}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '24px', margin: 0 }}>Camera Devices</h2>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="btn btn-secondary" onClick={selectAllCameras}>
                  {selectedCameras.length === cameras.length && cameras.length > 0 ? 'Deselect All' : 'Select All'}
                </button>
                {selectedCameras.length > 0 && (
                  <button className="btn btn-primary" onClick={() => { resetForm(); setActiveTab('bulk_edit'); }}>
                    Bulk Edit ({selectedCameras.length})
                  </button>
                )}
              </div>
            </div>
            <div className="settings-cameras-list">
              {cameras.map((cam) => (
                <div key={cam.id} className="settings-camera-item" style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                  <input 
                    type="checkbox" 
                    checked={selectedCameras.includes(cam.id)}
                    onChange={() => toggleCameraSelection(cam.id)}
                    style={{ marginTop: '4px', width: '20px', height: '20px', cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                    <div>
                      <h4 style={{ fontSize: '16px', fontWeight: '600' }}>{cam.name}</h4>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      Main (recording): <code style={{ color: 'var(--primary)' }}>{cam.main_url}</code>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Sub (live view): <code style={{ color: 'var(--primary)' }}>{cam.sub_url}</code>
                    </div>
                    {cam.main_url === cam.sub_url && cam.stream_type !== 'image_url' && (
                      <div style={{
                        marginTop: '8px',
                        padding: '6px 10px',
                        background: 'rgba(245, 158, 11, 0.12)',
                        border: '1px solid rgba(245, 158, 11, 0.4)',
                        borderRadius: '6px',
                        fontSize: '12px',
                        color: 'var(--accent-warning)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}>
                        ⚠️ Main and Sub stream URLs are identical — recordings will use the same low-res stream as live view. Set a separate high-res Main URL for full-quality clips.
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" onClick={() => handleOpenProxy(cam)} title="Open the camera's built-in web configuration page via secure proxy">
                      ⚙️ Web UI
                    </button>
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
                </div>
              ))}
            </div>
            <button className="btn btn-primary" onClick={handleCreateNew}>
              Add New Camera Device
            </button>
          </div>
        ) : activeTab === 'bulk_edit' ? (
          <form onSubmit={handleSaveBulk}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '24px' }}>Bulk Edit {selectedCameras.length} Cameras</h2>
              <button type="button" className="btn btn-secondary" onClick={() => setActiveTab('list')}>Cancel</button>
            </div>
            
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
              Select the checkbox next to the settings you want to apply to all {selectedCameras.length} selected cameras.
              Unchecked sections will remain unchanged on each individual camera.
            </p>

            <div className="settings-form-grid">
              
              {/* Stream Type */}
              <div style={{ gridColumn: 'span 2', background: 'var(--bg-tertiary)', padding: '20px', borderRadius: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 'bold', fontSize: '18px', marginBottom: '16px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={bulkFields.streamType} onChange={e => setBulkFields({...bulkFields, streamType: e.target.checked})} style={{ width: '20px', height: '20px' }} />
                  Apply Stream Type
                </label>
                
                {bulkFields.streamType && (
                  <div style={{ paddingLeft: '32px' }}>
                    <div className="form-group">
                      <label className="form-label">Video Source Type</label>
                      <select className="form-input" value={streamType} onChange={(e) => setStreamType(e.target.value)}>
                        <option value="rtsp">RTSP / RTMP / Video Stream</option>
                        <option value="image_url">Image / GIF Auto-Refreshing URL</option>
                        <option value="website">Website / Iframe Widget</option>
                      </select>
                    </div>
                    {(streamType === 'image_url' || streamType === 'website') && (
                      <>
                        <div className="form-group">
                          <label className="form-label">{streamType === 'website' ? 'Website URL' : 'Image/GIF URL'}</label>
                          <input type="text" className="form-input" value={streamType === 'website' ? mainUrl : imageUrl} onChange={(e) => streamType === 'website' ? setMainUrl(e.target.value) : setImageUrl(e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Refresh Interval (Seconds)</label>
                          <input type="number" className="form-input" value={imageRefreshInterval} onChange={(e) => setImageRefreshInterval(e.target.value)} />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* RTSP Credentials */}
              <div style={{ gridColumn: 'span 2', background: 'var(--bg-tertiary)', padding: '20px', borderRadius: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 'bold', fontSize: '18px', marginBottom: '16px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={bulkFields.rtspCreds} onChange={e => setBulkFields({...bulkFields, rtspCreds: e.target.checked})} style={{ width: '20px', height: '20px' }} />
                  Apply RTSP Credentials
                </label>
                
                {bulkFields.rtspCreds && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', paddingLeft: '32px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">RTSP Username</label>
                      <input type="text" className="form-input" value={rtspUser} onChange={(e) => setRtspUser(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">RTSP Password</label>
                      <input type="password" className="form-input" value={rtspPass} onChange={(e) => setRtspPass(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>

              {/* Record Mode */}
              <div style={{ gridColumn: 'span 2', background: 'var(--bg-tertiary)', padding: '20px', borderRadius: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 'bold', fontSize: '18px', marginBottom: '16px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={bulkFields.recordMode} onChange={e => setBulkFields({...bulkFields, recordMode: e.target.checked})} style={{ width: '20px', height: '20px' }} />
                  Apply NVR Recording Mode
                </label>
                
                {bulkFields.recordMode && (
                  <div className="form-group" style={{ margin: 0, paddingLeft: '32px' }}>
                    <select className="form-input" value={recordMode} onChange={(e) => setRecordMode(e.target.value)}>
                      <option value="motion">Motion Only (Record only on motion alerts)</option>
                      <option value="always">Always Record (Continuous 24/7, disable motion detection)</option>
                      <option value="hybrid">Hybrid (Continuous 24/7 + log motion events)</option>
                      <option value="view_only">View Only (No recording, live feed only)</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Motion Settings */}
              <div style={{ gridColumn: 'span 2', background: 'var(--bg-tertiary)', padding: '20px', borderRadius: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 'bold', fontSize: '18px', marginBottom: '16px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={bulkFields.motionSettings} onChange={e => setBulkFields({...bulkFields, motionSettings: e.target.checked})} style={{ width: '20px', height: '20px' }} />
                  Apply Motion Settings
                </label>
                
                {bulkFields.motionSettings && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', paddingLeft: '32px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Sensitivity (1-100)</label>
                      <input type="number" className="form-input" value={sensitivity} onChange={(e) => setSensitivity(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Threshold (1-100)</label>
                      <input type="number" className="form-input" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Pre-Roll (sec)</label>
                      <input type="number" className="form-input" value={preRoll} onChange={(e) => setPreRoll(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Post-Roll (sec)</label>
                      <input type="number" className="form-input" value={postRoll} onChange={(e) => setPostRoll(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>

            </div>
            
            <div style={{ marginTop: '32px', display: 'flex', gap: '12px' }}>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving...' : 'Apply to Selected Cameras'}
              </button>
            </div>
          </form>
        ) : activeTab === 'system' ? (
          <form onSubmit={handleSaveSystemSettings}>
            <h2 style={{ fontSize: '24px', marginBottom: '20px' }}>System Settings</h2>
            
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

            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label">Auto-delete Old Recordings (Days)</label>
              <input 
                type="number" 
                min="0"
                className="form-input" 
                value={retentionDaysInput} 
                onChange={(e) => setRetentionDaysInput(e.target.value)} 
                placeholder="e.g. 7 (0 to keep indefinitely)"
                required
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Number of days to keep video recordings. Older clips will be automatically deleted from disk to save space. Set to 0 to keep forever.
              </span>
            </div>

            <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving...' : 'Save Settings'}
              </button>
            </div>

            <div style={{ height: '1px', background: 'var(--border-light)', margin: '30px 0' }} />

            <h3 style={{ fontSize: '18px', marginBottom: '12px', color: 'var(--primary)' }}>System Updates</h3>
            {checkingUpdate ? (
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Checking for updates...</p>
            ) : updateStatus ? (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '20px', fontSize: '13px', marginBottom: '12px' }}>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>Current Version: </span>
                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', color: 'var(--primary)' }}>
                      {updateStatus.local_commit}
                    </code>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>Latest Version: </span>
                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', color: updateStatus.update_available ? 'var(--accent-motion)' : 'var(--accent-success)' }}>
                      {updateStatus.remote_commit}
                    </code>
                  </div>
                </div>

                {updateStatus.update_available ? (
                  <div>
                    <div style={{ padding: '10px 14px', background: 'rgba(0, 242, 254, 0.08)', border: '1px solid var(--primary)', borderRadius: '8px', color: 'var(--primary)', fontSize: '13px', marginBottom: '16px' }}>
                      🚀 A new software update is available! Click below to pull updates and compile assets.
                    </div>
                    {updatingState === 'updating' ? (
                      <div style={{ color: 'var(--primary)', fontWeight: '600', fontSize: '13px' }}>
                        ⏳ Applying updates and recompiling static UI assets... The server is restarting. Please wait 12s...
                      </div>
                    ) : updatingState === 'success' ? (
                      <div style={{ color: 'var(--accent-success)', fontWeight: '600', fontSize: '13px' }}>
                        ✅ Update successful! Reloading dashboard...
                      </div>
                    ) : (
                      <button 
                        type="button" 
                        className="btn btn-primary" 
                        onClick={handleApplyUpdate}
                        disabled={loading}
                      >
                        🚀 Apply System Update
                      </button>
                    )}
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize: '13px', color: 'var(--accent-success)', fontWeight: '500', marginBottom: '16px' }}>
                      ✔ Your NVR software is fully up to date.
                    </p>
                    {updatingState === 'updating' ? (
                      <div style={{ color: 'var(--primary)', fontWeight: '600', fontSize: '13px' }}>
                        ⏳ Applying updates and recompiling static UI assets... The server is restarting. Please wait 12s...
                      </div>
                    ) : updatingState === 'success' ? (
                      <div style={{ color: 'var(--accent-success)', fontWeight: '600', fontSize: '13px' }}>
                        ✅ Update successful! Reloading dashboard...
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          type="button" 
                          className="btn btn-secondary" 
                          onClick={fetchUpdateStatus}
                          disabled={checkingUpdate}
                        >
                          🔄 Check Again
                        </button>
                        <button 
                          type="button" 
                          className="btn btn-secondary" 
                          onClick={handleApplyUpdate}
                          disabled={loading}
                        >
                          ⚠️ Force Update
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={fetchUpdateStatus}
                disabled={checkingUpdate}
              >
                🔄 Check for Updates
              </button>
            )}

            <div style={{ height: '1px', background: 'var(--border-light)', margin: '30px 0' }} />

            <h3 style={{ fontSize: '18px', marginBottom: '12px', color: 'var(--primary)' }}>Backup & Restore Configuration</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.4' }}>
              Export your cameras, system settings, and user accounts to a JSON file. This allows you to migrate servers easily.
            </p>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={handleExportConfig}
                disabled={loading}
              >
                📥 Export Config File
              </button>
              
              <label className="btn btn-secondary" style={{ cursor: 'pointer', margin: 0 }}>
                📤 Import Config File
                <input 
                  type="file" 
                  accept=".json" 
                  onChange={handleImportConfig} 
                  style={{ display: 'none' }} 
                  disabled={loading}
                />
              </label>
            </div>
          </form>
        ) : activeTab === 'users' && currentUser?.role === 'admin' ? (
          <div>
            {showUserForm ? (
              <form onSubmit={handleSaveUser}>
                <h2 style={{ fontSize: '24px', marginBottom: '20px' }}>
                  {editingUser ? `Configure User: ${editingUser.username}` : 'Add User Account'}
                </h2>
                
                <div className="settings-form-grid">
                  <div className="form-group">
                    <label className="form-label">Username</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={userUsername} 
                      onChange={(e) => setUserUsername(e.target.value)} 
                      placeholder="e.g. guard_room"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Role</label>
                    <select 
                      className="form-input" 
                      value={userRole} 
                      onChange={(e) => setUserRole(e.target.value)}
                    >
                      <option value="viewer">Viewer (Read-only)</option>
                      <option value="admin">Admin (Full Access)</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">
                      {editingUser ? 'New Password (leave blank to keep current)' : 'Password'}
                    </label>
                    <input 
                      type="password" 
                      className="form-input" 
                      value={userPassword} 
                      onChange={(e) => setUserPassword(e.target.value)} 
                      placeholder="••••••••"
                      required={!editingUser}
                    />
                  </div>
                </div>

                <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
                  <button type="submit" className="btn btn-primary" disabled={loading}>
                    {loading ? 'Saving...' : editingUser ? 'Update Account' : 'Create Account'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowUserForm(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <h2 style={{ fontSize: '24px', marginBottom: '20px' }}>User Accounts</h2>
                <div className="settings-cameras-list">
                  {userList.map((usr) => (
                    <div key={usr.id} className="settings-camera-item">
                      <div>
                        <h4 style={{ fontSize: '16px', fontWeight: '600' }}>
                          👤 {usr.username} 
                          {usr.id === currentUser?.id && <span style={{ fontSize: '11px', color: 'var(--primary)', marginLeft: '8px' }}>(You)</span>}
                        </h4>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          Role: <span style={{ textTransform: 'uppercase', fontWeight: '600', color: usr.role === 'admin' ? 'var(--primary)' : 'var(--text-secondary)' }}>{usr.role}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-secondary" onClick={() => handleEditUser(usr)}>
                          Edit
                        </button>
                        {usr.id !== currentUser?.id ? (
                          <button className="btn btn-danger" onClick={() => handleDeleteUser(usr.id)}>
                            Delete
                          </button>
                        ) : (
                          <button className="btn btn-secondary" disabled title="Cannot delete yourself" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <button className="btn btn-primary" onClick={handleCreateNewUser}>
                  Add User Account
                </button>
              </div>
            )}
          </div>
        ) : activeTab === 'groups' && currentUser?.role === 'admin' ? (
          <div>
            <h2 style={{ fontSize: '24px', marginBottom: '20px' }}>Camera Groups</h2>
            
            <form onSubmit={handleAddGroup} style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
              <input 
                type="text" 
                className="form-input" 
                style={{ flex: 1, maxWidth: '300px' }} 
                placeholder="New Group Name" 
                value={newGroupName} 
                onChange={(e) => setNewGroupName(e.target.value)} 
                required
              />
              <button type="submit" className="btn btn-primary" disabled={loading}>
                Create Group
              </button>
            </form>

            <div className="groups-panel">
              {groups.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  No camera groups created yet. Use the field above to add one.
                </div>
              ) : (
                groups.map((group) => (
                  <div key={group.id} className="group-item">
                    <div className="group-item-header">
                      <input 
                        type="text" 
                        className="form-input" 
                        style={{ flex: 1, maxWidth: '280px', fontWeight: '600' }} 
                        value={group.name} 
                        onChange={(e) => handleGroupNameChange(group.id, e.target.value)} 
                        placeholder="Group Name"
                        required
                      />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          type="button"
                          className="btn btn-primary" 
                          onClick={() => handleSaveGroup(group)}
                          disabled={loading}
                        >
                          Save
                        </button>
                        <button 
                          type="button"
                          className="btn btn-danger" 
                          onClick={() => handleDeleteGroup(group.id, group.name)}
                          disabled={loading}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Assign Cameras to Group:
                    </div>
                    
                    <div className="group-camera-checkboxes">
                      {cameras.map((cam) => {
                        const isChecked = group.camera_ids?.includes(cam.id) || false;
                        return (
                          <label key={cam.id} className={`group-camera-checkbox ${isChecked ? 'checked' : ''}`}>
                            <input 
                              type="checkbox" 
                              checked={isChecked} 
                              onChange={() => handleGroupCameraToggle(group.id, cam.id)}
                            />
                            <span>{cam.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : activeTab === 'sso' && currentUser?.role === 'admin' ? (
          <div className="fade-in">
            <h2 style={{ marginBottom: '24px', fontSize: '20px', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
              Single Sign-On (OIDC) Configuration
            </h2>

            <div style={{ backgroundColor: 'rgba(0,100,255,0.1)', border: '1px solid rgba(0,100,255,0.2)', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '14px', marginBottom: '8px', color: 'var(--primary-color)' }}>Required Identity Provider Setup Information</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: '1.4' }}>
                When configuring your Identity Provider (Azure AD, WorkOS, SSOReady, Okta, etc.), you must provide this exact Redirect URI (Callback URL) in your app registration:
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <code style={{ flex: 1, padding: '10px 14px', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '6px', color: '#e2e8f0', fontSize: '13px', userSelect: 'all', border: '1px solid rgba(255,255,255,0.05)' }}>
                  {window.location.origin}/api/auth/sso/callback
                </code>
              </div>
            </div>

            <form onSubmit={handleSaveSsoSettings}>
              <div className="form-group">
                <label className="form-label">Enable SSO</label>
                <select className="form-input" value={ssoEnabled} onChange={e => setSsoEnabled(e.target.value)}>
                  <option value="0">Disabled</option>
                  <option value="1">Enabled</option>
                </select>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Enables SSO login on the login screen.</div>
              </div>

              <div className="form-group">
                <label className="form-label">Client ID</label>
                <input type="text" className="form-input" value={ssoClientId} onChange={e => setSsoClientId(e.target.value)} placeholder="e.g. client_12345" />
              </div>

              <div className="form-group">
                <label className="form-label">Client Secret</label>
                <input type="password" className="form-input" value={ssoClientSecret} onChange={e => setSsoClientSecret(e.target.value)} placeholder="e.g. secret_12345" />
              </div>

              <div className="form-group">
                <label className="form-label">Authorization URL</label>
                <input type="url" className="form-input" value={ssoAuthUrl} onChange={e => setSsoAuthUrl(e.target.value)} placeholder="e.g. https://auth.ssoready.com/v1/saml/authorize" />
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>The URL where users are redirected to log in.</div>
              </div>

              <div className="form-group">
                <label className="form-label">Token URL</label>
                <input type="url" className="form-input" value={ssoTokenUrl} onChange={e => setSsoTokenUrl(e.target.value)} placeholder="e.g. https://auth.ssoready.com/v1/oauth2/token" />
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>The URL used to exchange the authorization code for an access token.</div>
              </div>

              <div className="form-group">
                <label className="form-label">User Info / Profile URL</label>
                <input type="url" className="form-input" value={ssoProfileUrl} onChange={e => setSsoProfileUrl(e.target.value)} placeholder="e.g. https://auth.ssoready.com/v1/oauth2/userinfo" />
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>The URL used to fetch the user's profile information (requires 'email' or 'sub'/'id').</div>
              </div>

              <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: '12px' }}>
                {loading ? 'Saving...' : '💾 Save SSO Settings'}
              </button>
            </form>
          </div>
        ) : (
          <form onSubmit={handleSave}>
            <h2 style={{ fontSize: '24px', marginBottom: '20px' }}>
              {editingCamera ? `Configure ${editingCamera.name}` : 'Add Camera Device'}
            </h2>
            
            <div className="settings-form-grid">
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

              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Source Type</label>
                <select
                  className="form-input"
                  value={streamType}
                  onChange={(e) => setStreamType(e.target.value)}
                >
                  <option value="rtsp">📡 RTSP Stream (IP Camera)</option>
                  <option value="image_url">🖼️ Image / GIF URL</option>
                  <option value="website">🌐 Website / Iframe Widget</option>
                </select>
              </div>

              {streamType === 'rtsp' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Main Stream URL (High Res)</label>
                    <input
                      type="text"
                      className="form-input"
                      value={mainUrl}
                      onChange={(e) => setMainUrl(e.target.value)}
                      placeholder="rtsp://ip:554/11"
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
                      placeholder="rtsp://ip:554/12"
                    />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Used for live grid streaming and motion detection. Use <code>mock://camera1_sub</code> for testing.
                    </span>
                  </div>
                </>
              )}
              {streamType === 'image_url' && (
                <>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">Image / GIF URL</label>
                    <input
                      type="url"
                      className="form-input"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="https://example.com/radar.gif"
                      required={streamType === 'image_url'}
                    />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Enter the direct URL to any publicly accessible JPEG, PNG, or GIF image. The NVR server will fetch it periodically and display it as a live tile.
                    </span>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Refresh Interval (seconds)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={imageRefreshInterval}
                      onChange={(e) => setImageRefreshInterval(e.target.value)}
                      min="5"
                      step="1"
                    />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      How often to re-fetch the image. Common values: <code>3600</code> (1 hr), <code>1800</code> (30 min), <code>300</code> (5 min), <code>30</code> (30 sec).
                    </span>
                  </div>
                </>
              )}
              
              {streamType === 'website' && (
                <>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">Website URL</label>
                    <input
                      type="url"
                      className="form-input"
                      value={mainUrl}
                      onChange={(e) => setMainUrl(e.target.value)}
                      placeholder="https://example.com/widget"
                      required={streamType === 'website'}
                    />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Enter the direct URL to the website. The NVR will display this website as an iframe widget on the dashboard.
                    </span>
                  </div>
                </>
              )}

              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Web UI Proxy Path (Optional)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={webUiPath} 
                  onChange={(e) => setWebUiPath(e.target.value)} 
                  placeholder="e.g. /web/index.html"
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  If your camera uses a custom login path (e.g. <code>/web/index.html</code>), setting it here will bypass double login prompts. Defaults to <code>/</code>.
                </span>
              </div>

              {mainUrl && subUrl && mainUrl === subUrl && (
                <div style={{
                  padding: '10px 14px',
                  background: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  borderRadius: '8px',
                  fontSize: '13px',
                  color: 'var(--accent-warning)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  marginBottom: '8px',
                }}>
                  <span style={{ flexShrink: 0 }}>⚠️</span>
                  <span>
                    <strong>Main and Sub URLs are the same.</strong> Recordings will use the same low-resolution stream as live view. 
                    Set your camera's high-resolution main stream (e.g. <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 4px', borderRadius: '3px' }}>rtsp://ip:554/h264</code>) 
                    in Main URL and the lower-res substream (e.g. <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 4px', borderRadius: '3px' }}>rtsp://ip:554/h264_sub</code>) in Sub URL for best quality clips.
                  </span>
                </div>
              )}

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

              {streamType !== 'image_url' && (
              <>
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
              
              </>
              )}

              <div style={{ gridColumn: 'span 2', height: '1px', background: 'var(--border-light)', margin: '10px 0' }} />
              
              <div style={{ gridColumn: 'span 2' }}>
                <h3 style={{ fontSize: '16px', marginBottom: '16px' }}>NAS / Secondary Storage Archiving</h3>
              </div>
              
              <div className="form-group">
                <label className="form-label">Days to Keep Local Before Archiving (0 to Disable)</label>
                <input 
                  type="number" 
                  min="0"
                  className="form-input" 
                  value={archiveDays} 
                  onChange={(e) => setArchiveDays(e.target.value)} 
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Set to 0 to keep files on the local server indefinitely (or until global retention limit is hit).
                </span>
              </div>
              
              <div className="form-group">
                <label className="form-label">NAS Share / Archive Directory Path</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={archivePath} 
                  onChange={(e) => setArchivePath(e.target.value)} 
                  placeholder="/mnt/nas/backyard"
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Absolute path to the destination directory. Must be mounted with write permissions on the OS level. If unreachable, archiving will be retried later.
                </span>
              </div>
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
