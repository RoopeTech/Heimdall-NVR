import React, { useState, useEffect } from 'react';

export default function RecordingsArchive({ cameras, token }) {
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedCameraId, setSelectedCameraId] = useState('all');
  const [playingRecording, setPlayingRecording] = useState(null);

  useEffect(() => {
    fetchArchive();
  }, [selectedDate, selectedCameraId]);

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
                      background: 'rgba(0,0,0,0.2)', 
                      border: '1px solid var(--border-light)', 
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div style={{ fontWeight: '600', fontSize: '14px', color: 'var(--text-primary)' }}>
                        {getCameraName(rec.camera_id)}
                      </div>
                      {isContinuous ? (
                        <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', fontSize: '10px' }}>
                          Continuous
                        </span>
                      ) : (
                        <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', fontSize: '10px' }}>
                          Motion Clip
                        </span>
                      )}
                    </div>
                    
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <span style={{ width: '16px' }}>🕒</span>
                      {formatTime(rec.start_time)}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <span style={{ width: '16px' }}>⏱️</span>
                      {formatDuration(rec.duration)}
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
