import React, { useState } from 'react';
import { fetchWithAuth } from '../utils/api';

const Auth = ({ onLogin, showToast }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';

    try {
      const response = await fetchWithAuth(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Terjadi kesalahan');
      }

      if (isLogin) {
        onLogin(data.token, data.user);
      } else {
        setIsLogin(true);
        setError('');
        showToast('Registrasi berhasil! Silakan login.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Logo */}
        <div className="auth-logo">
          <span className="auth-logo-icon">✨</span>
          <div className="auth-title">Co-Play Capsule</div>
          <div className="auth-subtitle">
            {isLogin ? 'Selamat datang kembali! 💖' : 'Buat akun baru dan mulai petualangan! 🚀'}
          </div>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: error ? '1rem' : '0' }}>
          <div>
            <label className="auth-label">Username</label>
            <input
              type="text"
              className="auth-input"
              placeholder="Username Roblox / App"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div>
            <label className="auth-label">Password</label>
            <input
              type="password"
              className="auth-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="auth-btn"
            disabled={isLoading}
          >
            {isLoading
              ? (isLogin ? '⏳ Masuk...' : '⏳ Mendaftar...')
              : (isLogin ? '🚀 Masuk Sekarang' : '✨ Daftar Sekarang')}
          </button>
        </form>

        <div className="auth-switch">
          {isLogin ? 'Belum punya akun? ' : 'Sudah punya akun? '}
          <span
            className="auth-switch-link"
            onClick={() => { setIsLogin(!isLogin); setError(''); }}
          >
            {isLogin ? 'Daftar sekarang' : 'Login di sini'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default Auth;
