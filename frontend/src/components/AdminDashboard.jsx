import React, { useState, useEffect, useRef } from 'react';
import { fetchWithAuth, trackFeatureUsage } from '../utils/api';
import NetworkGraph3D from './NetworkGraph3D';
import DatabaseBackupRestore from './admin/DatabaseBackupRestore';
import CronJobMonitor from './admin/CronJobMonitor';
import SystemLogViewer from './admin/SystemLogViewer';
import DatabaseMapsList from './admin/DatabaseMapsList';
import SystemSettingsPanel from './admin/SystemSettingsPanel';
import UserDetailModal from './admin/UserDetailModal';
import CoPlayersPanel from './admin/CoPlayersPanel';
import ShadowActivitiesPanel from './admin/ShadowActivitiesPanel';
import UsersListTable from './admin/UsersListTable';
import RobloxChatViewer from './admin/RobloxChatViewer';

// getRoleBadgeStyle and getRoleDisplayName are now defined locally in the sub-components that need them.

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
const AdminDashboard = ({ user, onBack, showToast, onConfigUpdate }) => {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [presenceFilter, setPresenceFilter] = useState('All');
  const [selectedUser, setSelectedUser] = useState(null);
  const [isRestoring, setIsRestoring] = useState(false);

  // Pagination & Analytics Stats states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [stats, setStats] = useState(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const limitPerPage = 20;

  const loaderRef = useRef(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
    setUsers([]);
  }, [debouncedSearchQuery, roleFilter, presenceFilter]);

  const hasViewUsers = user.role === 'admin' || (user.permissions && user.permissions.includes('view_users_list'));
  const hasViewCoPlayers = user.role === 'admin' || (user.permissions && user.permissions.includes('view_playing_together'));
  const hasViewShadow = user.role === 'admin' || (user.permissions && user.permissions.includes('view_shadow_activities'));
  const hasManagePermissions = user.role === 'admin' || (user.permissions && user.permissions.includes('manage_user_permissions'));
  const hasReviewShadow = user.role === 'admin' || (user.permissions && user.permissions.includes('review_shadow_activities'));

  // Co-Players State
  const [activeView, setActiveView] = useState(() => {
    const cached = localStorage.getItem('adminActiveView');
    if (cached) return cached;
    if (hasViewUsers) return 'users';
    if (hasViewCoPlayers) return 'co-players';
    if (hasViewShadow) return 'shadow';
    return 'users';
  });

  useEffect(() => {
    localStorage.setItem('adminActiveView', activeView);
    
    // Telemetry: Track specific Admin sub-tab changes
    const adminViews = {
      analytics: 'Admin: Ringkasan Analitis 📊',
      users: 'Admin: Daftar Pengguna 👥',
      'network-graph': 'Admin: Visualisasi 3D Jaringan 🌐',
      'co-players': 'Admin: Mabar Co-Players 👥',
      shadow: 'Admin: Deteksi Siluman (Shadow) 👁️',
      cron: 'Admin: Pemantauan Cron Job ⚙️',
      logs: 'Admin: Log Viewer Sistem 🖥️',
      backups: 'Admin: Backup Database 💾',
      'roblox-maps': 'Admin: Pengaturan Map Roblox 🗺️',
      'chat-viewer': 'Admin: Roblox Chat Monitor 💬'
    };
    const name = adminViews[activeView] || `Admin: ${activeView}`;
    trackFeatureUsage(name, 'view');
  }, [activeView]);
  const [coPlayingGroups, setCoPlayingGroups] = useState([]);
  const [isLoadingCoPlayers, setIsLoadingCoPlayers] = useState(false);
  const [coPlaySearchMap, setCoPlaySearchMap] = useState('');
  const [coPlaySearchDate, setCoPlaySearchDate] = useState(() => {
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const localDate = new Date(today.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().substring(0, 10);
  });
  const [coPlaySearchHour, setCoPlaySearchHour] = useState(new Date().getHours());
  const [coPlaySearchResults, setCoPlaySearchResults] = useState(null);
  const [isSearchingCoPlay, setIsSearchingCoPlay] = useState(false);

  // Shadow Activity State
  const [shadowActivities, setShadowActivities] = useState([]);
  const [isLoadingShadow, setIsLoadingShadow] = useState(false);
  const [shadowSearchQuery, setShadowSearchQuery] = useState('');
  const [shadowVisibleCount, setShadowVisibleCount] = useState(6);

  useEffect(() => {
    let active = true;
    if (!hasViewUsers) {
      setIsLoading(false);
      return;
    }
    const fetchUsers = async () => {
      if (currentPage === 1) {
        setIsLoading(true);
      } else {
        setIsFetchingMore(true);
      }
      try {
        const queryParams = new URLSearchParams({
          page: currentPage,
          limit: limitPerPage,
          search: debouncedSearchQuery,
          role: roleFilter,
          presence: presenceFilter
        });
        const res = await fetchWithAuth(`/api/admin/users?${queryParams.toString()}`);
        if (!res.ok) throw new Error('Gagal memuat data pengguna');
        const data = await res.json();
        if (!active) return;

        const fetchedData = Array.isArray(data.data) ? data.data : [];
        setUsers(prev => currentPage === 1 ? fetchedData : [...prev, ...fetchedData]);
        setTotalPages(data.total_pages || 1);
        setTotalItems(data.total_items || 0);
      } catch (err) {
        if (active) showToast(err.message, 'error');
      } finally {
        if (active) {
          setIsLoading(false);
          setIsFetchingMore(false);
        }
      }
    };
    fetchUsers();
    return () => {
      active = false;
    };
  }, [currentPage, debouncedSearchQuery, roleFilter, presenceFilter, hasViewUsers]);

  // Intersection Observer hook for Infinite Scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting) {
          if (currentPage < totalPages && !isLoading && !isFetchingMore) {
            setCurrentPage((prev) => prev + 1);
          }
        }
      },
      { threshold: 0.1 }
    );

    const currentLoader = loaderRef.current;
    if (currentLoader) {
      observer.observe(currentLoader);
    }

    return () => {
      if (currentLoader) {
        observer.unobserve(currentLoader);
      }
    };
  }, [currentPage, totalPages, isLoading, isFetchingMore]);

  const fetchCoPlayers = async () => {
    setIsLoadingCoPlayers(true);
    try {
      const res = await fetchWithAuth('/api/admin/playing-together');
      if (!res.ok) throw new Error('Gagal memuat data Co-Players');
      const data = await res.json();
      setCoPlayingGroups(Array.isArray(data) ? data : []);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsLoadingCoPlayers(false);
    }
  };

  const handleSearchCoPlayers = async () => {
    if (!coPlaySearchMap.trim()) {
      showToast('Harap masukkan nama map/game untuk dicari', 'error');
      return;
    }
    setIsSearchingCoPlay(true);
    try {
      const res = await fetchWithAuth(
        `/api/admin/playing-together/search?map_name=${encodeURIComponent(coPlaySearchMap)}&date=${coPlaySearchDate}&hour=${coPlaySearchHour}`
      );
      if (!res.ok) throw new Error('Gagal mencari riwayat co-players');
      const data = await res.json();
      setCoPlaySearchResults(Array.isArray(data) ? data : []);
      showToast('Pencarian riwayat selesai', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsSearchingCoPlay(false);
    }
  };

  const handleClearCoPlaySearch = () => {
    setCoPlaySearchMap('');
    setCoPlaySearchResults(null);
  };

  const fetchShadowActivities = async () => {
    setIsLoadingShadow(true);
    try {
      const res = await fetchWithAuth('/api/admin/shadow-activities');
      if (!res.ok) throw new Error('Gagal memuat data Shadow Activity');
      const data = await res.json();
      setShadowActivities(Array.isArray(data) ? data : []);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsLoadingShadow(false);
    }
  };

  const handleUpdateShadowActivity = async (id, isReviewed, adminNotes) => {
    try {
      const res = await fetchWithAuth(`/api/admin/shadow-activities/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_reviewed: isReviewed, admin_notes: adminNotes })
      });
      if (!res.ok) throw new Error('Gagal memperbarui log siluman');
      showToast('Berhasil memperbarui catatan siluman', 'success');
      setShadowActivities(prev => prev.map(act => act.id === id ? { ...act, is_reviewed: isReviewed, admin_notes: adminNotes } : act));
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const fetchStats = async () => {
    setIsLoadingStats(true);
    try {
      const res = await fetchWithAuth('/api/admin/stats');
      if (!res.ok) throw new Error('Gagal memuat statistik sistem');
      const data = await res.json();
      setStats(data);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsLoadingStats(false);
    }
  };

  useEffect(() => {
    if (activeView === 'co-players') {
      fetchCoPlayers();
    } else if (activeView === 'shadow') {
      fetchShadowActivities();
    } else if (activeView === 'analytics') {
      fetchCoPlayers();
      fetchShadowActivities();
      fetchStats();
    }
  }, [activeView]);

  useEffect(() => {
    const handleWSMessage = (e) => {
      const data = e.detail;
      if (!data) return;

      const { type, user_id, payload } = data;

      if (type === 'presence_update') {
        if (activeView === 'co-players' || activeView === 'analytics') {
          const silentFetch = async () => {
            try {
              const res = await fetchWithAuth('/api/admin/playing-together');
              if (res.ok) {
                const data = await res.json();
                setCoPlayingGroups(Array.isArray(data) ? data : []);
              }
            } catch (err) {
              console.error('[WS-Refresh] Failed background refresh for Co-Players:', err);
            }
          };
          silentFetch();
        }

        if (activeView === 'users' && user_id && payload) {
          setUsers(prevUsers => 
            prevUsers.map(u => 
              u.id === user_id 
                ? { 
                    ...u, 
                    current_presence: payload.current_presence,
                    current_game_name: payload.current_game_name,
                    current_game_id: payload.current_game_id,
                    current_place_id: payload.current_place_id
                  } 
                : u
            )
          );
        }
      }

      if (type === 'profile_update' && user_id && payload) {
        if (activeView === 'users') {
          setUsers(prevUsers =>
            prevUsers.map(u =>
              u.id === user_id
                ? {
                    ...u,
                    roblox_username: payload.roblox_username,
                    roblox_display_name: payload.roblox_display_name,
                    avatar_url: payload.avatar_url
                  }
                : u
            )
          );
        }
      }
    };
    window.addEventListener('ws-message', handleWSMessage);
    return () => window.removeEventListener('ws-message', handleWSMessage);
  }, [activeView]);

  const handleBackup = async () => {
    try {
      const response = await fetchWithAuth('/api/admin/backup', {
        method: 'GET'
      });

      if (!response.ok) throw new Error('Gagal melakukan backup');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `roblox_tracker_backup_${new Date().toISOString().slice(0, 10)}.sql`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      showToast('Backup berhasil diunduh', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleRestore = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const confirmRestore = await window.customConfirm(
      "PERINGATAN KRITIS:\nMemulihkan database akan menghapus seluruh data aktif saat ini (pengguna, teman pelacakan, log aktivitas, review, dll) dan menggantinya dengan isi file backup.\n\nApakah Anda benar-benar yakin ingin melanjutkan?"
    );
    if (!confirmRestore) {
      event.target.value = '';
      return;
    }

    setIsRestoring(true);
    showToast('Sedang memulihkan basis data, mohon tidak menutup halaman...', 'info');

    try {
      const formData = new FormData();
      formData.append('backup', file);

      const response = await fetchWithAuth('/api/admin/restore', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Gagal memulihkan database');
      }

      showToast('Database berhasil dipulihkan dari backup!', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsRestoring(false);
      event.target.value = '';
    }
  };

  // ─── ADMIN SYSTEM-WIDE ANALYTICS COMPUTATIONS ────────────────────────────────
  const totalUsers = stats?.total_users || 0;
  const registeredUsers = stats?.registered_users || 0;
  const stealthCount = stats?.stealth_count || 0;
  const totalShadows = shadowActivities.length;
  const reviewedShadows = shadowActivities.filter(a => a.is_reviewed).length;
  const pendingShadows = totalShadows - reviewedShadows;

  // Active presence breakdown
  const presenceCounts = stats?.presence_counts || {};

  // Role breakdown
  const roleCounts = stats?.role_counts || {};

  // Roblox Active Game aggregation (Co-Play Groups Only)
  const globalGames = {};
  coPlayingGroups.forEach(g => {
    if (g.game_name) {
      globalGames[g.game_name] = (globalGames[g.game_name] || 0) + (g.players ? g.players.length : 1);
    }
  });
  const globalTopGames = Object.entries(globalGames)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Month-by-month Registration Growth
  const sortedRegs = stats?.growth_counts
    ? Object.entries(stats.growth_counts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
    : [];
  const maxRegVal = Math.max(...sortedRegs.map(r => r[1]), 1);

  return (
    <div className="app-container">
      <div className="admin-header">
        <div className="admin-header-title-container">
          <h1 className="admin-header-title">
            Admin Panel
          </h1>
          <p className="admin-header-subtitle">
            Manajemen Pengguna & Database Sistem
          </p>
        </div>
      </div>

      {/* Sub Navigation Tabs */}
      <div className="admin-tabs">
        {hasViewUsers && (
          <button
            onClick={() => setActiveView('users')}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: '0.5rem',
              border: activeView === 'users' ? '1px solid #3b82f6' : '1px solid transparent',
              background: activeView === 'users' ? 'rgba(59,130,246,0.15)' : 'transparent',
              color: activeView === 'users' ? '#60a5fa' : 'var(--text-muted)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.95rem',
              transition: 'all 0.2s'
            }}
          >
            👥 Daftar Pengguna
          </button>
        )}
        {hasViewCoPlayers && (
          <button
            onClick={() => setActiveView('co-players')}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: '0.5rem',
              border: activeView === 'co-players' ? '1px solid #ef4444' : '1px solid transparent',
              background: activeView === 'co-players' ? 'rgba(239,68,68,0.15)' : 'transparent',
              color: activeView === 'co-players' ? '#f87171' : 'var(--text-muted)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.95rem',
              transition: 'all 0.2s'
            }}
          >
            🎮 Sedang Main Bersama (Co-Players)
          </button>
        )}
        {user.role === 'admin' && (
          <button
            onClick={() => setActiveView('chat-viewer')}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: '0.5rem',
              border: activeView === 'chat-viewer' ? '1px solid #c084fc' : '1px solid transparent',
              background: activeView === 'chat-viewer' ? 'rgba(192,132,252,0.15)' : 'transparent',
              color: activeView === 'chat-viewer' ? '#c084fc' : 'var(--text-muted)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.95rem',
              transition: 'all 0.2s'
            }}
          >
            💬 Roblox Chat Monitor
          </button>
        )}
        {user.role === 'admin' && (
          <button
            onClick={() => setActiveView('cron-monitor')}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: '0.5rem',
              border: activeView === 'cron-monitor' ? '1px solid #14b8a6' : '1px solid transparent',
              background: activeView === 'cron-monitor' ? 'rgba(20,184,166,0.15)' : 'transparent',
              color: activeView === 'cron-monitor' ? '#2dd4bf' : 'var(--text-muted)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.95rem',
              transition: 'all 0.2s'
            }}
          >
            ⚡ Cron Monitor & Rate Limit
          </button>
        )}
        {user.role === 'admin' && (
          <button
            onClick={() => setActiveView('logs')}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: '0.5rem',
              border: activeView === 'logs' ? '1px solid #a855f7' : '1px solid transparent',
              background: activeView === 'logs' ? 'rgba(168,85,247,0.15)' : 'transparent',
              color: activeView === 'logs' ? '#c084fc' : 'var(--text-muted)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.95rem',
              transition: 'all 0.2s'
            }}
          >
            🖥️ Log Cron Sistem
          </button>
        )}
        {hasViewShadow && (
          <button
            onClick={() => setActiveView('shadow')}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: '0.5rem',
              border: activeView === 'shadow' ? '1px solid #f59e0b' : '1px solid transparent',
              background: activeView === 'shadow' ? 'rgba(245,158,11,0.15)' : 'transparent',
              color: activeView === 'shadow' ? '#fbbf24' : 'var(--text-muted)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.95rem',
              transition: 'all 0.2s'
            }}
          >
            🕵️ Deteksi Siluman (Shadow Activity)
          </button>
        )}
        {user.role === 'admin' && (
          <button
            onClick={() => setActiveView('analytics')}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: '0.5rem',
              border: activeView === 'analytics' ? '1px solid #10b981' : '1px solid transparent',
              background: activeView === 'analytics' ? 'rgba(16,185,129,0.15)' : 'transparent',
              color: activeView === 'analytics' ? '#34d399' : 'var(--text-muted)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.95rem',
              transition: 'all 0.2s'
            }}
          >
            📊 Analisis Tren Sistem
          </button>
        )}
        {hasViewUsers && (
          <button
            onClick={() => setActiveView('network-graph')}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: '0.5rem',
              border: activeView === 'network-graph' ? '1px solid #6366f1' : '1px solid transparent',
              background: activeView === 'network-graph' ? 'rgba(99,102,241,0.15)' : 'transparent',
              color: activeView === 'network-graph' ? '#818cf8' : 'var(--text-muted)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.95rem',
              transition: 'all 0.2s'
            }}
          >
            🕸️ Visualisasi Jaringan 3D
          </button>
        )}
        {user.role === 'admin' && (
          <button
            onClick={() => setActiveView('maps')}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: '0.5rem',
              border: activeView === 'maps' ? '1px solid #3b82f6' : '1px solid transparent',
              background: activeView === 'maps' ? 'rgba(59,130,246,0.15)' : 'transparent',
              color: activeView === 'maps' ? '#60a5fa' : 'var(--text-muted)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.95rem',
              transition: 'all 0.2s'
            }}
          >
            🗺️ Database Map
          </button>
        )}
        {user.role === 'admin' && (
          <button
            onClick={() => setActiveView('backup-restore')}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: '0.5rem',
              border: activeView === 'backup-restore' ? '1px solid #10b981' : '1px solid transparent',
              background: activeView === 'backup-restore' ? 'rgba(16,185,129,0.15)' : 'transparent',
              color: activeView === 'backup-restore' ? '#34d399' : 'var(--text-muted)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.95rem',
              transition: 'all 0.2s'
            }}
          >
            💾 Backup & Restore
          </button>
        )}
        {user.role === 'admin' && (
          <button
            onClick={() => setActiveView('system-settings')}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: '0.5rem',
              border: activeView === 'system-settings' ? '1px solid #eab308' : '1px solid transparent',
              background: activeView === 'system-settings' ? 'rgba(234,179,8,0.15)' : 'transparent',
              color: activeView === 'system-settings' ? '#facc15' : 'var(--text-muted)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.95rem',
              transition: 'all 0.2s'
            }}
          >
            ⚙️ System Settings
          </button>
        )}
      </div>

      {activeView === 'users' ? (
        <UsersListTable
          users={users}
          isLoading={isLoading}
          isFetchingMore={isFetchingMore}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          roleFilter={roleFilter}
          setRoleFilter={setRoleFilter}
          presenceFilter={presenceFilter}
          setPresenceFilter={setPresenceFilter}
          totalItems={totalItems}
          currentPage={currentPage}
          totalPages={totalPages}
          loaderRef={loaderRef}
          hasManagePermissions={hasManagePermissions}
          setSelectedUser={setSelectedUser}
          showToast={showToast}
          setUsers={setUsers}
        />
      ) : activeView === 'co-players' ? (
        <CoPlayersPanel
          coPlayingGroups={coPlayingGroups}
          isLoadingCoPlayers={isLoadingCoPlayers}
          coPlaySearchMap={coPlaySearchMap}
          setCoPlaySearchMap={setCoPlaySearchMap}
          coPlaySearchDate={coPlaySearchDate}
          setCoPlaySearchDate={setCoPlaySearchDate}
          coPlaySearchHour={coPlaySearchHour}
          setCoPlaySearchHour={setCoPlaySearchHour}
          coPlaySearchResults={coPlaySearchResults}
          isSearchingCoPlay={isSearchingCoPlay}
          handleSearchCoPlayers={handleSearchCoPlayers}
          handleClearCoPlaySearch={handleClearCoPlaySearch}
        />
      ) : activeView === 'shadow' ? (
        <ShadowActivitiesPanel
          shadowActivities={shadowActivities}
          isLoadingShadow={isLoadingShadow}
          shadowSearchQuery={shadowSearchQuery}
          setShadowSearchQuery={setShadowSearchQuery}
          shadowVisibleCount={shadowVisibleCount}
          setShadowVisibleCount={setShadowVisibleCount}
          hasReviewShadow={hasReviewShadow}
          handleUpdateShadowActivity={handleUpdateShadowActivity}
        />
      ) : activeView === 'analytics' ? (
        // Global System Analytics View
        <div>
          {/* Top Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '1.25rem', borderRadius: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Total Pengguna Terdaftar</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#60a5fa' }}>{registeredUsers} / {totalUsers}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{totalUsers - registeredUsers} akun tamu terdeteksi</div>
            </div>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '1.25rem', borderRadius: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Mode Siluman Aktif</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f87171' }}>{stealthCount} Pengguna</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{Math.round((stealthCount / (totalUsers || 1)) * 100)}% dari total pengguna</div>
            </div>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '1.25rem', borderRadius: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Kasus Siluman (Shadow)</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#fbbf24' }}>{pendingShadows} Pending</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{reviewedShadows} kasus telah ditinjau</div>
            </div>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '1.25rem', borderRadius: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Kehadiran Aktif Saat Ini</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#34d399' }}>
                {presenceCounts['In-Game'] || 0} Bermain
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                {presenceCounts['Online'] || 0} Online · {presenceCounts['In-Studio'] || 0} Studio
              </div>
            </div>
          </div>

          {/* Core Analytics charts grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>

            {/* Top Games in System */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '1.5rem', borderRadius: '1rem' }}>
              <h4 style={{ margin: '0 0 1.25rem 0', fontSize: '1rem', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🎮 Game Paling Populer Aktif (Sistem)
              </h4>
              {globalTopGames.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem 0', fontSize: '0.9rem' }}>Belum ada pengguna bermain game aktif.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {globalTopGames.map(([game, weight], idx) => {
                    const percentage = Math.round((weight / globalTopGames[0][1]) * 100);
                    return (
                      <div key={game}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                          <span style={{ fontWeight: 600, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '80%' }}>
                            {idx + 1}. {game}
                          </span>
                          <span style={{ color: '#a78bfa', fontWeight: 'bold' }}>{weight} pemain/sesi</span>
                        </div>
                        <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${percentage}%`,
                              background: 'linear-gradient(to right, #6366f1, #a855f7)',
                              borderRadius: '4px',
                              boxShadow: '0 0 8px rgba(168, 85, 247, 0.4)'
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* User Role Distribution */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '1.5rem', borderRadius: '1rem' }}>
              <h4 style={{ margin: '0 0 1.25rem 0', fontSize: '1rem', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                👥 Distribusi Peran Pengguna (Role)
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {Object.entries(roleCounts).map(([role, count]) => {
                  const totalRoles = Object.values(roleCounts).reduce((a, b) => a + b, 0);
                  const percentage = Math.round((count / totalRoles) * 100);
                  return (
                    <div key={role}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                        <span style={{ color: '#e2e8f0', fontWeight: 600, textTransform: 'capitalize' }}>{role}</span>
                        <span style={{ color: '#60a5fa', fontWeight: 'bold' }}>{percentage}% ({count})</span>
                      </div>
                      <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${percentage}%`,
                            background: 'linear-gradient(to right, #3b82f6, #60a5fa)',
                            borderRadius: '4px',
                            boxShadow: '0 0 8px rgba(59, 130, 246, 0.4)'
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Third Row: System growth timeline */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
            {/* Registration Growth Graph */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '1.5rem', borderRadius: '1rem' }}>
              <h4 style={{ margin: '0 0 1.25rem 0', fontSize: '1rem', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem' }}>
                📈 Tren Pendaftaran Pengguna Baru
              </h4>
              {sortedRegs.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem 0', fontSize: '0.9rem' }}>Belum ada data pendaftaran terdaftar.</div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: '140px', padding: '0 1rem 0.5rem 1rem' }}>
                  {sortedRegs.map(([month, count]) => {
                    const percentage = Math.round((count / maxRegVal) * 80) + 10;
                    return (
                      <div key={month} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                        <div style={{ fontSize: '0.75rem', color: '#34d399', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                          +{count}
                        </div>
                        <div
                          style={{
                            width: '28px',
                            height: `${percentage}px`,
                            background: 'linear-gradient(to top, #10b981, #34d399)',
                            borderRadius: '4px 4px 0 0',
                            boxShadow: '0 0 10px rgba(16, 185, 129, 0.3)',
                            transition: 'height 0.5s ease-out',
                            cursor: 'pointer'
                          }}
                          title={`Registrasi baru: ${count}`}
                        />
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem', fontWeight: 600 }}>
                          {month.substring(5)}/{month.substring(2, 4)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Audit Keamanan: Shadow activities segment bar */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '1.5rem', borderRadius: '1rem' }}>
              <h4 style={{ margin: '0 0 1.25rem 0', fontSize: '1rem', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem' }}>
                🛡️ Status Audit Deteksi Siluman (Shadow Activity)
              </h4>
              {totalShadows === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem 0', fontSize: '0.9rem' }}>Aman! Tidak ada aktivitas siluman terdeteksi.</div>
              ) : (
                <div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Total Kejadian Terdeteksi:</span>
                    <strong style={{ color: '#fff' }}>{totalShadows} insiden</strong>
                  </div>

                  {/* Segmented bar */}
                  <div style={{ display: 'flex', height: '24px', borderRadius: '8px', overflow: 'hidden', marginBottom: '1.25rem', background: 'rgba(255,255,255,0.05)' }}>
                    {pendingShadows > 0 && (
                      <div
                        style={{
                          width: `${(pendingShadows / totalShadows) * 100}%`,
                          background: 'linear-gradient(to right, #fbbf24, #f59e0b)',
                          height: '100%'
                        }}
                        title={`Kasus Baru: ${pendingShadows}`}
                      />
                    )}
                    {reviewedShadows > 0 && (
                      <div
                        style={{
                          width: `${(reviewedShadows / totalShadows) * 100}%`,
                          background: 'linear-gradient(to right, #10b981, #34d399)',
                          height: '100%'
                        }}
                        title={`Ditinjau: ${reviewedShadows}`}
                      />
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fbbf24' }} />
                      <strong style={{ color: '#fbbf24' }}>{Math.round((pendingShadows / totalShadows) * 100)}%</strong> ⏳ Pending / Kasus Baru ({pendingShadows} insiden)
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
                      <strong style={{ color: '#10b981' }}>{Math.round((reviewedShadows / totalShadows) * 100)}%</strong> ✅ Selesai / Ditinjau ({reviewedShadows} insiden)
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : activeView === 'network-graph' ? (
        <NetworkGraph3D showToast={showToast} />
      ) : activeView === 'logs' ? (
        <SystemLogViewer showToast={showToast} />
      ) : activeView === 'cron-monitor' ? (
        <CronJobMonitor showToast={showToast} />
      ) : activeView === 'backup-restore' ? (
        <DatabaseBackupRestore
          showToast={showToast}
          handleBackup={handleBackup}
          handleRestore={handleRestore}
          isRestoring={isRestoring}
        />
      ) : activeView === 'chat-viewer' ? (
        <RobloxChatViewer showToast={showToast} />
      ) : activeView === 'maps' ? (
        <DatabaseMapsList showToast={showToast} />
      ) : activeView === 'system-settings' ? (
        <SystemSettingsPanel showToast={showToast} onConfigUpdate={onConfigUpdate} />
      ) : null}

      {selectedUser && (
        <UserDetailModal
          selectedUser={selectedUser}
          onClose={() => setSelectedUser(null)}
          showToast={showToast}
          onUserDeleted={() => {
            setUsers(prev => prev.filter(usr => usr.id !== selectedUser.id));
          }}
        />
      )}
    </div>
  );
};

// SystemSettingsPanel is now imported from './admin/SystemSettingsPanel'

export default AdminDashboard;
