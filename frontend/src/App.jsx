import React, { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from './utils/api';
import Auth from './components/Auth';
import FriendCard from './components/FriendCard';
import ActivityModal from './components/ActivityModal';
import ProfileChangeModal from './components/ProfileChangeModal';

// ─── Main Dashboard ──────────────────────────────────────────────────────────
function Dashboard({ user }) {
  const [friends, setFriends] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [presenceFilter, setPresenceFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [selectedFriendLog, setSelectedFriendLog] = useState(null);
  const [selectedProfileLog, setSelectedProfileLog] = useState(null);

  const fetchFriends = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (presenceFilter) params.set('presence', presenceFilter);
      if (statusFilter) params.set('status', statusFilter);
      const qs = params.toString();
      const res = await fetchWithAuth(`/api/friends${qs ? '?' + qs : ''}`);
      if (!res.ok) throw new Error('Gagal memuat daftar teman');
      const data = await res.json();
      setFriends(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [presenceFilter, statusFilter]);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  const handleManualSync = async () => {
    setIsSyncing(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/friends/sync', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Gagal sinkronisasi');
      }
      await fetchFriends();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSyncing(false);
    }
  };



  return (
    <div className="app-container">
      <div className="header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ background: 'linear-gradient(to right, #60a5fa, #a78bfa)', WebkitBackgroundClip: 'text', color: 'transparent', fontSize: '2.5rem', margin: 0 }}>
            Roblox Friends Tracker
          </h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Pantau aktivitas teman Roblox Anda secara otomatis.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--bg-card)', padding: '0.75rem 1.5rem', borderRadius: '1rem', border: '1px solid var(--border)' }}>
          {user.avatar ? (
            <img src={user.avatar} alt="Avatar" style={{ width: 48, height: 48, borderRadius: '50%', border: '2px solid #3b82f6' }} />
          ) : (
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>?</div>
          )}
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#fff' }}>{user.displayName}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>@{user.username}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ID: {user.roblox_id}</div>
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              style={{ background: isSyncing ? '#334155' : '#3b82f6', color: '#fff', border: 'none', padding: '0.3rem 0.8rem', borderRadius: '0.3rem', fontSize: '0.8rem', cursor: isSyncing ? 'not-allowed' : 'pointer', marginTop: '0.3rem' }}
            >
              {isSyncing ? 'Menyinkronkan...' : '🔄 Sync Sekarang'}
            </button>
          </div>
        </div>
      </div>

      {error && <div style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1.5rem', border: '1px solid rgba(239,68,68,0.2)' }}>{error}</div>}

      {isLoading ? (
        <div className="loading">Memuat daftar teman...</div>
      ) : (
        <>
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
              {[{ label: 'Semua', value: '' }, { label: '🟢 Online', value: 'Online' }, { label: '🎮 In-Game', value: 'In-Game' }, { label: '🔧 In-Studio', value: 'In-Studio' }, { label: '⚫ Offline', value: 'Offline' }].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setPresenceFilter(opt.value)}
                  style={{
                    padding: '0.4rem 0.9rem', borderRadius: '2rem', fontSize: '0.85rem', cursor: 'pointer',
                    border: presenceFilter === opt.value ? '1px solid #3b82f6' : '1px solid var(--border)',
                    background: presenceFilter === opt.value ? 'rgba(59,130,246,0.15)' : 'var(--bg-card)',
                    color: presenceFilter === opt.value ? '#60a5fa' : 'var(--text-muted)',
                    transition: 'all 0.2s',
                  }}
                >
                  {opt.label}
                </button>
              ))}
              <span style={{ borderLeft: '1px solid var(--border)', margin: '0 0.25rem' }} />
              {[{ label: 'Aktif', value: '' }, { label: '❌ Dihapus', value: 'removed' }].map(opt => (
                <button
                  key={opt.value + '_status'}
                  onClick={() => setStatusFilter(opt.value)}
                  style={{
                    padding: '0.4rem 0.9rem', borderRadius: '2rem', fontSize: '0.85rem', cursor: 'pointer',
                    border: statusFilter === opt.value ? '1px solid #a78bfa' : '1px solid var(--border)',
                    background: statusFilter === opt.value ? 'rgba(167,139,250,0.15)' : 'var(--bg-card)',
                    color: statusFilter === opt.value ? '#a78bfa' : 'var(--text-muted)',
                    transition: 'all 0.2s',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              {friends.length} teman ditemukan
            </div>
          </div>

          {friends.length === 0 ? (
            <div className="loading">
              {(presenceFilter || statusFilter)
                ? 'Tidak ada teman yang cocok dengan filter ini.'
                : 'Belum ada teman yang terlacak. Klik "Sync Sekarang" untuk memuat dari Roblox.'}
            </div>
          ) : (
            <div className="friends-grid">
              {friends.map(f => (
                <FriendCard
                  key={f.id}
                  friend={f}
                  onClickLog={setSelectedFriendLog}
                  onClickProfileLog={setSelectedProfileLog}
                />
              ))}
            </div>
          )}
        </>
      )}

      {selectedFriendLog && (
        <ActivityModal friend={selectedFriendLog} onClose={() => setSelectedFriendLog(null)} />
      )}
      {selectedProfileLog && (
        <ProfileChangeModal friend={selectedProfileLog} onClose={() => setSelectedProfileLog(null)} />
      )}
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  });

  const handleLogin = (newToken, newUser) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const handleLogout = async () => {
    try {
      await fetchWithAuth('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('Failed to blacklist token on server:', err);
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  if (!token || !user) {
    return <Auth onLogin={handleLogin} />;
  }

  return (
    <>
      <div style={{ position: 'absolute', top: '1rem', right: '1rem', zIndex: 100 }}>
        <button onClick={handleLogout} style={{ padding: '0.4rem 1rem', borderRadius: '0.5rem', background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer' }}>Logout</button>
      </div>
      <Dashboard user={user} />
    </>
  );
}

export default App;
