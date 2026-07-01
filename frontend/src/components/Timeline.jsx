import React, { useRef, useState } from 'react';

export default function Timeline({ recordings, selectedDate, onDateChange, onPlayRecording, currentPlaybackTime, events }) {
  const trackRef = useRef(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Helper to convert ISO time to seconds from start of the selected day
  const getTimeInSecondsForDay = (isoStr) => {
    try {
      const dt = new Date(isoStr);
      const selected = new Date(selectedDate);
      
      // Check if it's the same day
      if (dt.toDateString() !== selected.toDateString()) {
        // Clamp to start/end of day
        if (dt < selected) return 0;
        return 86400;
      }
      
      return dt.getHours() * 3600 + dt.getMinutes() * 60 + dt.getSeconds();
    } catch (e) {
      return 0;
    }
  };

  // Convert Date object/timestamp to seconds of day (for playhead)
  const getPlayheadSeconds = () => {
    if (!currentPlaybackTime) return null;
    try {
      const dt = new Date(currentPlaybackTime);
      const selected = new Date(selectedDate);
      
      if (dt.toDateString() !== selected.toDateString()) {
        return null;
      }
      return dt.getHours() * 3600 + dt.getMinutes() * 60 + dt.getSeconds();
    } catch (e) {
      return null;
    }
  };

  const handleTrackClick = (e) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickPct = clickX / rect.width;
    const clickSeconds = clickPct * 86400;

    // Find if click falls inside any recording segment
    const clickedRec = recordings.find((rec) => {
      const startSec = getTimeInSecondsForDay(rec.start_time);
      const endSec = rec.end_time 
        ? getTimeInSecondsForDay(rec.end_time) 
        : getTimeInSecondsForDay(new Date().toISOString());
      
      return clickSeconds >= startSec && clickSeconds <= endSec;
    });

    if (clickedRec) {
      const startSec = getTimeInSecondsForDay(clickedRec.start_time);
      const offset = clickSeconds - startSec;
      onPlayRecording(clickedRec, offset);
    } else {
      // Seek to nearest preceding recording
      const prevRecs = recordings.filter(r => getTimeInSecondsForDay(r.start_time) < clickSeconds);
      if (prevRecs.length > 0) {
          const nearestPrev = prevRecs[prevRecs.length - 1];
          const startSec = getTimeInSecondsForDay(nearestPrev.start_time);
          const endSec = nearestPrev.end_time ? getTimeInSecondsForDay(nearestPrev.end_time) : startSec + 10;
          onPlayRecording(nearestPrev, endSec - startSec);
      } else if (recordings.length > 0) {
          onPlayRecording(recordings[0], 0);
      } else {
          onPlayRecording(null, clickSeconds);
      }
    }
  };

  const playheadSec = getPlayheadSeconds();
  const playheadPct = playheadSec !== null ? (playheadSec / 86400) * 100 : null;

  // Generate hourly labels
  const hourLabels = [];
  for (let i = 0; i <= 24; i += 2) {
    hourLabels.push(i);
  }

  return (
    <div className="timeline-container glass-panel" style={{ padding: '16px' }}>
      <div className="timeline-info" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontWeight: '600' }}>📹 Event Timeline</span>
        
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Date:</label>
          <input 
            type="date" 
            value={selectedDate}
            onChange={(e) => onDateChange && onDateChange(e.target.value)}
            style={{ 
              background: 'rgba(0,0,0,0.3)', 
              border: '1px solid var(--border-light)', 
              color: 'white', 
              padding: '4px 8px', 
              borderRadius: '4px',
              colorScheme: 'dark'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Zoom: {zoomLevel}x</label>
          <input 
            type="range" 
            min="1" 
            max="24" 
            value={zoomLevel}
            onChange={(e) => setZoomLevel(parseInt(e.target.value))}
            style={{ width: '100px', cursor: 'pointer' }}
          />
        </div>
      </div>

      <div style={{ overflowX: 'auto', paddingBottom: '8px' }}>
        <div 
          className="timeline-track-outer" 
          ref={trackRef}
          onClick={handleTrackClick}
          style={{ width: `${zoomLevel * 100}%`, minWidth: '100%' }}
        >
          {/* Hour markers/ticks */}
        {hourLabels.map((hr) => {
          const pct = (hr / 24) * 100;
          return (
            <React.Fragment key={hr}>
              <div 
                className="ruler-tick hour" 
                style={{ left: `${pct}%` }}
              />
              {hr < 24 && (
                <div 
                  className={`ruler-tick-label hr-${hr}`} 
                  style={{ left: `${pct}%` }}
                >
                  {String(hr).padStart(2, '0')}:00
                </div>
              )}
            </React.Fragment>
          );
        })}

        {/* Half-hour ticks */}
        {Array.from({ length: 24 }).map((_, hr) => {
          const pct = ((hr + 0.5) / 24) * 100;
          return (
            <div 
              key={`half-${hr}`} 
              className="ruler-tick" 
              style={{ left: `${pct}%` }}
            />
          );
        })}

        {/* Recording segments */}
        {recordings.map((rec) => {
          const startSec = getTimeInSecondsForDay(rec.start_time);
          const endSec = rec.end_time 
            ? getTimeInSecondsForDay(rec.end_time) 
            : getTimeInSecondsForDay(new Date().toISOString());
          
          const leftPct = (startSec / 86400) * 100;
          const widthPct = ((endSec - startSec) / 86400) * 100;

          // Don't render if outside selected day
          if (leftPct >= 100 || leftPct + widthPct <= 0) return null;

          return (
            <div
              key={rec.id}
              className="timeline-record-segment"
              style={{
                left: `${Math.max(0, leftPct)}%`,
                width: `${Math.min(100 - leftPct, widthPct)}%`,
              }}
              title={`Recording: ${new Date(rec.start_time).toLocaleTimeString()} - ${rec.end_time ? new Date(rec.end_time).toLocaleTimeString() : 'Active'}`}
            />
          );
        })}

        {/* Motion event indicators */}
        {events && events.filter(ev => ev.event_type === 'MOTION_START').map((ev) => {
          const sec = getTimeInSecondsForDay(ev.timestamp);
          const pct = (sec / 86400) * 100;
          
          if (pct < 0 || pct > 100) return null;
          
          return (
            <div 
              key={ev.id}
              className="timeline-motion-marker"
              onClick={(e) => {
                e.stopPropagation();
                const targetSec = Math.max(0, sec - 2); // Jump 2s before motion
                const rec = recordings.find((r) => {
                  const s = getTimeInSecondsForDay(r.start_time);
                  const en = r.end_time ? getTimeInSecondsForDay(r.end_time) : 86400;
                  return targetSec >= s && targetSec <= en;
                });
                if (rec) {
                  onPlayRecording(rec, targetSec - getTimeInSecondsForDay(rec.start_time));
                } else {
                  const prevRecs = recordings.filter(r => getTimeInSecondsForDay(r.start_time) < targetSec);
                  if (prevRecs.length > 0) {
                      const nearestPrev = prevRecs[prevRecs.length - 1];
                      const startSec = getTimeInSecondsForDay(nearestPrev.start_time);
                      const endSec = nearestPrev.end_time ? getTimeInSecondsForDay(nearestPrev.end_time) : startSec + 10;
                      onPlayRecording(nearestPrev, endSec - startSec);
                  } else if (recordings.length > 0) {
                      onPlayRecording(recordings[0], 0);
                  } else {
                      onPlayRecording(null, targetSec);
                  }
                }
              }}
              style={{
                left: `${pct}%`,
                position: 'absolute',
                top: '15px',
                width: '6px',
                height: '30px',
                background: 'var(--accent-motion)',
                boxShadow: '0 0 6px var(--accent-motion-glow)',
                zIndex: 5,
                cursor: 'pointer'
              }}
              title={`Motion Alert: ${new Date(ev.timestamp).toLocaleTimeString()}`}
            />
          );
        })}

        {/* Playhead */}
        {playheadPct !== null && (
          <div 
            className="timeline-playhead" 
            style={{ left: `${playheadPct}%` }}
          >
            <div className="timeline-playhead-cap" />
          </div>
        )}
        </div>
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
        <span>00:00 (Midnight)</span>
        <span>12:00 (Noon)</span>
        <span>24:00 (Midnight)</span>
      </div>
    </div>
  );
}
