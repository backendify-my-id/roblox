import React, { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from './utils/api';
import Auth from './components/Auth';
import FriendCard from './components/FriendCard';
import ActivityModal from './components/ActivityModal';
import ProfileChangeModal from './components/ProfileChangeModal';
import SettingsModal from './components/SettingsModal';
import AdminDashboard from './components/AdminDashboard';

// ─── Main Dashboard ──────────────────────────────────────────────────────────
function Dashboard({ user, showToast }) {
  const [friends, setFriends] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [presenceFilter, setPresenceFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Handle debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500); // Tunggu 500ms setelah berhenti mengetik
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const [selectedFriendLog, setSelectedFriendLog] = useState(null);
  const [selectedProfileLog, setSelectedProfileLog] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const fetchFriends = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (presenceFilter) params.set('presence', presenceFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);
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
  }, [presenceFilter, statusFilter, debouncedSearch]);

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
      showToast('Sinkronisasi data berhasil!');
      await fetchFriends();
    } catch (err) {
      showToast(err.message, 'error');
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
            {user.role === 'admin' && (
              <button
                onClick={() => setIsSettingsOpen(true)}
                style={{ background: 'transparent', color: '#94a3b8', border: '1px solid #334155', padding: '0.3rem 0.8rem', borderRadius: '0.3rem', fontSize: '0.8rem', cursor: 'pointer', marginTop: '0.3rem' }}
              >
                ⚙️ Pengaturan
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <div style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1.5rem', border: '1px solid rgba(239,68,68,0.2)' }}>{error}</div>}

      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ marginBottom: '1rem' }}>
          <span className="filter-label">Filter Status & Aktivitas</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {[{ label: 'Semua', value: '' }, { label: '🟢 Online', value: 'Online' }, { label: '🎮 In-Game', value: 'In-Game' }, { label: '🔧 In-Studio', value: 'In-Studio' }, { label: '⚫ Offline', value: 'Offline' }].map(opt => (
              <button
                key={opt.value}
                onClick={() => setPresenceFilter(opt.value)}
                className="filter-btn"
                style={{
                  padding: '0.4rem 0.9rem', borderRadius: '2rem', fontSize: '0.85rem', cursor: 'pointer',
                  border: presenceFilter === opt.value ? '1px solid #3b82f6' : '1px solid var(--border)',
                  background: presenceFilter === opt.value ? 'rgba(59,130,246,0.15)' : 'var(--bg-card)',
                  color: presenceFilter === opt.value ? '#60a5fa' : 'var(--text-muted)',
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
                className="filter-btn"
                style={{
                  padding: '0.4rem 0.9rem', borderRadius: '2rem', fontSize: '0.85rem', cursor: 'pointer',
                  border: statusFilter === opt.value ? '1px solid #a78bfa' : '1px solid var(--border)',
                  background: statusFilter === opt.value ? 'rgba(167,139,250,0.15)' : 'var(--bg-card)',
                  color: statusFilter === opt.value ? '#a78bfa' : 'var(--text-muted)',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search Input Container */}
        <div className="search-container" style={{ maxWidth: '400px' }}>
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Cari username atau nama..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.6rem 2.5rem 0.6rem 2.5rem', // Added left padding for search icon
              borderRadius: '0.5rem',
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              color: '#fff',
              fontSize: '0.95rem'
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '1.2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0.2rem'
              }}
              title="Hapus pencarian"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="friends-grid">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton-card skeleton" />
          ))}
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '0.75rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {friends.length} teman ditemukan
          </div>

          {friends.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🔎</div>
              <p style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '0.5rem' }}>
                {(presenceFilter || statusFilter || searchQuery)
                  ? 'Tidak ada hasil ditemukan'
                  : 'Daftar teman kosong'}
              </p>
              <p>
                {(presenceFilter || statusFilter || searchQuery)
                  ? 'Coba ubah filter atau kata kunci pencarian Anda.'
                  : 'Klik "Sync Sekarang" untuk mulai melacak aktivitas teman Anda.'}
              </p>
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
      {isSettingsOpen && (
        <SettingsModal user={user} onClose={() => setIsSettingsOpen(false)} showToast={showToast} />
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
  const [toast, setToast] = useState(null);
  const [currentView, setCurrentView] = useState('dashboard');

  const showToastMsg = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Efek welcome saat user baru saja login
  useEffect(() => {
    if (user && token) {
      showToastMsg(`Selamat datang kembali, ${user.displayName}!`);
    }
  }, [user?.id]);

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
    setCurrentView('dashboard');
    showToastMsg('Anda telah berhasil keluar.', 'success');
  };

  if (!token || !user) {
    return (
      <>
        <Auth onLogin={handleLogin} showToast={showToastMsg} />
        {toast && (
          <div className={`toast toast-${toast.type}`}>
            <span>{toast.type === 'success' ? '✅' : '❌'}</span>
            <span>{toast.message}</span>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div style={{ position: 'absolute', top: '1rem', right: '1rem', zIndex: 100, display: 'flex', gap: '0.5rem' }}>
        {user.role === 'admin' && currentView === 'dashboard' && (
          <button 
            onClick={() => setCurrentView('admin')} 
            style={{ padding: '0.4rem 1rem', borderRadius: '0.5rem', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            Admin Panel
          </button>
        )}
        <button onClick={handleLogout} style={{ padding: '0.4rem 1rem', borderRadius: '0.5rem', background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer' }}>Logout</button>
      </div>

      {currentView === 'dashboard' ? (
        <Dashboard user={user} showToast={showToastMsg} />
      ) : (
        <AdminDashboard user={user} showToast={showToastMsg} onBack={() => setCurrentView('dashboard')} />
      )}

      {toast && (
        <div className={`toast toast-${toast.type}`}>
          <span>{toast.type === 'success' ? '✅' : '❌'}</span>
          <span>{toast.message}</span>
        </div>
      )}
    </>
  );
}

export default App;
