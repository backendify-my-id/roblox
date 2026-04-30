import React, { useState } from 'react';
import { fetchWithAuth } from '../utils/api';

const Auth = ({ onLogin }) => {
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
        headers: {
          'Content-Type': 'application/json',
        },
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
        alert('Registrasi berhasil! Silakan login.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <div style={{ background: 'var(--bg-card)', padding: '2rem', borderRadius: '1rem', width: '100%', maxWidth: '400px', border: '1px solid var(--border)' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '1.5rem', fontSize: '1.5rem', background: 'linear-gradient(to right, #60a5fa, #a78bfa)', WebkitBackgroundClip: 'text', color: 'transparent' }}>
          {isLogin ? 'Login Dashboard' : 'Register Akun'}
        </h2>
        
        {error && <div style={{ color: '#ef4444', marginBottom: '1rem', textAlign: 'center', fontSize: '0.9rem' }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Username Roblox / App</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--bg-hover)', color: '#fff' }}
              required
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--bg-hover)', color: '#fff' }}
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{ 
              marginTop: '0.5rem', padding: '0.75rem', borderRadius: '0.5rem', 
              background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer',
              fontWeight: 'bold', transition: 'background 0.2s'
            }}
          >
            {isLoading ? 'Memproses...' : (isLogin ? 'Login' : 'Register')}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          {isLogin ? "Belum punya akun? " : "Sudah punya akun? "}
          <span 
            onClick={() => { setIsLogin(!isLogin); setError(''); }} 
            style={{ color: '#60a5fa', cursor: 'pointer', textDecoration: 'underline' }}
          >
            {isLogin ? 'Daftar sekarang' : 'Login di sini'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default Auth;
