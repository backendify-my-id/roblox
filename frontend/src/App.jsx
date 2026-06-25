import React, { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth, API_URL } from './utils/api';
import Auth from './components/Auth';
import FriendCard from './components/FriendCard';
import ActivityModal from './components/ActivityModal';
import ProfileChangeModal from './components/ProfileChangeModal';
import SettingsModal from './components/SettingsModal';
import AdminDashboard from './components/AdminDashboard';
import MyProfileModal from './components/MyProfileModal';
import GameListsPage from './components/GameListsPage';
import GameListDetailPage from './components/GameListDetailPage';
import GameEntryDetailPage from './components/GameEntryDetailPage';
import PublicGameListPage from './components/PublicGameListPage';

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
  const [isMyProfileOpen, setIsMyProfileOpen] = useState(false);

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

  // Real-time WebSocket connection
  useEffect(() => {
    let socket;
    let reconnectTimeout;
    let isMounted = true;

    const connectWebSocket = () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        let wsUrl = API_URL.replace(/^http/, 'ws');
        wsUrl = `${wsUrl}/api/ws?token=${encodeURIComponent(token)}`;

        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
          console.log('[WS] Connected to real-time status stream');
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('[WS] Message received:', data);

            if (data.type === 'presence_update' || data.type === 'profile_update') {
              const updatedFriend = data.payload;
              if (updatedFriend && updatedFriend.id) {
                setFriends((prevFriends) => {
                  return prevFriends.map((f) => 
                    f.id === updatedFriend.id ? { ...f, ...updatedFriend } : f
                  );
                });
              }
            }
          } catch (err) {
            console.error('[WS] Error processing message:', err);
          }
        };

        socket.onclose = (event) => {
          console.log('[WS] Connection closed:', event.reason);
          if (isMounted) {
            reconnectTimeout = setTimeout(connectWebSocket, 3000);
          }
        };

        socket.onerror = (err) => {
          console.error('[WS] Socket error:', err);
        };
      } catch (err) {
        console.error('[WS] Connection error:', err);
      }
    };

    connectWebSocket();

    return () => {
      isMounted = false;
      if (socket) {
        socket.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, []);

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
  const handleSaveNote = async (friendId, newNote) => {
    try {
      const res = await fetchWithAuth(`/api/friends/${friendId}/note`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: newNote })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Gagal menyimpan catatan');
      }
      showToast('Catatan berhasil disimpan');
      setFriends(prev => prev.map(f => f.id === friendId ? { ...f, note: newNote } : f));
    } catch (err) {
      showToast(err.message, 'error');
    }
  };


  return (
    <div className="app-container">
      <div className="dashboard-header">
        <div className="header-info">
          <h1 className="header-title">
            ✨ Roblox Co-Play & Memory Capsule 💖
          </h1>
          <p className="header-desc">
            Kapsul waktu kenangan & bucket list petualangan Roblox bersama orang-orang tersayang! 🚀
          </p>
        </div>
        <div className="header-user-card">
          {user.avatar ? (
            <img src={user.avatar} alt="Avatar" style={{ width: 48, height: 48, borderRadius: '50%', border: '2px solid #3b82f6' }} />
          ) : (
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>?</div>
          )}
          <div className="user-details">
            <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#fff' }}>{user.displayName}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>@{user.username}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ID: {user.roblox_id}</div>
            
            <div className="user-actions">
              <button
                onClick={handleManualSync}
                disabled={isSyncing}
                style={{ background: isSyncing ? '#334155' : '#3b82f6', color: '#fff', border: 'none', padding: '0.3rem 0.8rem', borderRadius: '0.3rem', fontSize: '0.8rem', cursor: isSyncing ? 'not-allowed' : 'pointer' }}
              >
                {isSyncing ? 'Menyinkronkan...' : '🔄 Sync Sekarang'}
              </button>
              
              <button
                onClick={() => setIsMyProfileOpen(true)}
                style={{ background: '#10b981', color: '#fff', border: 'none', padding: '0.3rem 0.8rem', borderRadius: '0.3rem', fontSize: '0.8rem', cursor: 'pointer' }}
              >
                📋 Riwayat Saya
              </button>

              {user && (
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  style={{ background: 'transparent', color: '#94a3b8', border: '1px solid #334155', padding: '0.3rem 0.8rem', borderRadius: '0.3rem', fontSize: '0.8rem', cursor: 'pointer' }}
                >
                  ⚙️ Pengaturan
                </button>
              )}
            </div>
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
                  onSaveNote={handleSaveNote}
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
      {isMyProfileOpen && (
        <MyProfileModal user={user} onClose={() => setIsMyProfileOpen(false)} />
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
  const [currentView, setCurrentView] = useState('gameLists');
  const [activeListId, setActiveListId] = useState(null);
  const [activeEntryId, setActiveEntryId] = useState(null);

  // Parse path for public view-only sharing link
  const [publicShareToken, setPublicShareToken] = useState(() => {
    const path = window.location.pathname;
    if (path.startsWith('/public/')) {
      return path.split('/public/')[1];
    }
    return null;
  });

  const navigateTo = (view, listId = null, entryId = null) => {
    setCurrentView(view);
    setActiveListId(listId);
    setActiveEntryId(entryId);
  };

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
    navigateTo('gameLists');
    showToastMsg('Anda telah berhasil keluar.', 'success');
  };

  const hasAdminPanelAccess = user && (user.role === 'admin' || (user.permissions && (
    user.permissions.includes('view_users_list') ||
    user.permissions.includes('view_playing_together') ||
    user.permissions.includes('view_shadow_activities')
  )));

  // Render public page if share link accessed
  if (publicShareToken) {
    return (
      <>
        <PublicGameListPage
          shareToken={publicShareToken}
          onBack={() => {
            window.history.pushState({}, '', '/');
            setPublicShareToken(null);
          }}
          onImportSuccess={() => {
            window.history.pushState({}, '', '/');
            setPublicShareToken(null);
            navigateTo('gameLists');
          }}
          showToast={showToastMsg}
        />
        {toast && (
          <div className={`toast toast-${toast.type}`}>
            <span>{toast.type === 'success' ? '✅' : '❌'}</span>
            <span>{toast.message}</span>
          </div>
        )}
      </>
    );
  }

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
      <nav className="navbar">
        <div className="nav-logo" onClick={() => navigateTo('gameLists')}>
          <span className="logo-emoji">✨</span>
          <span className="logo-text">
            Co-Play Capsule
          </span>
        </div>
        
        <div className="nav-actions">
          <button
            onClick={() => navigateTo('gameLists')}
            style={{
              padding: '0.5rem 1rem', borderRadius: '0.75rem', border: 'none',
              background: currentView === 'gameLists' || currentView === 'listDetail' || currentView === 'entryDetail' ? 'linear-gradient(135deg, #ec4899, #8b5cf6)' : 'transparent',
              color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem',
              boxShadow: currentView === 'gameLists' || currentView === 'listDetail' || currentView === 'entryDetail' ? '0 4px 10px rgba(236,72,153,0.2)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            🎮 Game Lists
          </button>
          <button
            onClick={() => navigateTo('dashboard')}
            style={{
              padding: '0.5rem 1rem', borderRadius: '0.75rem', border: 'none',
              background: currentView === 'dashboard' ? 'linear-gradient(135deg, #ec4899, #8b5cf6)' : 'transparent',
              color: currentView === 'dashboard' ? '#fff' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem',
              boxShadow: currentView === 'dashboard' ? '0 4px 10px rgba(236,72,153,0.2)' : 'none',
              transition: 'all 0.2s'
            }}
            onMouseOver={e => { if (currentView !== 'dashboard') e.currentTarget.style.color = '#fff'; }}
            onMouseOut={e => { if (currentView !== 'dashboard') e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            📡 Live Status
          </button>
          {hasAdminPanelAccess && (
            <button
              onClick={() => navigateTo('admin')}
              style={{
                padding: '0.5rem 1rem', borderRadius: '0.75rem', border: 'none',
                background: currentView === 'admin' ? '#3b82f6' : 'transparent',
                color: currentView === 'admin' ? '#fff' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem',
                transition: 'all 0.2s'
              }}
              onMouseOver={e => { if (currentView !== 'admin') e.currentTarget.style.color = '#fff'; }}
              onMouseOut={e => { if (currentView !== 'admin') e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              🔑 Admin
            </button>
          )}
          <button
            onClick={handleLogout}
            style={{
              padding: '0.5rem 1rem', borderRadius: '0.75rem', border: '1px solid rgba(239, 68, 68, 0.4)',
              background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem',
              transition: 'all 0.2s', marginLeft: '0.5rem'
            }}
            onMouseOver={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'; }}
            onMouseOut={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; }}
          >
            🚪 Keluar
          </button>
        </div>
      </nav>

      {currentView === 'dashboard' && <Dashboard user={user} showToast={showToastMsg} />}
      {currentView === 'admin' && <AdminDashboard user={user} showToast={showToastMsg} onBack={() => navigateTo('gameLists')} />}
      {currentView === 'gameLists' && (
        <GameListsPage
          user={user}
          showToast={showToastMsg}
          onNavigate={(view, id) => navigateTo('listDetail', id)}
        />
      )}
      {currentView === 'listDetail' && activeListId && (
        <GameListDetailPage
          listId={activeListId}
          user={user}
          showToast={showToastMsg}
          onBack={() => navigateTo('gameLists')}
          onNavigateEntry={(entryId) => navigateTo('entryDetail', activeListId, entryId)}
        />
      )}
      {currentView === 'entryDetail' && activeListId && activeEntryId && (
        <GameEntryDetailPage
          listId={activeListId}
          entryId={activeEntryId}
          user={user}
          showToast={showToastMsg}
          onBack={() => navigateTo('listDetail', activeListId)}
        />
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
