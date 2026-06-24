import React from 'react';

export default function EventLog({ events, onEventClick }) {
  const formatTime = (isoStr) => {
    try {
      const date = new Date(isoStr);
      return date.toLocaleTimeString();
    } catch (e) {
      return isoStr;
    }
  };

  const formatDate = (isoStr) => {
    try {
      const date = new Date(isoStr);
      return date.toLocaleDateString();
    } catch (e) {
      return '';
    }
  };

  return (
    <div className="event-log-container glass-panel fade-in">
      <div className="event-log-header">
        <h3 style={{ fontSize: '18px', fontWeight: '700' }}>🔔 Recent Events</h3>
        <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>
          {events.length} logs
        </span>
      </div>

      <div className="event-log-list">
        {events.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>
            No recent events logged.
          </div>
        ) : (
          events.map((evt) => {
            const isMotion = evt.event_type.startsWith('MOTION');
            return (
              <div 
                key={evt.id} 
                className="event-item"
                onClick={() => onEventClick(evt)}
              >
                <div className={`event-icon ${isMotion ? 'motion' : 'system'}`}>
                  {isMotion ? '🏃' : '⚙️'}
                </div>
                <div className="event-details">
                  <div className="event-title">{evt.details}</div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span className="event-time">{formatTime(evt.timestamp)}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>•</span>
                    <span className="event-time">{formatDate(evt.timestamp)}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
