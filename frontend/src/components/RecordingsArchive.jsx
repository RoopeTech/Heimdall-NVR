import React, { useState, useEffect } from 'react';

export default function RecordingsArchive({ cameras, token }) {
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(false);
  const d = new Date();
  const localTodayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const [selectedDate, setSelectedDate] = useState(localTodayStr);
  const [selectedCameraId, setSelectedCameraId] = useState('all');
  const [playingRecording, setPlayingRecording] = useState(null);
  const [storageStats, setStorageStats] = useState(null);

  useEffect(() => {
    fetchArchive();
    fetchStorageStats();
  }, [selectedDate, selectedCameraId]);

  const fetchStorageStats = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/system/storage', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setStorageStats(await res.json());
      }
    } catch (e) {
      console.error('Error fetching storage stats:', e);
    }
  };

  const fetchArchive = async () => {
    if (!token) return;
    setLoading(true);
    try {
      let url = `/api/recordings?date=${selectedDate}`;
      if (selectedCameraId !== 'all') {
        url += `&camera_id=${selectedCameraId}`;
      }
      
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setRecordings(data);
      } else {
        setRecordings([]);
      }
    } catch (err) {
      console.error('Error fetching recordings archive:', err);
      setRecordings([]);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (isoStr) => {
    if (!isoStr) return '';
    try {
      return new Date(isoStr).toLocaleTimeString();
    } catch (e) {
      return isoStr;
    }
  };
  
  const formatDuration = (seconds) => {
    if (!seconds) return 'Ongoing';
    if (seconds < 60) return `${Math.floor(seconds)}s`;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}m ${s}s`;
  };

  const getCameraName = (cid) => {
    const cam = cameras.find(c => c.id === cid);
    return cam ? cam.name : `Camera ${cid}`;
  };

  return (
    <div className="view-container fade-in">
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        
        {storageStats && (
          <div className="glass-panel fade-in" style={{ padding: '20px', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>💾</span> Storage Overview
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px' }}>
              
              {/* Drive Usage Progress */}
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
                  <span><strong style={{ color: 'var(--text-primary)' }}>{storageStats.used_gb.toFixed(1)} GB</strong> Used</span>
                  <span style={{ color: 'var(--text-muted)' }}>{storageStats.free_gb.toFixed(1)} GB Free of {storageStats.total_gb.toFixed(1)} GB</span>
                </div>
                <div style={{ height: '12px', background: 'var(--bg-tertiary)', borderRadius: '6px', overflow: 'hidden' }}>
                  <div style={{ 
                    height: '100%', 
                    width: `${(storageStats.used_gb / storageStats.total_gb) * 100}%`,
                    background: storageStats.free_gb < 50 ? 'var(--danger-color)' : 'var(--primary-color)',
                    transition: 'width 1s ease-in-out'
                  }} />
                </div>
              </div>

              {/* Stats Cards */}
              <div className="form-group" style={{ margin: 0, padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                <label className="form-label" style={{ fontSize: '12px', marginBottom: '8px' }}>Recording Rate (Last 24h)</label>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                  {storageStats.gb_per_hour > 0 ? `${storageStats.gb_per_hour.toFixed(2)} GB/hr` : 'Calculating...'}
                </div>
              </div>

              <div className="form-group" style={{ margin: 0, padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                <label className="form-label" style={{ fontSize: '12px', marginBottom: '8px' }}>Estimated Time Remaining</label>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                  {storageStats.hours_until_full > 0 
                    ? (storageStats.hours_until_full > 48 
                        ? `${(storageStats.hours_until_full / 24).toFixed(1)} Days` 
                        : `${storageStats.hours_until_full.toFixed(0)} Hours`)
                    : '∞ Days'}
                </div>
              </div>

            </div>
          </div>
        )}

        <div className="glass-panel" style={{ padding: '20px', marginBottom: '20px', display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>📼 Recordings Archive</h2>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '12px' }}>Date</label>
                <input 
                  type="date" 
                  className="form-input" 
                  style={{ width: 'auto' }}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '12px' }}>Camera</label>
                <select 
                  className="form-input"
                  style={{ width: 'auto', minWidth: '150px' }}
                  value={selectedCameraId}
                  onChange={(e) => setSelectedCameraId(e.target.value)}
                >
                  <option value="all">All Cameras</option>
                  {cameras.map(cam => (
                    <option key={cam.id} value={cam.id}>{cam.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={fetchArchive} disabled={loading}>
                  {loading ? '↻ Loading...' : '↻ Refresh'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {playingRecording && (
          <div className="glass-panel fade-in" style={{ padding: '16px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>
                Playing: {getCameraName(playingRecording.camera_id)} - {formatTime(playingRecording.start_time)}
              </h3>
              <button 
                className="btn btn-secondary" 
                style={{ padding: '4px 12px', fontSize: '12px' }}
                onClick={() => setPlayingRecording(null)}
              >
                Close Player
              </button>
            </div>
            <video 
              src={`/api/recordings/play/${playingRecording.filepath}?token=${token}`}
              controls
              autoPlay
              style={{ width: '100%', borderRadius: '8px', background: '#000', maxHeight: '500px' }}
            />
          </div>
        )}

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold' }}>Results</h3>
            <span className="badge" style={{ background: 'rgba(255,255,255,0.1)' }}>
              {recordings.length} found
            </span>
          </div>

          {recordings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>📭</div>
              <p>No recordings found for the selected date and camera.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              {recordings.map(rec => {
                const isContinuous = rec.duration && rec.duration >= 300; // rough heuristic: >= 5 mins implies continuous chunk
                
                return (
                  <div 
                    key={rec.id} 
                    className="event-item"
                    onClick={() => setPlayingRecording(rec)}
                    style={{ 
                      padding: '16px', 
                      background: `linear-gradient(to top, rgba(18,22,38,0.95) 0%, rgba(18,22,38,0.4) 60%, rgba(18,22,38,0.1) 100%), url(/api/recordings/thumbnail/${rec.filepath}?token=${token})`, 
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      border: '1px solid var(--border-light)', 
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      minHeight: '140px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'flex-end',
                      textShadow: '0 1px 3px rgba(0,0,0,0.8)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', width: '100%' }}>
                      <div>
                        <div style={{ fontWeight: '600', fontSize: '14px', color: '#fff', marginBottom: '4px' }}>
                          {getCameraName(rec.camera_id)}
                        </div>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '12px', color: 'rgba(255,255,255,0.8)' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>🕒</span> {formatTime(rec.start_time)}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>⏱️</span> {formatDuration(rec.duration)}
                          </span>
                        </div>
                      </div>
                      
                      {isContinuous ? (
                        <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.4)', color: '#fff', fontSize: '10px', backdropFilter: 'blur(4px)' }}>
                          Continuous
                        </span>
                      ) : (
                        <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.4)', color: '#fff', fontSize: '10px', backdropFilter: 'blur(4px)' }}>
                          Motion Clip
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
