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
function Dashboard({ user, appName = 'Co-Play Capsule', showToast, onSync, isSyncing, onOpenProfile, onOpenSettings }) {
  const [friends, setFriends] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
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

  const handleManualSync = onSync;
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
            ✨ {appName} 💖
          </h1>
          <p className="header-desc">
            Kapsul waktu kenangan & bucket list petualangan Roblox bersama orang-orang tersayang! 🚀
          </p>
          <div className="dashboard-stats">
            <span className="stat-chip stat-chip-online">
              🟢 {friends.filter(f => f.current_presence === 'Online').length} Online
            </span>
            <span className="stat-chip stat-chip-ingame">
              🎮 {friends.filter(f => f.current_presence === 'In-Game').length} In-Game
            </span>
            <span className="stat-chip stat-chip-total">
              👥 {friends.length} Teman
            </span>
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
                  showDisplayNames={user.show_display_names !== false}
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
  const [currentView, setCurrentView] = useState(() => {
    return localStorage.getItem('currentView') || 'dashboard';
  });
  const [activeListId, setActiveListId] = useState(() => {
    const val = localStorage.getItem('activeListId');
    return val ? parseInt(val, 10) : null;
  });
  const [activeEntryId, setActiveEntryId] = useState(() => {
    const val = localStorage.getItem('activeEntryId');
    return val ? parseInt(val, 10) : null;
  });

  const [appName, setAppName] = useState('Co-Play Capsule');
  const [enableRegistration, setEnableRegistration] = useState(true);

  // Load public configs (App Name, enable registration)
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch(`${API_URL}/api/config`);
        if (res.ok) {
          const data = await res.json();
          if (data.app_name) {
            setAppName(data.app_name);
            document.title = data.app_name; // Set browser tab title
          }
          if (data.enable_registration !== undefined) {
            setEnableRegistration(data.enable_registration);
          }
        }
      } catch (err) {
        console.error('Error fetching public system config:', err);
      }
    };
    fetchConfig();
  }, []);

  // Apply theme when user preference or user state changes
  useEffect(() => {
    const applyTheme = (theme) => {
      const root = document.documentElement;
      if (theme === 'light') {
        root.classList.add('light-theme');
      } else if (theme === 'dark') {
        root.classList.remove('light-theme');
      } else if (theme === 'system') {
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (systemDark) {
          root.classList.remove('light-theme');
        } else {
          root.classList.add('light-theme');
        }
      }
    };

    if (user && user.theme_preference) {
      applyTheme(user.theme_preference);
      
      // Listen for system preference changes if system theme selected
      if (user.theme_preference === 'system') {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleSystemThemeChange = () => applyTheme('system');
        mediaQuery.addEventListener('change', handleSystemThemeChange);
        return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
      }
    } else {
      document.documentElement.classList.remove('light-theme'); // Default to dark mode
    }
  }, [user]);

  // User dropdown & modal state (lifted from Dashboard)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMyProfileOpen, setIsMyProfileOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Parse path for public view-only sharing link
  const [publicShareToken, setPublicShareToken] = useState(() => {
    const path = window.location.pathname;
    if (path.startsWith('/public/')) {
      return path.split('/public/')[1];
    }
    return null;
  });

  const navigateTo = (view, listId = null, entryId = null) => {
    localStorage.setItem('currentView', view);
    if (listId !== null) {
      localStorage.setItem('activeListId', listId);
    } else {
      localStorage.removeItem('activeListId');
    }
    if (entryId !== null) {
      localStorage.setItem('activeEntryId', entryId);
    } else {
      localStorage.removeItem('activeEntryId');
    }
    setCurrentView(view);
    setActiveListId(listId);
    setActiveEntryId(entryId);
  };

  const showToastMsg = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleLogin = (newToken, newUser) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    showToastMsg(`Selamat datang kembali, ${newUser.displayName}!`);
  };

  const handleLogout = async () => {
    try {
      await fetchWithAuth('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('Failed to blacklist token on server:', err);
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('currentView');
    localStorage.removeItem('activeListId');
    localStorage.removeItem('activeEntryId');
    localStorage.removeItem('adminActiveView');
    setToken(null);
    setUser(null);
    setIsUserMenuOpen(false);
    navigateTo('dashboard');
    showToastMsg('Anda telah berhasil keluar.', 'success');
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    setIsUserMenuOpen(false);
    try {
      const res = await fetchWithAuth('/api/friends/sync', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Gagal sinkronisasi');
      }
      showToastMsg('Sinkronisasi data berhasil!');
    } catch (err) {
      showToastMsg(err.message, 'error');
    } finally {
      setIsSyncing(false);
    }
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
            <span className="toast-icon">{toast.type === 'success' ? '✅' : '❌'}</span>
            <span className="toast-message">{toast.message}</span>
          </div>
        )}
      </>
    );
  }

  if (!token || !user) {
    return (
      <>
        <Auth 
          onLogin={handleLogin} 
          showToast={showToastMsg} 
          appName={appName}
          enableRegistration={enableRegistration}
        />
        {toast && (
          <div className={`toast toast-${toast.type}`}>
            <span className="toast-icon">{toast.type === 'success' ? '✅' : '❌'}</span>
            <span className="toast-message">{toast.message}</span>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <nav className="navbar">
        <div className="nav-logo" onClick={() => navigateTo('dashboard')}>
          <span className="logo-emoji">✨</span>
          <span className="logo-text">{appName}</span>
        </div>
        
        <div className="nav-actions">
          <button
            onClick={() => navigateTo('gameLists')}
            className={`nav-btn${(currentView === 'gameLists' || currentView === 'listDetail' || currentView === 'entryDetail') ? ' active' : ''}`}
          >
            📖 Bucket List
          </button>
          <button
            onClick={() => navigateTo('dashboard')}
            className={`nav-btn${currentView === 'dashboard' ? ' active' : ''}`}
          >
            💫 Live Tracker
          </button>
          {hasAdminPanelAccess && (
            <button
              onClick={() => navigateTo('admin')}
              className={`nav-btn${currentView === 'admin' ? ' active' : ''}`}
            >
              🔐 Admin
            </button>
          )}

          {/* User chip with dropdown */}
          <div className="nav-user-chip-wrap" style={{ position: 'relative' }}>
            <div
              className="nav-user-chip"
              onClick={() => setIsUserMenuOpen(prev => !prev)}
              style={{ cursor: 'pointer' }}
            >
              {user.avatar ? (
                <img src={user.avatar} alt="Avatar" className="nav-user-avatar" />
              ) : (
                <div className="nav-user-avatar-fallback">
                  {(user.displayName || user.username || '?')[0].toUpperCase()}
                </div>
              )}
              <span className="nav-user-name">{user.displayName || user.username}</span>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: '0.15rem' }}>
                {isUserMenuOpen ? '▲' : '▼'}
              </span>
            </div>

            {/* Dropdown menu */}
            {isUserMenuOpen && (
              <>
                {/* Backdrop to close */}
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 199 }}
                  onClick={() => setIsUserMenuOpen(false)}
                />
                <div className="nav-dropdown">
                  {/* User info header */}
                  <div className="nav-dropdown-header">
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff' }}>
                      {user.displayName}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>@{user.username}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                      ID: {user.roblox_id}
                    </div>
                  </div>
                  <div className="nav-dropdown-divider" />
                  <button
                    className="nav-dropdown-item"
                    onClick={handleManualSync}
                    disabled={isSyncing}
                  >
                    <span>{isSyncing ? '⏳' : '🔄'}</span>
                    <span>{isSyncing ? 'Menyinkronkan...' : 'Sync Sekarang'}</span>
                  </button>
                  <button
                    className="nav-dropdown-item"
                    onClick={() => { setIsMyProfileOpen(true); setIsUserMenuOpen(false); }}
                  >
                    <span>📋</span>
                    <span>Riwayat Saya</span>
                  </button>
                  <button
                    className="nav-dropdown-item"
                    onClick={() => { setIsSettingsOpen(true); setIsUserMenuOpen(false); }}
                  >
                    <span>⚙️</span>
                    <span>Pengaturan</span>
                  </button>
                  <div className="nav-dropdown-divider" />
                  <button
                    className="nav-dropdown-item nav-dropdown-item-danger"
                    onClick={handleLogout}
                  >
                    <span>🚪</span>
                    <span>Keluar</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </nav>

      {currentView === 'dashboard' && (
        <Dashboard
          user={user}
          appName={appName}
          showToast={showToastMsg}
          onSync={handleManualSync}
          isSyncing={isSyncing}
        />
      )}
      {currentView === 'admin' && (
        <AdminDashboard 
          user={user} 
          showToast={showToastMsg} 
          onConfigUpdate={(newConfig) => {
            if (newConfig.app_name) {
              setAppName(newConfig.app_name);
              document.title = newConfig.app_name;
            }
            if (newConfig.enable_registration !== undefined) {
              setEnableRegistration(newConfig.enable_registration);
            }
          }}
          onBack={() => navigateTo('gameLists')} 
        />
      )}
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

      {/* Global modals */}
      {isSettingsOpen && (
        <SettingsModal 
          user={user} 
          onUserUpdate={(updatedUser) => {
            setUser(updatedUser);
            // Apply theme changes if theme was updated
            if (updatedUser.theme_preference) {
              const root = document.documentElement;
              if (updatedUser.theme_preference === 'light') {
                root.classList.add('light-theme');
              } else if (updatedUser.theme_preference === 'dark') {
                root.classList.remove('light-theme');
              } else {
                const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (systemDark) {
                  root.classList.remove('light-theme');
                } else {
                  root.classList.add('light-theme');
                }
              }
            }
          }}
          onClose={() => setIsSettingsOpen(false)} 
          showToast={showToastMsg} 
        />
      )}
      {isMyProfileOpen && (
        <MyProfileModal user={user} onClose={() => setIsMyProfileOpen(false)} />
      )}

      {toast && (
        <div className={`toast toast-${toast.type}`}>
          <span className="toast-icon">{toast.type === 'success' ? '✅' : '❌'}</span>
          <span className="toast-message">{toast.message}</span>
        </div>
      )}
    </>
  );
}

export default App;
