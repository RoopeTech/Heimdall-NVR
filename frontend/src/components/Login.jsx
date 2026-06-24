import React, { useState } from 'react';

export default function Login({ appTitle, onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        const data = await res.json();
        // data has { token, user: { id, username, role } }
        onLoginSuccess(data.token, data.user);
      } else {
        const data = await res.json();
        setError(data.detail || 'Invalid username or password');
      }
    } catch (err) {
      setError('Network error, please try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'radial-gradient(circle at 50% 0%, #111a30 0%, #060913 70%)',
      padding: '20px',
    }}>
      <div className="glass-panel fade-in login-card">
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📹</div>
        <h1 style={{
          fontSize: '28px',
          fontWeight: '700',
          marginBottom: '8px',
          background: 'linear-gradient(135deg, #f8fafc 0%, #94a3b8 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          {appTitle}
        </h1>
        <p style={{
          color: 'var(--text-secondary)',
          fontSize: '14px',
          marginBottom: '32px',
        }}>
          Sign in to access live streams and recordings
        </p>

        {error && (
          <div style={{
            padding: '12px 16px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid var(--accent-motion)',
            borderRadius: '8px',
            color: 'var(--accent-motion)',
            fontSize: '13px',
            textAlign: 'left',
            marginBottom: '20px',
          }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ textAlign: 'left' }}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              type="text"
              className="form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
              autoFocus
            />
          </div>

          <div className="form-group" style={{ marginBottom: '32px' }}>
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', height: '46px', fontSize: '15px' }}
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <div style={{
          marginTop: '24px',
          fontSize: '11px',
          color: 'var(--text-muted)',
          lineHeight: '1.5',
        }}>
          If this is your first time logging in, use default credentials:<br />
          <code style={{ color: 'var(--text-secondary)' }}>admin</code> / <code style={{ color: 'var(--text-secondary)' }}>admin</code>
        </div>
      </div>
    </div>
  );
}
