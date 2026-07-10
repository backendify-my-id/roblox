import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../../utils/api';

const getRoleBadgeStyle = (roleName) => {
  switch (roleName?.toLowerCase()) {
    case 'admin':
      return { background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)' };
    case 'co-player':
      return { background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.3)' };
    case 'user':
      return { background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)' };
    default:
      return { background: 'rgba(255, 255, 255, 0.05)', color: '#94a3b8', border: '1px solid rgba(255, 255, 255, 0.1)' };
  }
};

const getRoleDisplayName = (roleName) => {
  switch (roleName?.toLowerCase()) {
    case 'admin': return 'Administrator';
    case 'co-player': return 'Co-Player';
    case 'user': return 'User';
    default: return roleName || 'Synced Friend';
  }
};

/**
 * GameHistoryTab Component
 * Displays history searches and lists play times for specific games/maps.
 */
const GameHistoryTab = ({ userId, showToast }) => {
  const [mapName, setMapName] = useState('');
  const [historyLogs, setHistoryLogs] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!mapName.trim()) {
      showToast('Harap masukkan nama map/game untuk dicari', 'error');
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetchWithAuth(`/api/admin/users/${userId}/game-history?map_name=${encodeURIComponent(mapName)}`);
      if (!res.ok) throw new Error('Gagal memuat riwayat bermain game');
      const data = await res.json();
      setHistoryLogs(Array.isArray(data) ? data : []);
      setHasSearched(true);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '0.5rem' }}>
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <div className="search-container" style={{ flex: 1, margin: 0, position: 'relative' }}>
          <span className="search-icon" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>🎮</span>
          <input
            type="text"
            placeholder="Masukkan nama map / game..."
            value={mapName}
            onChange={(e) => setMapName(e.target.value)}
            style={{
              width: '100%',
              padding: '0.6rem 1rem 0.6rem 2.5rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              color: '#fff',
              fontSize: '0.95rem',
              outline: 'none',
              transition: 'border-color 0.2s'
            }}
            onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
            onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
          />
        </div>
        <button
          type="submit"
          disabled={isSearching}
          style={{
            background: 'linear-gradient(to right, #3b82f6, #60a5fa)',
            color: '#fff',
            border: 'none',
            padding: '0.6rem 1.5rem',
            borderRadius: '0.5rem',
            cursor: isSearching ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            transition: 'all 0.2s',
            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.2)'
          }}
          onMouseEnter={(e) => {
            if (!isSearching) {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(59, 130, 246, 0.3)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.2)';
          }}
        >
          {isSearching ? 'Mencari...' : 'Cari Riwayat'}
        </button>
      </form>

      {isSearching ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
          ⏳ Mencari data riwayat bermain...
        </div>
      ) : !hasSearched ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.01)', borderRadius: '0.75rem', border: '1px dashed var(--border)' }}>
          🔍 Masukkan nama map di atas untuk mencari riwayat bermain pengguna ini.
        </div>
      ) : historyLogs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.01)', borderRadius: '0.75rem', border: '1px solid var(--border)' }}>
          📭 Tidak ada riwayat bermain map "<strong>{mapName}</strong>" untuk pengguna ini.
        </div>
      ) : (
        <div className="table-responsive" style={{ background: 'var(--bg-card)', borderRadius: '0.75rem', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                <th style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem' }}>No</th>
                <th style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem' }}>Nama Map/Game</th>
                <th style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem' }}>Waktu Mulai</th>
                <th style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem' }}>Waktu Selesai</th>
                <th style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem' }}>Durasi Bermain</th>
              </tr>
            </thead>
            <tbody>
              {historyLogs.map((log, idx) => (
                <tr key={log.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{idx + 1}</td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', fontWeight: 600, color: '#a78bfa' }}>{log.game_name}</td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {new Date(log.start_time).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {log.end_time ? new Date(log.end_time).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>
                    <span style={{
                      padding: '0.2rem 0.5rem',
                      borderRadius: '0.25rem',
                      fontSize: '0.8rem',
                      background: log.duration === 'Sedang bermain...' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                      color: log.duration === 'Sedang bermain...' ? '#fbbf24' : '#4ade80',
                      border: log.duration === 'Sedang bermain...' ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(34, 197, 94, 0.3)'
                    }}>
                      {log.duration}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/**
 * UserDetailModal Component
 * Displays user overview, detailed raw activity logs, profile history, and graphs.
 */
const UserDetailModal = ({ selectedUser, onClose, showToast, onUserDeleted }) => {
  const [activeTab, setActiveTab] = useState('activity');
  const [activityLogs, setActivityLogs] = useState([]);
  const [profileLogs, setProfileLogs] = useState([]);
  const [friendsList, setFriendsList] = useState([]);
  const [trackersList, setTrackersList] = useState([]);

  const [activityOffset, setActivityOffset] = useState(0);
  const [profileOffset, setProfileOffset] = useState(0);
  const [friendsOffset, setFriendsOffset] = useState(0);

  const [hasMoreActivity, setHasMoreActivity] = useState(true);
  const [hasMoreProfile, setHasMoreProfile] = useState(true);
  const [hasMoreFriends, setHasMoreFriends] = useState(true);

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [isEditingAdminNote, setIsEditingAdminNote] = useState(false);
  const [adminNote, setAdminNote] = useState(selectedUser.admin_note || '');

  const handleSaveAdminNote = async () => {
    try {
      const res = await fetchWithAuth(`/api/admin/users/${selectedUser.id}/note`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_note: adminNote })
      });
      if (!res.ok) throw new Error('Gagal menyimpan Admin Note');
      setIsEditingAdminNote(false);
      if (showToast) showToast('Admin Note tersimpan', 'success');
      selectedUser.admin_note = adminNote;
    } catch (err) {
      console.error(err);
      if (showToast) showToast(err.message, 'error');
    }
  };

  const sixDaysAgo = new Date();
  sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
  sixDaysAgo.setHours(0, 0, 0, 0);

  const filteredLogs = activityLogs.filter(log => new Date(log.created_at) >= sixDaysAgo);
  const totalUserLogs = filteredLogs.length;

  const userStatusCounts = filteredLogs.reduce((acc, log) => {
    acc[log.status] = (acc[log.status] || 0) + 1;
    return acc;
  }, {});

  const userGameCounts = filteredLogs.reduce((acc, log) => {
    if (log.status === 'In-Game') {
      const gameName = (log.map && log.map.name) ? log.map.name : log.game_name;
      if (gameName) {
        acc[gameName] = (acc[gameName] || 0) + 1;
      }
    }
    return acc;
  }, {});
  const userTopGames = Object.entries(userGameCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const userHourBlocks = {
    'Dini Hari (00:00 - 06:00)': 0,
    'Pagi (06:00 - 12:00)': 0,
    'Siang (12:00 - 18:00)': 0,
    'Malam (18:00 - 00:00)': 0,
  };
  const userHourlyRaw = Array(24).fill(0);

  filteredLogs.forEach(log => {
    const hour = new Date(log.created_at).getHours();
    userHourlyRaw[hour]++;
    if (hour >= 0 && hour < 6) userHourBlocks['Dini Hari (00:00 - 06:00)']++;
    else if (hour >= 6 && hour < 12) userHourBlocks['Pagi (06:00 - 12:00)']++;
    else if (hour >= 12 && hour < 18) userHourBlocks['Siang (12:00 - 18:00)']++;
    else userHourBlocks['Malam (18:00 - 00:00)']++;
  });

  const userMaxHourVal = Math.max(...userHourlyRaw);
  const userPeakHour = userMaxHourVal > 0 ? userHourlyRaw.indexOf(userMaxHourVal) : null;

  const userDaysOfWeek = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const userDayCounts = Array(7).fill(0);
  filteredLogs.forEach(log => {
    const day = new Date(log.created_at).getDay();
    userDayCounts[day]++;
  });
  const userMaxDayVal = Math.max(...userDayCounts);

  const todayIndex = new Date().getDay();
  const orderedIndices = [];
  for (let i = 1; i <= 7; i++) {
    orderedIndices.push((todayIndex + i) % 7);
  }

  const userDayPlayMinutes = Array(7).fill(0);

  const addPlayDuration = (start, end, maxMinutes = 180) => {
    const diffMs = end - start;
    const diffMins = Math.round(diffMs / 60000);
    const finalMins = Math.min(diffMins, maxMinutes);
    if (finalMins <= 0) return;

    let adjustedEnd = end;
    if (diffMins > finalMins) {
      adjustedEnd = new Date(start.getTime() + finalMins * 60000);
    }

    let temp = new Date(start.getTime());
    while (temp < adjustedEnd) {
      const nextMidnight = new Date(temp);
      nextMidnight.setHours(24, 0, 0, 0);

      const limit = nextMidnight < adjustedEnd ? nextMidnight : adjustedEnd;
      const mins = Math.round((limit - temp) / 60000);
      if (mins > 0) {
        userDayPlayMinutes[temp.getDay()] += mins;
      }
      temp = nextMidnight;
    }
  };

  const cronLogs = [...filteredLogs].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  let currentInGameStart = null;
  for (let i = 0; i < cronLogs.length; i++) {
    const log = cronLogs[i];
    if (log.status === 'In-Game') {
      if (currentInGameStart === null) {
        currentInGameStart = new Date(log.created_at);
      }
    } else {
      if (currentInGameStart !== null) {
        addPlayDuration(currentInGameStart, new Date(log.created_at));
        currentInGameStart = null;
      }
    }
  }
  if (currentInGameStart !== null) {
    addPlayDuration(currentInGameStart, new Date());
  }
  const userMaxDurationVal = Math.max(...userDayPlayMinutes);

  const fetchInitialData = async () => {
    setIsLoading(true);
    try {
      const [actRes, profRes, friendsRes, trackersRes] = await Promise.all([
        fetchWithAuth(`/api/admin/users/${selectedUser.id}/logs?offset=0&limit=1000`),
        fetchWithAuth(`/api/admin/users/${selectedUser.id}/profile-changes?offset=0`),
        fetchWithAuth(`/api/admin/users/${selectedUser.id}/friends?offset=0`),
        fetchWithAuth(`/api/admin/users/${selectedUser.id}/tracked-by`)
      ]);

      if (actRes.ok) {
        const d = await actRes.json();
        const logs = Array.isArray(d) ? d : [];
        if (logs.length < 1000) setHasMoreActivity(false);
        setActivityLogs(logs);
      }

      if (profRes.ok) {
        const d = await profRes.json();
        const logs = Array.isArray(d) ? d : [];
        if (logs.length < 100) setHasMoreProfile(false);
        setProfileLogs(logs);
      }

      if (friendsRes.ok) {
        const d = await friendsRes.json();
        const flist = Array.isArray(d) ? d : [];
        if (flist.length < 100) setHasMoreFriends(false);
        setFriendsList(flist);
      }

      if (trackersRes.ok) {
        const d = await trackersRes.json();
        setTrackersList(Array.isArray(d) ? d : []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, [selectedUser.id]);

  const handleLoadMoreActivity = async () => {
    setIsLoadingMore(true);
    const newOffset = activityOffset + 1000;
    try {
      const res = await fetchWithAuth(`/api/admin/users/${selectedUser.id}/logs?offset=${newOffset}&limit=1000`);
      if (res.ok) {
        const d = await res.json();
        const logs = Array.isArray(d) ? d : [];
        if (logs.length < 1000) setHasMoreActivity(false);
        setActivityLogs(prev => [...prev, ...logs]);
        setActivityOffset(newOffset);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleLoadMoreProfile = async () => {
    setIsLoadingMore(true);
    const newOffset = profileOffset + 100;
    try {
      const res = await fetchWithAuth(`/api/admin/users/${selectedUser.id}/profile-changes?offset=${newOffset}`);
      if (res.ok) {
        const d = await res.json();
        const logs = Array.isArray(d) ? d : [];
        if (logs.length < 100) setHasMoreProfile(false);
        setProfileLogs(prev => [...prev, ...logs]);
        setProfileOffset(newOffset);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleLoadMoreFriends = async () => {
    setIsLoadingMore(true);
    const newOffset = friendsOffset + 100;
    try {
      const res = await fetchWithAuth(`/api/admin/users/${selectedUser.id}/friends?offset=${newOffset}`);
      if (res.ok) {
        const d = await res.json();
        const flist = Array.isArray(d) ? d : [];
        if (flist.length < 100) setHasMoreFriends(false);
        setFriendsList(prev => [...prev, ...flist]);
        setFriendsOffset(newOffset);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const tabs = [
    { key: 'activity', label: `📋 Activity Log` },
    { key: 'gameHistory', label: `🎮 Riwayat Map` },
    { key: 'analytics', label: `📊 Analisis Tren` },
    { key: 'profile', label: `🔄 Perubahan Profil` },
    { key: 'friends', label: `👥 Teman (${selectedUser.friends_count || 0})` },
    { key: 'trackers', label: `👁️ Dilacak Oleh (${trackersList.length})` },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-content-large" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {selectedUser.avatar_url ? (
              <img src={selectedUser.avatar_url} alt="" style={{ width: 48, height: 48, borderRadius: '50%', border: '2px solid #3b82f6' }} />
            ) : (
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#334155' }} />
            )}
            <div>
              <h2 style={{ fontSize: '1.3rem', margin: 0 }}>{selectedUser.roblox_display_name || selectedUser.roblox_username}</h2>
              <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.85rem' }}>@{selectedUser.roblox_username} · ID: <a href={`https://www.roblox.com/users/${selectedUser.roblox_user_id}/profile`} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.currentTarget.style.textDecoration = 'underline'} onMouseOut={e => e.currentTarget.style.textDecoration = 'none'}>{selectedUser.roblox_user_id}</a></p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {selectedUser.is_registered && selectedUser.role_name !== 'admin' && (
              <button
                onClick={async () => {
                  if (await window.customConfirm(`Apakah Anda yakin ingin menghapus akun @${selectedUser.roblox_username}? Akun ini akan didegradasi menjadi profil terlacak biasa (tidak ada role dan tidak dapat login lagi).`)) {
                    try {
                      const res = await fetchWithAuth(`/api/admin/users/${selectedUser.id}`, {
                        method: 'DELETE'
                      });
                      if (!res.ok) {
                        const errData = await res.json();
                        throw new Error(errData.error || 'Gagal menghapus pengguna');
                      }
                      if (showToast) showToast('Akun pengguna berhasil dihapus (didegradasi)', 'success');
                      if (onUserDeleted) onUserDeleted();
                      onClose();
                    } catch (err) {
                      if (showToast) showToast(err.message, 'error');
                    }
                  }
                }}
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: '#f87171',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '0.35rem',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  transition: 'all 0.2s',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
                onMouseOver={e => {
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                }}
              >
                🗑️ Hapus Akun
              </button>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
          </div>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1.25rem', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 'bold' }}>⭐ Admin Note:</span>
            <button
              onClick={() => isEditingAdminNote ? handleSaveAdminNote() : setIsEditingAdminNote(true)}
              style={{ background: 'none', border: 'none', color: isEditingAdminNote ? '#22c55e' : '#3b82f6', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}
            >
              {isEditingAdminNote ? 'Simpan' : 'Edit'}
            </button>
          </div>
          {isEditingAdminNote ? (
            <textarea
              value={adminNote}
              onChange={e => setAdminNote(e.target.value)}
              placeholder="Catatan rahasia khusus admin..."
              style={{ width: '100%', minHeight: '60px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '0.25rem', color: '#fff', padding: '0.5rem', fontSize: '0.85rem', resize: 'vertical' }}
            />
          ) : (
            <div style={{ fontSize: '0.85rem', color: adminNote ? '#fff' : 'var(--text-muted)', fontStyle: adminNote ? 'normal' : 'italic' }}>
              {adminNote || 'Belum ada catatan admin.'}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="modal-tabs">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="modal-tab-btn"
              style={{
                border: activeTab === tab.key ? '1px solid #3b82f6' : '1px solid transparent',
                background: activeTab === tab.key ? 'rgba(59,130,246,0.15)' : 'transparent',
                color: activeTab === tab.key ? '#60a5fa' : 'var(--text-muted)',
                fontWeight: activeTab === tab.key ? 600 : 400,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Memuat data...</div>
          ) : activeTab === 'activity' ? (
            activityLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Belum ada riwayat aktivitas.</div>
            ) : (
              <>
                <div className="table-responsive">
                  <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #334155', textAlign: 'left' }}>
                        <th style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Waktu</th>
                        <th style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Status</th>
                        <th style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Game / Keterangan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activityLogs.map(log => (
                        <tr key={log.id} style={{ borderBottom: '1px solid #334155' }}>
                          <td style={{ padding: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{new Date(log.created_at).toLocaleString('en-GB')}</td>
                          <td style={{ padding: '0.5rem' }}>
                            <span style={{
                              color: log.status === 'In-Game' ? '#a78bfa' :
                                log.status === 'Online' ? '#22c55e' :
                                  log.status === 'Removed' ? '#ef4444' :
                                    (log.status === 'First Added' || log.status === 'Added Again') ? '#60a5fa' : 'var(--text-muted)'
                            }}>
                              {log.status}
                            </span>
                          </td>
                          <td style={{ padding: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            {log.game_name && log.game_name !== '-' ? log.game_name :
                              (log.status === 'First Added' || log.status === 'Added Again' || log.status === 'Removed') && log.owner ?
                                `oleh @${log.owner.roblox_username}` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {hasMoreActivity && (
                  <div style={{ textAlign: 'center', marginTop: '1rem', paddingBottom: '0.5rem' }}>
                    <button
                      onClick={handleLoadMoreActivity}
                      disabled={isLoadingMore}
                      style={{
                        background: '#334155', color: '#fff', border: 'none',
                        padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: isLoadingMore ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {isLoadingMore ? 'Memuat...' : 'Muat Lebih Banyak'}
                    </button>
                  </div>
                )}
              </>
            )
          ) : activeTab === 'analytics' ? (
            filteredLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Belum ada data aktivitas dalam 7 hari terakhir untuk dianalisis.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingRight: '0.5rem' }}>
                {/* Metrik Ringkasan */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Jam Teraktif Bermain</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#fbbf24', marginTop: '0.25rem' }}>
                      {userPeakHour !== null ? `${String(userPeakHour).padStart(2, '0')}:00 - ${String((userPeakHour + 1) % 24).padStart(2, '0')}:00` : '-'}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Game Paling Sering Dimainkan</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#a78bfa', marginTop: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {userTopGames[0] ? userTopGames[0][0] : '-'}
                    </div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Sampel Log</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#60a5fa', marginTop: '0.25rem' }}>
                      {totalUserLogs} Log
                    </div>
                  </div>
                </div>

                {/* Game Terpopuler */}
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', color: '#fff' }}>🎮 Game Terfavorit Pengguna</h4>
                  {userTopGames.length === 0 ? (
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Belum ada log game dimainkan.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {userTopGames.map(([game, count], idx) => {
                        const pct = Math.round((count / userTopGames[0][1]) * 100);
                        return (
                          <div key={game}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                              <span>{idx + 1}. {game}</span>
                              <span style={{ color: '#a855f7', fontWeight: 'bold' }}>{count} kali terdeteksi</span>
                            </div>
                            <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(to right, #a855f7, #c084fc)', borderRadius: '3px' }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Pembagian Waktu Bermain */}
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', color: '#fff' }}>⏰ Distribusi Waktu Aktivitas</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {Object.entries(userHourBlocks).map(([block, count]) => {
                      const totalBlock = Object.values(userHourBlocks).reduce((a, b) => a + b, 0);
                      const pct = totalBlock > 0 ? Math.round((count / totalBlock) * 100) : 0;
                      return (
                        <div key={block}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                            <span>{block}</span>
                            <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>{pct}% ({count})</span>
                          </div>
                          <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(to right, #f59e0b, #fbbf24)', borderRadius: '3px' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Hari Paling Aktif */}
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <h4 style={{ margin: '0 0 1.25rem 0', fontSize: '0.95rem', color: '#fff' }}>📅 Aktivitas Mingguan (Hari Ini Paling Kanan)</h4>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: '120px', padding: '0 0.5rem' }}>
                    {orderedIndices.map(dayIdx => {
                      const count = userDayCounts[dayIdx];
                      const pct = userMaxDayVal > 0 ? Math.round((count / userMaxDayVal) * 80) + 10 : 10;
                      const isToday = dayIdx === todayIndex;
                      return (
                        <div key={dayIdx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                          <div style={{ fontSize: '0.7rem', color: isToday ? '#a78bfa' : '#60a5fa', fontWeight: 'bold', marginBottom: '0.25rem', transition: 'all 0.2s' }}>
                            {count}
                          </div>
                          <div
                            style={{
                              width: '24px',
                              height: `${pct}px`,
                              background: isToday ? 'linear-gradient(to top, #7c3aed, #a78bfa)' : 'linear-gradient(to top, #1d4ed8, #60a5fa)',
                              borderRadius: '4px 4px 0 0',
                              transition: 'all 0.2s ease-in-out',
                              cursor: 'pointer',
                              boxShadow: isToday ? '0 0 10px rgba(167, 139, 250, 0.4)' : '0 0 8px rgba(96, 165, 250, 0.2)'
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.transform = 'scaleY(1.15) translateY(-5px)';
                              e.currentTarget.style.boxShadow = isToday ? '0 0 18px rgba(167, 139, 250, 0.8)' : '0 0 15px rgba(96, 165, 250, 0.6)';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.transform = 'scaleY(1) translateY(0px)';
                              e.currentTarget.style.boxShadow = isToday ? '0 0 10px rgba(167, 139, 250, 0.4)' : '0 0 8px rgba(96, 165, 250, 0.2)';
                            }}
                          />
                          <div style={{ fontSize: '0.6rem', color: isToday ? '#c084fc' : 'var(--text-muted)', fontWeight: isToday ? 'bold' : 'normal', marginTop: '0.35rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {userDaysOfWeek[dayIdx].substring(0, 3)} {isToday && '🌟'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Durasi Bermain Mingguan */}
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <h4 style={{ margin: '0 0 1.25rem 0', fontSize: '0.95rem', color: '#fff' }}>🎮 Durasi Bermain Mingguan (Menit - Hari Ini Paling Kanan)</h4>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: '120px', padding: '0 0.5rem' }}>
                    {orderedIndices.map(dayIdx => {
                      const count = userDayPlayMinutes[dayIdx];
                      const pct = userMaxDurationVal > 0 ? Math.round((count / userMaxDurationVal) * 80) + 10 : 10;
                      const isToday = dayIdx === todayIndex;
                      return (
                        <div key={dayIdx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                          <div style={{ fontSize: '0.7rem', color: isToday ? '#fbbf24' : '#34d399', fontWeight: 'bold', marginBottom: '0.25rem', transition: 'all 0.2s' }}>
                            {count}m
                          </div>
                          <div
                            style={{
                              width: '24px',
                              height: `${pct}px`,
                              background: isToday ? 'linear-gradient(to top, #d97706, #fbbf24)' : 'linear-gradient(to top, #047857, #34d399)',
                              borderRadius: '4px 4px 0 0',
                              transition: 'all 0.2s ease-in-out',
                              cursor: 'pointer',
                              boxShadow: isToday ? '0 0 10px rgba(251, 191, 36, 0.4)' : '0 0 8px rgba(52, 211, 153, 0.2)'
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.transform = 'scaleY(1.15) translateY(-5px)';
                              e.currentTarget.style.boxShadow = isToday ? '0 0 18px rgba(251, 191, 36, 0.8)' : '0 0 15px rgba(52, 211, 153, 0.6)';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.transform = 'scaleY(1) translateY(0px)';
                              e.currentTarget.style.boxShadow = isToday ? '0 0 10px rgba(251, 191, 36, 0.4)' : '0 0 8px rgba(52, 211, 153, 0.2)';
                            }}
                          />
                          <div style={{ fontSize: '0.6rem', color: isToday ? '#fcd34d' : 'var(--text-muted)', fontWeight: isToday ? 'bold' : 'normal', marginTop: '0.35rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {userDaysOfWeek[dayIdx].substring(0, 3)} {isToday && '🌟'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Status Presence Distribution */}
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '1rem' }}>
                  <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', color: '#fff' }}>🛡️ Proporsi Status Kehadiran</h4>
                  <div style={{ display: 'flex', height: '16px', borderRadius: '4px', overflow: 'hidden', background: 'rgba(255,255,255,0.05)', marginBottom: '0.75rem' }}>
                    {Object.entries(userStatusCounts).map(([status, count]) => {
                      const pct = Math.round((count / totalUserLogs) * 100);
                      if (count === 0) return null;
                      const color = status === 'In-Game' ? '#8b5cf6' : status === 'Online' ? '#10b981' : status === 'Offline' ? '#6b7280' : '#3b82f6';
                      return (
                        <div key={status} style={{ width: `${pct}%`, background: color, height: '100%' }} title={`${status}: ${count} (${pct}%)`} />
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                    {Object.entries(userStatusCounts).map(([status, count]) => {
                      const pct = Math.round((count / totalUserLogs) * 100);
                      const color = status === 'In-Game' ? '#8b5cf6' : status === 'Online' ? '#10b981' : status === 'Offline' ? '#6b7280' : '#3b82f6';
                      return (
                        <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
                          <span style={{ color: 'var(--text-muted)' }}>{status}:</span>
                          <strong style={{ color: '#fff' }}>{pct}% ({count})</strong>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )
          ) : activeTab === 'profile' ? (
            profileLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Belum ada riwayat perubahan profil.</div>
            ) : (
              <>
                <div className="table-responsive">
                  <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #334155', textAlign: 'left' }}>
                        <th style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Waktu</th>
                        <th style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Perubahan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profileLogs.map(log => (
                        <tr key={log.id} style={{ borderBottom: '1px solid #334155' }}>
                          <td style={{ padding: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)', verticalAlign: 'top' }}>
                            {new Date(log.created_at).toLocaleString('id-ID')}
                          </td>
                          <td style={{ padding: '0.5rem' }}>
                            <strong>{log.change_type.toUpperCase()}:</strong><br />
                            {log.change_type === 'avatar' ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                                <div style={{ textAlign: 'center' }}>
                                  <img src={log.old_value} alt="Old" style={{ width: 48, height: 48, borderRadius: '50%', border: '2px solid #ef4444', opacity: 0.6 }} />
                                  <div style={{ color: '#ef4444', fontSize: '0.7rem' }}>Lama</div>
                                </div>
                                <span style={{ color: 'var(--text-muted)' }}>→</span>
                                <div style={{ textAlign: 'center' }}>
                                  <img src={log.new_value} alt="New" style={{ width: 48, height: 48, borderRadius: '50%', border: '2px solid #22c55e' }} />
                                  <div style={{ color: '#22c55e', fontSize: '0.7rem' }}>Baru</div>
                                </div>
                              </div>
                            ) : (
                              <>
                                <span style={{ color: '#ef4444', textDecoration: 'line-through' }}>{log.old_value}</span><br />
                                <span style={{ color: '#22c55e' }}>{log.new_value}</span>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {hasMoreProfile && (
                  <div style={{ textAlign: 'center', marginTop: '1rem', paddingBottom: '0.5rem' }}>
                    <button
                      onClick={handleLoadMoreProfile}
                      disabled={isLoadingMore}
                      style={{
                        background: '#334155', color: '#fff', border: 'none',
                        padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: isLoadingMore ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {isLoadingMore ? 'Memuat...' : 'Muat Lebih Banyak'}
                    </button>
                  </div>
                )}
              </>
            )
          ) : activeTab === 'friends' ? (
            friendsList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Belum ada teman yang ditambahkan.</div>
            ) : (
              <>
                <div className="table-responsive">
                  <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #334155', textAlign: 'left' }}>
                         <th style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Profil</th>
                         <th style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Kehadiran</th>
                         <th style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Status Lacak</th>
                         <th style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Waktu Ditambahkan</th>
                         <th style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Waktu Dihapus</th>
                         <th style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Note User</th>
                       </tr>
                     </thead>
                     <tbody>
                       {friendsList.map(f => (
                         <tr key={f.id} style={{ borderBottom: '1px solid #334155' }}>
                           <td style={{ padding: '0.5rem' }}>
                             <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                               <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                 {f.avatar_url ? (
                                   <img src={f.avatar_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%' }} />
                                 ) : (
                                   <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#334155' }} />
                                 )}
                                 <span style={{
                                   position: 'absolute',
                                   bottom: -2,
                                   right: -2,
                                   width: '10px',
                                   height: '10px',
                                   borderRadius: '50%',
                                   border: '2px solid #1e293b',
                                   background: f.current_presence === 'In-Game' ? '#8b5cf6' :
                                               f.current_presence === 'Online' ? '#10b981' :
                                               f.current_presence === 'In-Studio' ? '#f59e0b' : '#6b7280'
                                 }} title={f.current_presence || 'Offline'} />
                               </div>
                               <div>
                                 <div style={{ fontWeight: 600 }}>{f.friend_display_name || f.friend_username}</div>
                                 <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>@{f.friend_username}</div>
                                 {f.friend_roblox_id && (
                                   <div style={{ fontSize: '0.75rem', marginTop: '0.1rem' }}>
                                     ID: <a href={`https://www.roblox.com/users/${f.friend_roblox_id}/profile`} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', textDecoration: 'none' }} onMouseOver={e => e.currentTarget.style.textDecoration = 'underline'} onMouseOut={e => e.currentTarget.style.textDecoration = 'none'}>{f.friend_roblox_id}</a>
                                   </div>
                                 )}
                               </div>
                             </div>
                           </td>
                           <td style={{ padding: '0.5rem', fontSize: '0.9rem' }}>
                             <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                               <span style={{
                                 color: f.current_presence === 'In-Game' ? '#a78bfa' :
                                        f.current_presence === 'Online' ? '#22c55e' :
                                        f.current_presence === 'In-Studio' ? '#fbbf24' : 'var(--text-muted)',
                                 fontWeight: f.current_presence !== 'Offline' ? 600 : 400
                               }}>
                                 {f.current_presence || 'Offline'}
                               </span>
                             </div>
                             {f.current_presence === 'In-Game' && f.current_game_name && (
                               <div style={{ fontSize: '0.75rem', color: '#a78bfa', marginTop: '0.2rem', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.current_game_name}>
                                 🎮 {f.current_game_name}
                               </div>
                             )}
                           </td>
                           <td style={{ padding: '0.5rem', fontSize: '0.9rem' }}>
                             <span style={{ color: f.status === 'active' ? '#22c55e' : '#ef4444' }}>
                               {f.status === 'active' ? 'Aktif' : 'Dihapus'}
                             </span>
                           </td>
                           <td style={{ padding: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                             {f.created_at}
                           </td>
                           <td style={{ padding: '0.5rem', fontSize: '0.85rem', color: f.status === 'removed' ? '#f87171' : 'var(--text-muted)' }}>
                             {f.status === 'removed' ? f.removed_at : '-'}
                           </td>
                           <td style={{ padding: '0.5rem', fontSize: '0.8rem', color: f.note ? '#fff' : 'var(--text-muted)', fontStyle: f.note ? 'normal' : 'italic' }}>
                             {f.note || '-'}
                           </td>
                         </tr>
                       ))}
                    </tbody>
                  </table>
                </div>
                {hasMoreFriends && (
                  <div style={{ textAlign: 'center', marginTop: '1rem', paddingBottom: '0.5rem' }}>
                    <button
                      onClick={handleLoadMoreFriends}
                      disabled={isLoadingMore}
                      style={{
                        background: '#334155', color: '#fff', border: 'none',
                        padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: isLoadingMore ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {isLoadingMore ? 'Memuat...' : 'Muat Lebih Banyak'}
                    </button>
                  </div>
                )}
              </>
            )
          ) : activeTab === 'trackers' ? (
            trackersList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Pengguna ini belum dilacak oleh siapa pun.</div>
            ) : (
              <div className="table-responsive">
                <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #334155', textAlign: 'left' }}>
                      <th style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Dilacak Oleh</th>
                      <th style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Tipe Akun</th>
                      <th style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Status Lacak</th>
                      <th style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Note Pelacak</th>
                      <th style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Sejak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trackersList.map(t => (
                      <tr key={t.id} style={{ borderBottom: '1px solid #334155' }}>
                        <td style={{ padding: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            {t.avatar_url ? (
                              <img src={t.avatar_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%' }} />
                            ) : (
                              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#334155' }} />
                            )}
                            <div>
                              <div style={{ fontWeight: 600 }}>{t.roblox_display_name || t.roblox_username}</div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>@{t.roblox_username}</div>
                              {t.roblox_user_id && (
                                <div style={{ fontSize: '0.75rem', marginTop: '0.1rem' }}>
                                  ID: <a href={`https://www.roblox.com/users/${t.roblox_user_id}/profile`} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', textDecoration: 'none' }} onMouseOver={e => e.currentTarget.style.textDecoration = 'underline'} onMouseOut={e => e.currentTarget.style.textDecoration = 'none'}>{t.roblox_user_id}</a>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '0.5rem', fontSize: '0.9rem' }}>
                          <span style={{
                            padding: '0.2rem 0.5rem',
                            borderRadius: '0.5rem',
                            fontSize: '0.8rem',
                            display: 'inline-block',
                            ...getRoleBadgeStyle(t.role_name)
                          }}>
                            {getRoleDisplayName(t.role_name)}
                          </span>
                        </td>
                        <td style={{ padding: '0.5rem', fontSize: '0.9rem' }}>
                          <span style={{ color: t.status === 'active' ? '#22c55e' : '#ef4444' }}>
                            {t.status === 'active' ? 'Aktif' : 'Dihapus'}
                          </span>
                        </td>
                        <td style={{ padding: '0.5rem', fontSize: '0.8rem', color: t.note ? '#fff' : 'var(--text-muted)', fontStyle: t.note ? 'normal' : 'italic' }}>
                          {t.note || '-'}
                        </td>
                        <td style={{ padding: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          {new Date(t.created_at).toLocaleString('id-ID')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : activeTab === 'gameHistory' ? (
            <GameHistoryTab userId={selectedUser.id} showToast={showToast} />
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default UserDetailModal;
