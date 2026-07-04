import React, { useState, useEffect, useRef } from 'react';
import { fetchWithAuth, trackFeatureUsage } from '../utils/api';
import NetworkGraph3D from './NetworkGraph3D';

const getRoleBadgeStyle = (roleName) => {
  switch (roleName?.toLowerCase()) {
    case 'admin':
      return {
        background: 'rgba(239, 68, 68, 0.15)',
        color: '#f87171',
        border: '1px solid rgba(239, 68, 68, 0.3)'
      };
    case 'moderator':
      return {
        background: 'rgba(168, 85, 247, 0.15)',
        color: '#c084fc',
        border: '1px solid rgba(168, 85, 247, 0.3)'
      };
    case 'observer':
      return {
        background: 'rgba(245, 158, 11, 0.15)',
        color: '#fbbf24',
        border: '1px solid rgba(245, 158, 11, 0.3)'
      };
    case 'user':
      return {
        background: 'rgba(59, 130, 246, 0.15)',
        color: '#60a5fa',
        border: '1px solid rgba(59, 130, 246, 0.3)'
      };
    default: // Synced Friend
      return {
        background: 'rgba(100, 116, 139, 0.15)',
        color: '#94a3b8',
        border: '1px solid rgba(100, 116, 139, 0.3)'
      };
  }
};

const getRoleDisplayName = (roleName) => {
  switch (roleName?.toLowerCase()) {
    case 'admin': return 'Admin';
    case 'moderator': return 'Moderator';
    case 'observer': return 'Observer';
    case 'user': return 'User';
    default: return roleName || 'Synced Friend';
  }
};

// ─── User Detail Modal ────────────────────────────────────────────────────────
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
      selectedUser.admin_note = adminNote; // update local object
    } catch (err) {
      console.error(err);
      if (showToast) showToast(err.message, 'error');
    }
  };

  // ─── USER ANALYTICS COMPUTATIONS ─────────────────────────────────────────────
  // Filter logs for the last 7 distinct calendar days to avoid day-of-week index collisions
  const sixDaysAgo = new Date();
  sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
  sixDaysAgo.setHours(0, 0, 0, 0);

  const filteredLogs = activityLogs.filter(log => new Date(log.created_at) >= sixDaysAgo);
  const totalUserLogs = filteredLogs.length;

  // 1. Status Breakdown
  const userStatusCounts = filteredLogs.reduce((acc, log) => {
    acc[log.status] = (acc[log.status] || 0) + 1;
    return acc;
  }, {});

  // 2. Most Played Games
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

  // 3. Hourly Activity Blocks
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

  // 4. Day of Week Activity
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

  // 5. Play Duration per Day of Week (in minutes)
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
                        <th style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Status Lacak</th>
                        <th style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Note User</th>
                        <th style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Waktu Ditambahkan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {friendsList.map(f => (
                        <tr key={f.id} style={{ borderBottom: '1px solid #334155' }}>
                          <td style={{ padding: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              {f.avatar_url ? (
                                <img src={f.avatar_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%' }} />
                              ) : (
                                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#334155' }} />
                              )}
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
                            <span style={{ color: f.status === 'active' ? '#22c55e' : '#ef4444' }}>
                              {f.status === 'active' ? 'Aktif' : 'Dihapus'}
                            </span>
                          </td>
                          <td style={{ padding: '0.5rem', fontSize: '0.8rem', color: f.note ? '#fff' : 'var(--text-muted)', fontStyle: f.note ? 'normal' : 'italic' }}>
                            {f.note || '-'}
                          </td>
                          <td style={{ padding: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            {f.created_at}
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

// ─── Game History Tab Component ───────────────────────────────────────────────
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
      'roblox-maps': 'Admin: Pengaturan Map Roblox 🗺️'
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
  }, [currentPage, debouncedSearchQuery, roleFilter, presenceFilter, hasViewUsers, showToast]);

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
    if (activeView !== 'co-players' && activeView !== 'analytics') return;
    const handleWSMessage = (e) => {
      const { type } = e.detail;
      if (type === 'presence_update') {
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
        <>
          <div style={{ marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flex: 1, minWidth: '300px', flexWrap: 'wrap' }}>
              <div className="search-container" style={{ maxWidth: '300px', flex: '1 1 200px' }}>
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Cari username atau nama..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 2.5rem',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-card)',
                    color: '#fff',
                    fontSize: '0.95rem'
                  }}
                />
              </div>

              <select
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value)}
                style={{ padding: '0.6rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--bg-card)', color: '#fff', fontSize: '0.95rem', cursor: 'pointer', outline: 'none' }}
              >
                <option value="All">Semua Tipe Akun</option>
                <option value="admin">Admin</option>
                <option value="moderator">Moderator</option>
                <option value="observer">Observer</option>
                <option value="user">User</option>
                <option value="Synced Friend">Synced Friend</option>
              </select>

              <select
                value={presenceFilter}
                onChange={e => setPresenceFilter(e.target.value)}
                style={{ padding: '0.6rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--bg-card)', color: '#fff', fontSize: '0.95rem', cursor: 'pointer', outline: 'none' }}
              >
                <option value="All">Semua Kehadiran</option>
                <option value="Online">Online</option>
                <option value="Offline">Offline</option>
                <option value="In-Game">In-Game</option>
                <option value="In-Studio">In-Studio</option>
              </select>
            </div>

            <div style={{ color: 'var(--text-muted)' }}>
              Total Data: <strong>{totalItems}</strong>
            </div>
          </div>

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Memuat data...</div>
          ) : (
            <div style={{ overflowX: 'auto', background: 'var(--bg-card)', borderRadius: '1rem', border: '1px solid var(--border)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: '#fff' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                    <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>ID</th>
                    <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>Profil</th>
                    <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>Tipe Akun</th>
                    <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>Persetujuan</th>
                    <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>Status Kehadiran</th>
                    <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>Mode Siluman</th>
                    <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Teman</th>
                    <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>Dibuat Pada</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Tidak ada data ditemukan</td>
                    </tr>
                  ) : (
                    users.map(u => (
                      <tr
                        key={u.id}
                        onClick={() => setSelectedUser(u)}
                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.05)'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}
                      >
                        <td style={{ padding: '1rem' }}>#{u.id}</td>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            {u.avatar_url ? (
                              <img src={u.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%' }} />
                            ) : (
                              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#334155' }} />
                            )}
                            <div>
                              <div style={{ fontWeight: 600 }}>{u.roblox_display_name || u.roblox_username}</div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>@{u.roblox_username}</div>
                              <div style={{ fontSize: '0.75rem', marginTop: '0.1rem' }}>
                                ID: <a href={`https://www.roblox.com/users/${u.roblox_user_id}/profile`} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', textDecoration: 'none' }} onMouseOver={e => e.currentTarget.style.textDecoration = 'underline'} onMouseOut={e => e.currentTarget.style.textDecoration = 'none'} onClick={e => e.stopPropagation()}>{u.roblox_user_id}</a>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '1rem' }} onClick={e => e.stopPropagation()}>
                          {hasManagePermissions && u.is_registered ? (
                            <select
                              value={u.role_name}
                              onChange={async (e) => {
                                const newRole = e.target.value;
                                try {
                                  const res = await fetchWithAuth(`/api/admin/users/${u.id}/role`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ role_name: newRole })
                                  });
                                  if (!res.ok) throw new Error('Gagal memperbarui peran');
                                  showToast(`Peran ${u.roblox_username} berhasil diubah menjadi ${getRoleDisplayName(newRole)}`, 'success');
                                  setUsers(prev => prev.map(usr => usr.id === u.id ? { ...usr, role_name: newRole } : usr));
                                } catch (err) {
                                  showToast(err.message, 'error');
                                }
                              }}
                              style={{
                                ...getRoleBadgeStyle(u.role_name),
                                padding: '0.2rem 0.5rem',
                                borderRadius: '0.4rem',
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                outline: 'none'
                              }}
                            >
                              <option value="admin">Admin</option>
                              <option value="moderator">Moderator</option>
                              <option value="observer">Observer</option>
                              <option value="user">User</option>
                            </select>
                          ) : (
                            <span style={{
                              padding: '0.25rem 0.6rem',
                              borderRadius: '1rem',
                              fontSize: '0.8rem',
                              ...getRoleBadgeStyle(u.role_name)
                            }}>
                              {getRoleDisplayName(u.role_name)}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '1rem' }} onClick={e => e.stopPropagation()}>
                          {u.is_registered ? (
                            u.role_name === 'admin' ? (
                              <span style={{ fontSize: '0.82rem', color: '#34d399', fontWeight: 700 }}>✅ Auto-Approved</span>
                            ) : (
                              <button
                                onClick={async () => {
                                  const nextVal = !u.is_approved;
                                  try {
                                    const res = await fetchWithAuth(`/api/admin/users/${u.id}/approve`, {
                                      method: 'PUT',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ is_approved: nextVal })
                                    });
                                    if (!res.ok) throw new Error('Gagal mengubah status persetujuan');
                                    showToast(`Persetujuan @${u.roblox_username} berhasil ${nextVal ? 'disetujui' : 'ditangguhkan'}`, 'success');
                                    setUsers(prev => prev.map(usr => usr.id === u.id ? { ...usr, is_approved: nextVal } : usr));
                                  } catch (err) {
                                    showToast(err.message, 'error');
                                  }
                                }}
                                style={{
                                  padding: '0.25rem 0.6rem',
                                  borderRadius: '0.4rem',
                                  fontSize: '0.8rem',
                                  cursor: 'pointer',
                                  fontWeight: 'bold',
                                  border: 'none',
                                  background: u.is_approved ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                                  color: u.is_approved ? '#34d399' : '#f87171',
                                  transition: 'all 0.2s'
                                }}
                              >
                                {u.is_approved ? '✅ Disetujui' : '⏳ Pending'}
                              </button>
                            )
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>-</span>
                          )}
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{
                              width: '8px', height: '8px', borderRadius: '50%',
                              background: u.current_presence === 'Online' ? '#3b82f6' :
                                u.current_presence === 'In-Game' ? '#22c55e' :
                                  u.current_presence === 'In-Studio' ? '#f59e0b' : '#64748b'
                            }} />
                            <span>{u.current_presence}</span>
                          </div>
                          {u.current_game_name && u.current_game_name !== '-' && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                              🎮 {u.current_game_name}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '1rem' }}>
                          {u.is_stealth ? (
                            <span style={{ color: '#ef4444', fontWeight: 600 }}>Aktif</span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>Mati</span>
                          )}
                        </td>
                        <td style={{ padding: '1rem' }}>{u.friends_count}</td>
                        <td style={{ padding: '1rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>{u.created_at}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {!isLoading && (
            <>
              {/* Sentinel Element for Infinite Scroll */}
              <div
                ref={loaderRef}
                style={{
                  padding: '1.5rem',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '0.9rem',
                  marginTop: '1rem',
                  borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                  background: 'rgba(255, 255, 255, 0.01)',
                  borderRadius: '0.5rem'
                }}
              >
                {isFetchingMore && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="spinner" style={{
                      width: '18px',
                      height: '18px',
                      border: '2px solid rgba(255,255,255,0.1)',
                      borderTopColor: '#3b82f6',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite'
                    }} />
                    Memuat lebih banyak data...
                  </div>
                )}
                {!isFetchingMore && currentPage >= totalPages && totalItems > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', color: '#10b981', fontWeight: 600 }}>
                    ✨ Semua {totalItems} pengguna telah dimuat
                  </div>
                )}
                {!isFetchingMore && currentPage < totalPages && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    🔽 Gulir ke bawah untuk memuat lebih banyak
                  </div>
                )}
              </div>

              {/* CSS Animation for Spinner */}
              <style>{`
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              `}</style>
            </>
          )}
        </>
      ) : activeView === 'co-players' ? (
        // Co-Players View
        <div>
          {/* Historical Search Panel */}
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            padding: '1.25rem',
            borderRadius: '1rem',
            marginBottom: '1.5rem',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)'
          }}>
            <h4 style={{ margin: '0 0 1rem 0', color: '#fbbf24', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🔍 Pelacakan Riwayat Bermain Bersama (Co-Play)
            </h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 1rem 0' }}>
              Cari tahu dengan siapa saja target yang Anda pantau bermain game Roblox pada jam dan hari tertentu berdasarkan rekaman log aktivitas.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>

              {/* Map Name Input */}
              <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>Nama Map / Game</span>
                <input
                  type="text"
                  placeholder="Misal: Indo Hangout, Mount Lunex..."
                  value={coPlaySearchMap}
                  onChange={e => setCoPlaySearchMap(e.target.value)}
                  style={{
                    padding: '0.6rem 0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--border)',
                    background: 'rgba(0,0,0,0.2)',
                    color: '#fff',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Date Input */}
              <div style={{ width: '160px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>Tanggal</span>
                <input
                  type="date"
                  value={coPlaySearchDate}
                  onChange={e => setCoPlaySearchDate(e.target.value)}
                  style={{
                    padding: '0.6rem 0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--border)',
                    background: 'rgba(0,0,0,0.2)',
                    color: '#fff',
                    fontSize: '0.9rem',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                />
              </div>

              {/* Hour Dropdown */}
              <div style={{ width: '160px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>Jam Bermain</span>
                <select
                  value={coPlaySearchHour}
                  onChange={e => setCoPlaySearchHour(parseInt(e.target.value))}
                  style={{
                    padding: '0.6rem 0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--border)',
                    background: 'rgba(0,0,0,0.2)',
                    color: '#fff',
                    fontSize: '0.9rem',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {Array.from({ length: 24 }).map((_, h) => (
                    <option key={h} value={h}>
                      {h.toString().padStart(2, '0')}:00 - {(h + 1).toString().padStart(2, '0')}:00
                    </option>
                  ))}
                </select>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  onClick={handleSearchCoPlayers}
                  disabled={isSearchingCoPlay}
                  style={{
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    color: '#fff',
                    border: 'none',
                    padding: '0.6rem 1.25rem',
                    borderRadius: '0.5rem',
                    fontWeight: 'bold',
                    cursor: isSearchingCoPlay ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 4px 12px rgba(245, 158, 11, 0.2)',
                    transition: 'all 0.2s'
                  }}
                >
                  {isSearchingCoPlay ? 'Mencari...' : '🕵️ Cari Riwayat'}
                </button>

                {coPlaySearchResults !== null && (
                  <button
                    onClick={handleClearCoPlaySearch}
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      color: '#fff',
                      border: '1px solid rgba(255,255,255,0.1)',
                      padding: '0.6rem 1.25rem',
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    🔄 Reset / Live View
                  </button>
                )}
              </div>

            </div>
          </div>

          {/* Results Area */}
          {coPlaySearchResults !== null ? (
            /* ─── HISTORICAL SEARCH RESULTS ─── */
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1.2rem', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  Hasil Pelacakan Riwayat: <span style={{ color: '#fbbf24' }}>"{coPlaySearchMap}"</span>
                </h3>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Tanggal: <strong>{coPlaySearchDate}</strong> pukul <strong>{coPlaySearchHour.toString().padStart(2, '0')}:00 - {(coPlaySearchHour + 1).toString().padStart(2, '0')}:00</strong>
                </span>
              </div>

              {coPlaySearchResults.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'var(--bg-card)', borderRadius: '1rem', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
                  <h3>Tidak Ada Riwayat Terdeteksi</h3>
                  <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>Tidak ada pengguna yang terdeteksi bermain map "{coPlaySearchMap}" pada jam {coPlaySearchHour.toString().padStart(2, '0')}:00 tanggal {coPlaySearchDate}.</p>
                </div>
              ) : (
                <div style={{ background: 'var(--bg-card)', borderRadius: '1rem', border: '1px solid var(--border)', padding: '1.25rem' }}>
                  <div style={{ marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <span style={{ color: '#4ade80', fontWeight: 'bold', fontSize: '0.95rem' }}>
                      🟢 Terdeteksi {coPlaySearchResults.length} Orang Bermain Bersama:
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                    {coPlaySearchResults.map((p) => (
                      <div
                        key={p.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: 'rgba(255,255,255,0.03)',
                          padding: '0.75rem 1rem',
                          borderRadius: '0.75rem',
                          border: '1px solid rgba(255,255,255,0.03)',
                          transition: 'border-color 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(251, 191, 36, 0.3)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.03)'}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          {p.avatar_url ? (
                            <img src={p.avatar_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%', border: '1.5px solid #fbbf24' }} />
                          ) : (
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#334155' }} />
                          )}
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#fff' }}>
                              {p.roblox_display_name || p.roblox_username}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              @{p.roblox_username}
                            </span>
                            {p.play_start_time && (
                              <span style={{ fontSize: '0.7rem', color: '#fbbf24', marginTop: '0.15rem' }}>
                                Mulai: pukul {p.play_start_time}
                              </span>
                            )}
                          </div>
                        </div>

                        <span style={{
                          fontSize: '0.75rem',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '0.25rem',
                          ...getRoleBadgeStyle(p.role_name)
                        }}>
                          {getRoleDisplayName(p.role_name)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ─── LIVE CO-PLAYERS VIEW ─── */
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1.2rem', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  🟢 Sedang Bermain Bersama (Live)
                </h3>
              </div>

              {isLoadingCoPlayers ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Memuat data bermain bersama...</div>
              ) : coPlayingGroups.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'var(--bg-card)', borderRadius: '1rem', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎮</div>
                  <h3>Belum Ada Pengguna Bermain Bersama</h3>
                  <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>Saat ini tidak ada pengguna atau teman terlacak yang terdeteksi sedang bermain game Roblox secara bersamaan.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                  {coPlayingGroups.map((group) => (
                    <div
                      key={group.game_name}
                      style={{
                        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)',
                        borderRadius: '1rem',
                        border: '1px solid rgba(255,255,255,0.05)',
                        padding: '1.25rem',
                        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        transition: 'transform 0.2s, border-color 0.2s',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.transform = 'translateY(-4px)';
                        e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)';
                      }}
                    >
                      <div>
                        {/* Game Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.75rem' }}>
                          <div style={{ flex: 1, marginRight: '0.5rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#f87171', fontWeight: 'bold', wordBreak: 'break-word' }}>
                              {group.game_name}
                            </h3>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Roblox Map/Game</span>
                          </div>
                          <span style={{
                            background: 'rgba(34, 197, 94, 0.15)',
                            color: '#4ade80',
                            padding: '0.25rem 0.6rem',
                            borderRadius: '1rem',
                            fontSize: '0.8rem',
                            fontWeight: 'bold',
                            border: '1px solid rgba(34, 197, 94, 0.3)',
                            boxShadow: '0 0 10px rgba(34, 197, 94, 0.1)',
                            whiteSpace: 'nowrap'
                          }}>
                            🟢 {group.players.length} Pemain
                          </span>
                        </div>

                        {/* Players List */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '250px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                          {group.players.map((p) => (
                            <div
                              key={p.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: 'rgba(255,255,255,0.03)',
                                padding: '0.5rem 0.75rem',
                                borderRadius: '0.5rem',
                                border: '1px solid rgba(255,255,255,0.03)'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {p.avatar_url ? (
                                  <img src={p.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', border: '1.5px solid #ef4444' }} />
                                ) : (
                                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#334155' }} />
                                )}
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.25rem' }}>
                                    {p.roblox_display_name || p.roblox_username}
                                    {p.friends_with && p.friends_with.length > 0 && (
                                      <span
                                        title={`Berteman dengan di website: ${p.friends_with.join(', ')}`}
                                        style={{
                                          fontSize: '0.65rem',
                                          background: 'rgba(34, 197, 94, 0.25)',
                                          color: '#4ade80',
                                          padding: '0.05rem 0.35rem',
                                          borderRadius: '0.25rem',
                                          border: '1px solid rgba(34, 197, 94, 0.4)',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '0.15rem',
                                          cursor: 'help'
                                        }}
                                      >
                                        🤝 Teman
                                      </span>
                                    )}
                                  </span>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    @{p.roblox_username}
                                  </span>
                                </div>
                              </div>
                              <span style={{
                                fontSize: '0.75rem',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '0.25rem',
                                ...getRoleBadgeStyle(p.role_name)
                              }}>
                                {getRoleDisplayName(p.role_name)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : activeView === 'shadow' ? (
        // Shadow Activity View
        <div>
          {isLoadingShadow ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Menganalisis data aktivitas siluman...</div>
          ) : (() => {
            const filteredShadows = shadowActivities.filter(act => {
              const u = act.user || {};
              const query = shadowSearchQuery.toLowerCase();
              return (
                (u.roblox_username && u.roblox_username.toLowerCase().includes(query)) ||
                (u.roblox_display_name && u.roblox_display_name.toLowerCase().includes(query))
              );
            });
            const visibleShadows = filteredShadows.slice(0, shadowVisibleCount);

            return (
              <>
                <div style={{ marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="search-container" style={{ maxWidth: '300px', flex: '1 1 200px' }}>
                    <span className="search-icon">🔍</span>
                    <input
                      type="text"
                      placeholder="Cari username siluman..."
                      value={shadowSearchQuery}
                      onChange={(e) => {
                        setShadowSearchQuery(e.target.value);
                        setShadowVisibleCount(6); // reset limit on new search
                      }}
                      style={{
                        width: '100%',
                        padding: '0.6rem 2.5rem',
                        borderRadius: '0.5rem',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-card)',
                        color: '#fff',
                        fontSize: '0.95rem'
                      }}
                    />
                  </div>
                  <div style={{ color: 'var(--text-muted)' }}>
                    Total Kasus Ditemukan: <strong>{filteredShadows.length}</strong>
                  </div>
                </div>

                {filteredShadows.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'var(--bg-card)', borderRadius: '1rem', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🕵️</div>
                    <h3>Tidak Ada Aktivitas Siluman Terdeteksi</h3>
                    <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>Bagus! Tidak ada pengguna dengan kriteria pencarian tersebut atau status offline yang melakukan modifikasi avatar.</p>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.5rem' }}>
                      {visibleShadows.map((act) => {
                        const u = act.user || {};
                        return (
                          <div
                            key={act.id}
                            style={{
                              background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)',
                              borderRadius: '1rem',
                              border: act.is_reviewed ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(245, 158, 11, 0.2)',
                              padding: '1.25rem',
                              boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
                              backdropFilter: 'blur(8px)',
                              WebkitBackdropFilter: 'blur(8px)',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              transition: 'transform 0.2s, border-color 0.2s',
                              opacity: act.is_reviewed ? 0.75 : 1
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.transform = 'translateY(-4px)';
                              e.currentTarget.style.borderColor = act.is_reviewed ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.transform = 'none';
                              e.currentTarget.style.borderColor = act.is_reviewed ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)';
                            }}
                          >
                            <div>
                              {/* User Header */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.75rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                  {u.avatar_url ? (
                                    <img src={u.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', border: act.is_reviewed ? '1.5px solid #10b981' : '1.5px solid #f59e0b' }} />
                                  ) : (
                                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#334155' }} />
                                  )}
                                  <div>
                                    <div style={{ fontWeight: 600, color: '#fff' }}>{u.roblox_display_name || u.roblox_username}</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>@{u.roblox_username}</div>
                                  </div>
                                </div>

                                {/* Status Badge */}
                                <span style={{
                                  fontSize: '0.75rem',
                                  padding: '0.25rem 0.6rem',
                                  borderRadius: '1rem',
                                  background: act.is_reviewed ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                  color: act.is_reviewed ? '#34d399' : '#fbbf24',
                                  border: act.is_reviewed ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
                                  fontWeight: 'bold'
                                }}>
                                  {act.is_reviewed ? '✅ Ditinjau' : '⚠️ Kasus Baru'}
                                </span>
                              </div>

                              {/* Comparison Panel */}
                              <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem' }}>
                                <div style={{ textAlign: 'center' }}>
                                  <img src={act.old_avatar} alt="Old" style={{ width: 60, height: 60, borderRadius: '50%', border: '2px solid rgba(239, 68, 68, 0.4)', background: '#1e293b' }} />
                                  <div style={{ color: '#f87171', fontSize: '0.7rem', marginTop: '0.25rem', fontWeight: 600 }}>Sebelum</div>
                                </div>
                                <div style={{ fontSize: '1.5rem', color: 'var(--text-muted)' }}>➔</div>
                                <div style={{ textAlign: 'center' }}>
                                  <img src={act.new_avatar} alt="New" style={{ width: 60, height: 60, borderRadius: '50%', border: '2px solid rgba(34, 197, 94, 0.6)', background: '#1e293b' }} />
                                  <div style={{ color: '#4ade80', fontSize: '0.7rem', marginTop: '0.25rem', fontWeight: 600 }}>Sesudah</div>
                                </div>
                              </div>

                              {/* Meta Details */}
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span>Waktu Deteksi:</span>
                                  <strong style={{ color: '#fff' }}>{new Date(act.created_at).toLocaleString('id-ID')}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span>Status Terdaftar:</span>
                                  <span style={{ color: '#ef4444', fontWeight: 'bold' }}>🔴 Offline</span>
                                </div>
                              </div>

                              {/* Auto Conclusion AI */}
                              <div style={{ background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.1)', borderRadius: '0.5rem', padding: '0.75rem', fontSize: '0.78rem', color: '#fbbf24', lineHeight: '1.4', marginBottom: '1rem' }}>
                                <strong>📝 Kesimpulan Sistem:</strong><br />
                                Pengguna mengubah kosmetik avatar Roblox secara real-time saat terdaftar <strong>Offline</strong>{act.offline_duration > 0 ? <> (selama <strong>{act.offline_duration} menit</strong>)</> : ''}. Disimpulkan sedang bermain siluman.
                              </div>

                              {/* Incident Form — selalu tampil, aksi hanya untuk yang punya izin review */}
                              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.75rem', marginTop: '0.75rem' }}>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                                  Catatan Penyelidikan:
                                  {!hasReviewShadow && (
                                    <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', color: '#64748b', fontStyle: 'italic' }}>
                                      (hanya baca)
                                    </span>
                                  )}
                                </label>
                                <textarea
                                  id={`notes-${act.id}`}
                                  defaultValue={act.admin_notes}
                                  placeholder={hasReviewShadow ? 'Tambahkan catatan penyelidikan...' : 'Tidak ada catatan penyelidikan.'}
                                  readOnly={!hasReviewShadow}
                                  style={{
                                    width: '100%',
                                    minHeight: '60px',
                                    padding: '0.4rem 0.6rem',
                                    borderRadius: '0.35rem',
                                    border: '1px solid var(--border)',
                                    background: hasReviewShadow ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.15)',
                                    color: hasReviewShadow ? '#fff' : '#94a3b8',
                                    fontSize: '0.8rem',
                                    resize: hasReviewShadow ? 'vertical' : 'none',
                                    outline: 'none',
                                    marginBottom: hasReviewShadow ? '0.75rem' : '0',
                                    cursor: hasReviewShadow ? 'text' : 'default',
                                    opacity: hasReviewShadow ? 1 : 0.7
                                  }}
                                />

                                {/* Tombol aksi — hanya untuk yang punya izin review */}
                                {hasReviewShadow && (
                                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                      onClick={() => {
                                        const notes = document.getElementById(`notes-${act.id}`).value;
                                        handleUpdateShadowActivity(act.id, !act.is_reviewed, notes);
                                      }}
                                      style={{
                                        flex: 1,
                                        padding: '0.4rem 0.75rem',
                                        borderRadius: '0.35rem',
                                        border: 'none',
                                        background: act.is_reviewed ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                                        color: act.is_reviewed ? '#fbbf24' : '#34d399',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                      }}
                                    >
                                      {act.is_reviewed ? '🔄 Buka Kasus' : '✅ Selesaikan'}
                                    </button>
                                    <button
                                      onClick={() => {
                                        const notes = document.getElementById(`notes-${act.id}`).value;
                                        handleUpdateShadowActivity(act.id, act.is_reviewed, notes);
                                      }}
                                      style={{
                                        padding: '0.4rem 0.75rem',
                                        borderRadius: '0.35rem',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        background: 'transparent',
                                        color: '#fff',
                                        fontSize: '0.8rem',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                      }}
                                    >
                                      💾 Simpan Catatan
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {shadowVisibleCount < filteredShadows.length && (
                      <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                        <button
                          onClick={() => setShadowVisibleCount(prev => prev + 6)}
                          style={{
                            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(245, 158, 11, 0.1) 100%)',
                            color: '#fbbf24',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                            padding: '0.75rem 2rem',
                            borderRadius: '0.5rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: '0.95rem',
                            transition: 'all 0.2s',
                            boxShadow: '0 4px 15px rgba(245, 158, 11, 0.05)'
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.5)';
                            e.currentTarget.style.background = 'rgba(245, 158, 11, 0.25)';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.transform = 'none';
                            e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.3)';
                            e.currentTarget.style.background = 'rgba(245, 158, 11, 0.2)';
                          }}
                        >
                          🔽 Muat Lebih Banyak ({filteredShadows.length - shadowVisibleCount} Kasus Lagi)
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            );
          })()}
        </div>
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

// ─── System Log Viewer Component ────────────────────────────────────────────────
const SystemLogViewer = ({ showToast }) => {
  const [logFiles, setLogFiles] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('cron');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedFile, setSelectedFile] = useState('');
  const [logContent, setLogContent] = useState('');
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState('ALL');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const terminalEndRef = React.useRef(null);

  const CATEGORIES = [
    { value: 'cron', label: 'Cron Jobs ⏰' },
    { value: 'database', label: 'Database (GORM) 🗄️' },
    { value: 'http', label: 'HTTP / API Access 🌐' },
    { value: 'startup', label: 'Startup & System 🚀' },
    { value: 'websocket', label: 'WebSocket Live 🔌' }
  ];

  const getDatesForCategory = (category, files) => {
    return files
      .filter(file => file.startsWith(category + '/'))
      .map(file => file.split('/')[1]?.replace('.log', ''))
      .filter(Boolean);
  };

  const handleCategoryChange = (newCat) => {
    setSelectedCategory(newCat);
    const dates = getDatesForCategory(newCat, logFiles);
    if (dates.length > 0) {
      setSelectedDate(dates[0]);
      setSelectedFile(`${newCat}/${dates[0]}.log`);
    } else {
      setSelectedDate('');
      setSelectedFile('');
      setLogContent('');
    }
  };

  const handleDateChange = (newDate) => {
    setSelectedDate(newDate);
    setSelectedFile(`${selectedCategory}/${newDate}.log`);
  };

  const fetchLogFiles = async () => {
    setIsLoadingFiles(true);
    try {
      const res = await fetchWithAuth('/api/admin/logs/files');
      if (!res.ok) throw new Error('Gagal memuat daftar file log');
      const data = await res.json();
      setLogFiles(Array.isArray(data) ? data : []);
      
      if (data.length > 0) {
        const cronDates = getDatesForCategory('cron', data);
        if (cronDates.length > 0) {
          setSelectedCategory('cron');
          setSelectedDate(cronDates[0]);
          setSelectedFile(`cron/${cronDates[0]}.log`);
        } else {
          const parts = data[0].split('/');
          const cat = parts[0];
          const date = parts[1]?.replace('.log', '');
          setSelectedCategory(cat);
          setSelectedDate(date);
          setSelectedFile(data[0]);
        }
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const fetchLogContent = async (file) => {
    if (!file) return;
    setIsLoadingContent(true);
    try {
      const res = await fetchWithAuth(`/api/admin/logs/files/${file}`);
      if (!res.ok) throw new Error('Gagal memuat isi log');
      const content = await res.text();
      setLogContent(content);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsLoadingContent(false);
    }
  };

  useEffect(() => {
    fetchLogFiles();
  }, []);

  useEffect(() => {
    fetchLogContent(selectedFile);
  }, [selectedFile]);

  // Auto-refresh hook
  useEffect(() => {
    if (!autoRefresh) return;
    const handleWSMessage = (e) => {
      const { type, payload } = e.detail;
      if (type === 'log_stream') {
        const { category, message } = payload;
        if (category === selectedCategory) {
          const today = (() => {
            const d = new Date();
            const offset = d.getTimezoneOffset();
            const local = new Date(d.getTime() - (offset * 60 * 1000));
            return local.toISOString().substring(0, 10);
          })();
          if (selectedDate === today) {
            setLogContent(prev => prev + message);
          }
        }
      }
    };
    window.addEventListener('ws-message', handleWSMessage);
    return () => window.removeEventListener('ws-message', handleWSMessage);
  }, [autoRefresh, selectedCategory, selectedDate]);

  useEffect(() => {
    scrollToBottom();
  }, [logContent]);

  // Filter logs line by line
  const filteredLines = logContent
    .split('\n')
    .filter(line => {
      if (!line.trim()) return false;
      const matchSearch = line.toLowerCase().includes(searchQuery.toLowerCase());
      if (levelFilter === 'ALL') return matchSearch;
      return line.includes(`[${levelFilter}]`) && matchSearch;
    });

  const scrollToBottom = () => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1.5rem', marginTop: '1rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#fff' }}>🖥️ Log Cron Sistem Harian</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.25rem 0 0 0' }}>Pantau seluruh log aktivitas, keberhasilan, dan eror cronjob real-time.</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <button
            onClick={() => fetchLogContent(selectedFile)}
            style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
          >
            🔄 Refresh Manual
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fff', fontSize: '0.85rem', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Live Stream (WS) ⚡
          </label>
        </div>
      </div>

      {/* Select Box and Filter bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Pilih Kategori:</label>
          <select
            value={selectedCategory}
            onChange={(e) => handleCategoryChange(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', background: '#1e293b', border: '1px solid var(--border)', color: '#fff', fontSize: '0.85rem' }}
          >
            {CATEGORIES.map(cat => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Pilih Tanggal:</label>
          <select
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', background: '#1e293b', border: '1px solid var(--border)', color: '#fff', fontSize: '0.85rem' }}
            disabled={isLoadingFiles || getDatesForCategory(selectedCategory, logFiles).length === 0}
          >
            {isLoadingFiles ? (
              <option>Memuat tanggal...</option>
            ) : getDatesForCategory(selectedCategory, logFiles).length === 0 ? (
              <option>Tidak ada tanggal ditemukan</option>
            ) : (
              getDatesForCategory(selectedCategory, logFiles).map(date => (
                <option key={date} value={date}>{date}</option>
              ))
            )}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Cari Teks / Keyword:</label>
          <input
            type="text"
            placeholder="Cari log..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', background: '#1e293b', border: '1px solid var(--border)', color: '#fff', fontSize: '0.85rem' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Filter Level Log:</label>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            {['ALL', 'INFO', 'WARNING', 'ERROR'].map(lvl => (
              <button
                key={lvl}
                onClick={() => setLevelFilter(lvl)}
                style={{
                  flex: 1,
                  padding: '0.4rem 0',
                  borderRadius: '0.35rem',
                  border: 'none',
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  background: levelFilter === lvl
                    ? (lvl === 'INFO' ? 'rgba(34,197,94,0.2)' : lvl === 'WARNING' ? 'rgba(245,158,11,0.2)' : lvl === 'ERROR' ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)')
                    : 'rgba(255,255,255,0.05)',
                  color: levelFilter === lvl
                    ? (lvl === 'INFO' ? '#4ade80' : lvl === 'WARNING' ? '#fbbf24' : lvl === 'ERROR' ? '#f87171' : '#60a5fa')
                    : 'var(--text-muted)'
                }}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Terminal Board */}
      <div
        style={{
          background: '#090d16',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: '0.75rem',
          padding: '1.25rem',
          fontFamily: 'monospace',
          fontSize: '0.85rem',
          lineHeight: '1.6',
          maxHeight: '500px',
          overflowY: 'auto',
          boxShadow: 'inset 0 0 15px rgba(0,0,0,0.8)'
        }}
      >
        {isLoadingContent ? (
          <div style={{ color: '#94a3b8', textAlign: 'center', padding: '3rem 0' }}>Memuat isi log...</div>
        ) : filteredLines.length === 0 ? (
          <div style={{ color: '#64748b', textAlign: 'center', padding: '3rem 0' }}>Tidak ada baris log yang cocok dengan filter.</div>
        ) : (
          filteredLines.map((line, idx) => {
            let color = '#e2e8f0';
            if (line.includes('[INFO]')) color = '#a7f3d0';
            else if (line.includes('[WARNING]')) color = '#fde68a';
            else if (line.includes('[ERROR]')) color = '#fca5a5';

            return (
              <div key={idx} style={{ color, whiteSpace: 'pre-wrap', borderBottom: '1px solid rgba(255,255,255,0.02)', padding: '0.2rem 0' }}>
                {line}
              </div>
            );
          })
        )}
        <div ref={terminalEndRef} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', gap: '0.5rem' }}>
        <button
          onClick={scrollToBottom}
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: '#fff', padding: '0.4rem 0.8rem', borderRadius: '0.35rem', cursor: 'pointer', fontSize: '0.8rem' }}
        >
          ⬇️ Scroll ke Bawah
        </button>
      </div>
    </div>
  );
};

// ─── Cron Job Monitor Component ──────────────────────────────────────────────────
const CronJobMonitor = ({ showToast }) => {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchStatus = async () => {
    try {
      const res = await fetchWithAuth('/api/admin/cron-status');
      if (!res.ok) throw new Error('Gagal memuat status cron');
      const json = await res.json();
      setData(json);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    const handleWSMessage = (e) => {
      const { type, payload } = e.detail;
      console.log('[CronMonitor WS] message received:', type, payload);
      if (type === 'cron_progress') {
        const {
          remaining_hits,
          max_hits,
          job_name,
          instance_id,
          status,
          start_time,
          last_run,
          duration_ms,
          processed_count,
          failed_count,
          change_count
        } = payload;

        setData(prev => {
          if (!prev) return prev;

          // Update remaining hits
          const newRemaining = remaining_hits ?? prev.remaining_hits;
          const newMax = max_hits ?? prev.max_hits;

          // Update specifically the job that broadcasted
          const updatedJobs = prev.jobs.map(job => {
            if (job.job_name === job_name && job.instance_id === instance_id) {
              return {
                ...job,
                status,
                start_time,
                last_run,
                duration_ms,
                processed_count,
                failed_count,
                change_count
              };
            }
            return job;
          });

          const exists = prev.jobs.some(job => job.job_name === job_name && job.instance_id === instance_id);
          if (!exists && job_name) {
            updatedJobs.push({
              job_name,
              instance_id,
              status,
              start_time,
              last_run,
              duration_ms,
              processed_count,
              failed_count,
              change_count
            });
          }

          return {
            ...prev,
            remaining_hits: newRemaining,
            max_hits: newMax,
            jobs: updatedJobs
          };
        });
      }
    };

    window.addEventListener('ws-message', handleWSMessage);
    return () => window.removeEventListener('ws-message', handleWSMessage);
  }, [autoRefresh]);

  if (isLoading && !data) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        Memuat data pemantauan sistem...
      </div>
    );
  }

  const remainingHits = data?.remaining_hits ?? 80;
  const maxHits = data?.max_hits ?? 80;
  const percentage = Math.round((remainingHits / maxHits) * 100);

  // Determine progress bar color based on remaining hits
  let gaugeColor = '#10b981'; // Green (Safe)
  if (percentage < 30) {
    gaugeColor = '#ef4444'; // Red (Danger)
  } else if (percentage < 60) {
    gaugeColor = '#f59e0b'; // Amber (Busy)
  }

  const jobs = data?.jobs || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1rem' }}>
      {/* Upper Grid: Rate Limit & Cluster Info */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        {/* Roblox API Rate Limit Gauge Card */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '1.5rem', borderRadius: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Roblox API Rate Limit (Per IP)</span>
            <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', color: 'var(--text-muted)' }}>Menit Berjalan</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ position: 'relative', width: '80px', height: '80px', borderRadius: '50%', background: `conic-gradient(${gaugeColor} ${percentage}%, rgba(255,255,255,0.05) ${percentage}%)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '68px', height: '68px', borderRadius: '50%', background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#fff' }}>{remainingHits}</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Sisa Hits</span>
              </div>
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#fff', marginBottom: '0.25rem' }}>
                {percentage}% <span style={{ fontSize: '0.9rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>Tersedia</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                Batas aman sistem: <strong>{maxHits} request / menit</strong>.
              </div>
              <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${percentage}%`, height: '100%', background: gaugeColor, transition: 'width 0.5s ease-in-out' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Server Cluster Configuration Card */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '1.5rem', borderRadius: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Konfigurasi Cluster Server</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Instance ID Server Ini</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#3b82f6' }}>#{data?.instance_id ?? 1}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Total Server di Cluster</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#10b981' }}>{data?.total_instances ?? 1} Instance</div>
            </div>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(59,130,246,0.05)', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid rgba(59,130,246,0.1)' }}>
            ℹ️ Beban sinkronisasi dibagi menggunakan partisi database modulo ID (`id % total_instances`).
          </div>
        </div>
      </div>

      {/* Control Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '0.75rem 1.25rem', borderRadius: '0.75rem', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="checkbox"
            id="auto-refresh-cron"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
          />
          <label htmlFor="auto-refresh-cron" style={{ fontSize: '0.85rem', color: '#fff', cursor: 'pointer', userSelect: 'none' }}>
            Live Stream (WS) ⚡
          </label>
        </div>
        <button
          onClick={fetchStatus}
          style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '0.4rem 1rem', borderRadius: '0.35rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
        >
          Ambil Data Terbaru
        </button>
      </div>

      {/* Cron Jobs State Table */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, color: '#fff' }}>Daftar Pekerjaan Latar Belakang (Cron Jobs)</h4>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '1rem' }}>Pekerjaan (Job)</th>
                <th style={{ padding: '1rem' }}>Instance Server</th>
                <th style={{ padding: '1rem' }}>Status</th>
                <th style={{ padding: '1rem' }}>Mulai Eksekusi</th>
                <th style={{ padding: '1rem' }}>Selesai Terakhir</th>
                <th style={{ padding: '1rem' }}>Durasi</th>
                <th style={{ padding: '1rem' }}>Statistik</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Belum ada metadata eksekusi cron di Redis. Tunggu cron berjalan otomatis.
                  </td>
                </tr>
              ) : (
                jobs.map((job, idx) => {
                  const isRunning = job.status === 'running';
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', background: isRunning ? 'rgba(20,184,166,0.03)' : 'transparent', transition: 'background 0.2s' }}>
                      <td style={{ padding: '1rem', fontWeight: 'bold', color: '#fff' }}>
                        {job.job_name === 'friends_sync' ? '👥 Friends & Profile Sync' : '🟢 Presence Sync'}
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <span style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                          Instance #{job.instance_id}
                        </span>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: isRunning ? '#14b8a6' : '#94a3b8',
                            display: 'inline-block',
                            boxShadow: isRunning ? '0 0 8px #14b8a6' : 'none'
                          }} />
                          <span style={{ fontWeight: 600, color: isRunning ? '#2dd4bf' : 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase' }}>
                            {isRunning ? 'Running' : 'Idle'}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{job.start_time || '-'}</td>
                      <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{job.last_run || '-'}</td>
                      <td style={{ padding: '1rem', color: '#fff' }}>
                        {job.duration_ms > 0 ? `${(job.duration_ms / 1000).toFixed(2)} detik` : '-'}
                      </td>
                      <td style={{ padding: '1rem' }}>
                        {job.job_name === 'friends_sync' ? (
                          <div style={{ fontSize: '0.8rem' }}>
                            <span style={{ color: '#4ade80' }}>✓ {job.processed_count} Sukses</span> · <span style={{ color: '#f87171' }}>✗ {job.failed_count} Gagal</span>
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.8rem' }}>
                            <span style={{ color: '#a78bfa' }}>👥 {job.processed_count} Teman</span> · <span style={{ color: '#fbbf24' }}>⚡ {job.change_count} Perubahan</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── Database Backup & Restore Component ──────────────────────────────────────────
const DatabaseBackupRestore = ({ showToast, handleBackup, handleRestore, isRestoring }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [autoBackups, setAutoBackups] = useState([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isTriggeringBackup, setIsTriggeringBackup] = useState(false);
  const [isRestoringArchive, setIsRestoringArchive] = useState(null); // stores filename currently restoring

  const fetchAutoBackups = async () => {
    setIsLoadingList(true);
    try {
      const res = await fetchWithAuth('/api/admin/backups/list');
      if (!res.ok) throw new Error('Gagal memuat arsip backup otomatis');
      const data = await res.json();
      setAutoBackups(Array.isArray(data) ? data : []);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    fetchAutoBackups();
  }, []);

  const onFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.name.endsWith('.sql')) {
      setSelectedFile(file);
    } else {
      showToast('Hanya mendukung format file SQL (.sql)', 'error');
      setSelectedFile(null);
    }
  };

  const triggerRestore = () => {
    if (!selectedFile) return;
    const fakeEvent = {
      target: {
        files: [selectedFile],
        value: ''
      }
    };
    handleRestore(fakeEvent);
  };

  const handleTriggerAutoBackup = async () => {
    setIsTriggeringBackup(true);
    showToast('Sedang membuat backup otomatis baru...', 'info');
    try {
      const res = await fetchWithAuth('/api/admin/backups/trigger-auto', {
        method: 'POST'
      });
      if (!res.ok) throw new Error('Gagal memicu backup otomatis');
      const data = await res.json();
      showToast(data.message || 'Backup otomatis berhasil dibuat', 'success');
      fetchAutoBackups(); // Refresh list
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsTriggeringBackup(false);
    }
  };

  const handleDownloadFile = async (filename) => {
    try {
      const res = await fetchWithAuth(`/api/admin/backups/download/${filename}`);
      if (!res.ok) throw new Error('Gagal mengunduh file backup');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteFile = async (filename) => {
    if (!await window.customConfirm(`Apakah Anda yakin ingin menghapus file backup "${filename}"?`)) return;
    try {
      const res = await fetchWithAuth(`/api/admin/backups/delete/${filename}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Gagal menghapus file backup');
      showToast('File backup berhasil dihapus', 'success');
      fetchAutoBackups(); // Refresh list
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleRestoreFromArchive = async (filename) => {
    const confirmRestore = await window.customConfirm(
      `PERINGATAN KRITIS:\nMemulihkan database dari arsip "${filename}" akan menghapus seluruh data aktif saat ini.\n\nApakah Anda yakin ingin melanjutkan?`
    );
    if (!confirmRestore) return;

    setIsRestoringArchive(filename);
    showToast('Sedang memulihkan basis data dari arsip, mohon tunggu...', 'info');
    try {
      const res = await fetchWithAuth(`/api/admin/backups/restore/${filename}`, {
        method: 'POST'
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Gagal memulihkan database');
      }
      showToast('Database berhasil dipulihkan!', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      showToast(err.message, 'error');
      setIsRestoringArchive(null);
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1rem' }}>
      {/* Description Intro Card */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '1.5rem', borderRadius: '1rem' }}>
        <h3 style={{ margin: '0 0 0.5rem 0', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          💾 Manajemen Ekspor & Impor Database
        </h3>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5' }}>
          Gunakan modul ini untuk mencadangkan data pelacakan Anda secara manual atau memulihkan database dari cadangan yang disimpan sebelumnya. Fitur ini mengekspor file SQL skema lengkap termasuk data akun, teman, riwayat aktivitas, dan log audit sistem.
        </p>
      </div>

      {/* Main Grid: Backup Card vs Restore Card */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {/* Backup Card */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '1.5rem', borderRadius: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1.5rem' }}>
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#fff', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              📥 Pencadangan (Backup)
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              Membuat salinan basis data instan. File SQL yang diunduh dapat disimpan dengan aman sebagai arsip lokal.
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '0.75rem', marginTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                <span>Format Output:</span>
                <strong style={{ color: '#10b981' }}>SQL (.sql)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <span>Kompresi:</span>
                <strong>Tidak ada (Teks SQL)</strong>
              </div>
            </div>
          </div>

          <button
            onClick={handleBackup}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#fff',
              border: 'none',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              boxShadow: '0 4px 10px rgba(16,185,129,0.2)',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem'
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'none'}
          >
            📥 Unduh Backup Database (.sql)
          </button>
        </div>

        {/* Restore Card */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '1.5rem', borderRadius: '1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#fff', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              📤 Pemulihan (Restore)
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              Memulihkan basis data dari cadangan file SQL. Proses ini akan menimpa seluruh data yang ada saat ini.
            </div>

            {/* Warning Banner */}
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', padding: '0.75rem 1rem', borderRadius: '0.5rem', fontSize: '0.8rem', marginTop: '1rem', lineHeight: '1.4' }}>
              ⚠️ <strong>PERINGATAN KRITIS:</strong> Seluruh data aktif di sistem (termasuk riwayat login, pelacakan teman, dan log aktivitas) akan dihapus total dan digantikan oleh isi file SQL backup.
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Drag & Drop File Picker */}
            <div style={{ position: 'relative', border: '2px dashed rgba(255,255,255,0.15)', padding: '1.5rem', borderRadius: '0.75rem', textAlign: 'center', background: 'rgba(0,0,0,0.2)', cursor: 'pointer', transition: 'all 0.2s' }}>
              <input
                type="file"
                accept=".sql"
                onChange={onFileChange}
                disabled={isRestoring || isRestoringArchive}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
              />
              <span style={{ fontSize: '1.5rem', display: 'block', marginBottom: '0.5rem' }}>📁</span>
              <span style={{ fontSize: '0.8rem', color: selectedFile ? '#60a5fa' : 'var(--text-muted)', fontWeight: selectedFile ? 600 : 'normal' }}>
                {selectedFile ? `File Terpilih: ${selectedFile.name}` : 'Klik untuk memilih file backup SQL'}
              </span>
            </div>

            {selectedFile && (
              <button
                onClick={triggerRestore}
                disabled={isRestoring || isRestoringArchive}
                style={{
                  width: '100%',
                  background: (isRestoring || isRestoringArchive) ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  color: '#fff',
                  border: 'none',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: (isRestoring || isRestoringArchive) ? 'not-allowed' : 'pointer',
                  boxShadow: (isRestoring || isRestoringArchive) ? 'none' : '0 4px 10px rgba(239,68,68,0.2)',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem'
                }}
              >
                {isRestoring ? '⏳ Memulihkan Database...' : '🚀 Mulai Pemulihan (Mereset Data)'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Auto Backup Archive List Card */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden', marginTop: '1rem' }}>
        <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h4 style={{ margin: 0, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              📦 Arsip Backup Otomatis & Terjadwal
            </h4>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              File tersimpan secara lokal di folder <code>uploads/db/</code>. Cadangan otomatis dibuat setiap hari pukul 00:00.
            </span>
          </div>

          <button
            onClick={handleTriggerAutoBackup}
            disabled={isTriggeringBackup || isRestoring || isRestoringArchive}
            style={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              color: '#fff',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: (isTriggeringBackup || isRestoring || isRestoringArchive) ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            {isTriggeringBackup ? '⏳ Membuat Backup...' : '⚡ Trigger Backup Otomatis Sekarang'}
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '1rem' }}>Nama File</th>
                <th style={{ padding: '1rem' }}>Waktu Pencadangan</th>
                <th style={{ padding: '1rem' }}>Ukuran File</th>
                <th style={{ padding: '1rem', textAlign: 'right' }}>Aksi / Operasi</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingList ? (
                <tr>
                  <td colSpan="4" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Memuat daftar arsip backup...
                  </td>
                </tr>
              ) : autoBackups.length === 0 ? (
                <tr>
                  <td colSpan="4" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Belum ada arsip backup otomatis di folder <code>uploads/db</code>.
                  </td>
                </tr>
              ) : (
                autoBackups.map((backup, idx) => {
                  const isThisRestoring = isRestoringArchive === backup.filename;
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.01)'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                      <td style={{ padding: '1rem', color: '#fff', fontWeight: 600 }}>
                        📄 {backup.filename}
                      </td>
                      <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>
                        {new Date(backup.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'medium' })}
                      </td>
                      <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>
                        {formatBytes(backup.size)}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => handleDownloadFile(backup.filename)}
                            disabled={isRestoring || isRestoringArchive}
                            style={{
                              background: 'rgba(59,130,246,0.15)',
                              color: '#60a5fa',
                              border: '1px solid rgba(59,130,246,0.3)',
                              padding: '0.3rem 0.75rem',
                              borderRadius: '0.35rem',
                              cursor: (isRestoring || isRestoringArchive) ? 'not-allowed' : 'pointer',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              transition: 'all 0.2s'
                            }}
                          >
                            📥 Download
                          </button>

                          <button
                            onClick={() => handleRestoreFromArchive(backup.filename)}
                            disabled={isRestoring || isRestoringArchive}
                            style={{
                              background: 'rgba(239,68,68,0.15)',
                              color: '#f87171',
                              border: '1px solid rgba(239,68,68,0.3)',
                              padding: '0.3rem 0.75rem',
                              borderRadius: '0.35rem',
                              cursor: (isRestoring || isRestoringArchive) ? 'not-allowed' : 'pointer',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              transition: 'all 0.2s'
                            }}
                          >
                            {isThisRestoring ? '⏳ Memulihkan...' : '🚀 Restore'}
                          </button>

                          <button
                            onClick={() => handleDeleteFile(backup.filename)}
                            disabled={isRestoring || isRestoringArchive}
                            style={{
                              background: 'rgba(255,255,255,0.05)',
                              color: '#94a3b8',
                              border: '1px solid rgba(255,255,255,0.1)',
                              padding: '0.3rem 0.75rem',
                              borderRadius: '0.35rem',
                              cursor: (isRestoring || isRestoringArchive) ? 'not-allowed' : 'pointer',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              transition: 'all 0.2s'
                            }}
                          >
                            🗑️ Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── Database Maps List Component ───────────────────────────────────────────────
const DatabaseMapsList = ({ showToast }) => {
  const [maps, setMaps] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination states
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const mapLoaderRef = useRef(null);

  // Roblox Online Search states
  const [robloxQuery, setRobloxQuery] = useState('');
  const [robloxResults, setRobloxResults] = useState([]);
  const [isSearchingRoblox, setIsSearchingRoblox] = useState(false);

  // Manual Add state
  const [manualName, setManualName] = useState('');
  const [isAddingMap, setIsAddingMap] = useState(false);

  // Sync Names state & function
  const [isSyncingNames, setIsSyncingNames] = useState(false);
  const handleSyncMapNames = async () => {
    if (!await window.customConfirm('Apakah Anda yakin ingin menyinkronkan seluruh nama map di database ke nama bahasa Inggris resmi? Tindakan ini akan memakan waktu beberapa detik karena memanggil Roblox API secara batch.')) {
      return;
    }
    setIsSyncingNames(true);
    try {
      const res = await fetchWithAuth('/api/maps/sync-names', {
        method: 'POST'
      });
      if (!res.ok) throw new Error('Gagal menyinkronkan nama map');
      const data = await res.json();
      showToast(`Berhasil menyinkronkan nama map! Diproses: ${data.total_processed}, Diperbarui: ${data.total_updated} ⚡`, 'success');
      setPage(1);
      fetchMaps(1, true);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsSyncingNames(false);
    }
  };

  const fetchMaps = async (currentPage = 1, isSearchChange = false) => {
    if (currentPage === 1) {
      setIsLoading(true);
    } else {
      setIsFetchingMore(true);
    }
    try {
      const limit = 20;
      const res = await fetchWithAuth(`/api/maps?search=${encodeURIComponent(searchQuery)}&page=${currentPage}&limit=${limit}`);
      if (!res.ok) throw new Error('Gagal memuat data map dari database');
      const data = await res.json();

      const fetchedData = Array.isArray(data.data) ? data.data : [];
      setMaps(prev => (currentPage === 1 || isSearchChange) ? fetchedData : [...prev, ...fetchedData]);
      setTotalPages(data.total_pages || 1);
      setTotalItems(data.total_items || 0);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsLoading(false);
      setIsFetchingMore(false);
    }
  };

  // Reset pagination when search query changes
  useEffect(() => {
    setPage(1);
    fetchMaps(1, true);
  }, [searchQuery]);

  // Fetch when page changes (only if page > 1 to avoid double fetching on mount)
  useEffect(() => {
    if (page > 1) {
      fetchMaps(page, false);
    }
  }, [page]);

  // Setup Intersection Observer for auto scroll pagination
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting) {
          if (page < totalPages && !isLoading && !isFetchingMore) {
            setPage(prev => prev + 1);
          }
        }
      },
      { threshold: 0.1 }
    );

    const currentLoader = mapLoaderRef.current;
    if (currentLoader) {
      observer.observe(currentLoader);
    }

    return () => {
      if (currentLoader) {
        observer.unobserve(currentLoader);
      }
    };
  }, [page, totalPages, isLoading, isFetchingMore]);

  const handleDeleteMap = async (id, name) => {
    if (!await window.customConfirm(`Apakah Anda yakin ingin menghapus map "${name}" dari database? Tindakan ini akan mengembalikan status pemetaan Co-Player ke string mentah.`)) {
      return;
    }
    try {
      const res = await fetchWithAuth(`/api/maps/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Gagal menghapus map');
      showToast('Map berhasil dihapus dari database! 🗑️', 'success');
      // Refresh current page list
      setPage(1);
      fetchMaps(1, true);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleAddMapManual = async (e) => {
    e.preventDefault();
    if (!manualName.trim()) return;
    setIsAddingMap(true);
    try {
      const res = await fetchWithAuth('/api/maps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: manualName.trim() })
      });
      if (!res.ok) throw new Error('Gagal menambahkan map');
      showToast('Map berhasil ditambahkan ke database! 🗺️', 'success');
      setManualName('');
      setPage(1);
      fetchMaps(1, true);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsAddingMap(false);
    }
  };

  const handleSearchRoblox = async (e) => {
    e.preventDefault();
    if (!robloxQuery.trim()) return;
    setIsSearchingRoblox(true);
    try {
      const res = await fetchWithAuth(`/api/maps/search-roblox?query=${encodeURIComponent(robloxQuery.trim())}`);
      if (!res.ok) throw new Error('Gagal mencari game di Roblox');
      const data = await res.json();
      setRobloxResults(Array.isArray(data) ? data : []);
      if (data.length === 0) {
        showToast('Tidak ada game ditemukan di Roblox untuk kata kunci tersebut.', 'info');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsSearchingRoblox(false);
    }
  };

  const handleAddRobloxGame = async (gameName) => {
    try {
      const res = await fetchWithAuth('/api/maps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: gameName })
      });
      if (!res.ok) throw new Error('Gagal menambahkan game Roblox');
      showToast(`Game "${gameName}" berhasil didaftarkan ke database! 🎮`, 'success');
      setPage(1);
      fetchMaps(1, true);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'fadeIn 0.3s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, color: '#fff', fontSize: '1.6rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🗺️ Database Map Roblox Terdaftar
          </h2>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Daftar map/game Roblox yang tersimpan di sistem untuk memetakan Co-Player dan mengumpulkan detail aktivitas.
          </span>
        </div>
        <button
          onClick={handleSyncMapNames}
          disabled={isSyncingNames}
          style={{
            background: isSyncingNames ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            color: isSyncingNames ? 'var(--text-muted)' : '#fff',
            border: 'none',
            padding: '0.6rem 1.2rem',
            borderRadius: '0.5rem',
            fontWeight: 'bold',
            fontSize: '0.85rem',
            cursor: isSyncingNames ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            boxShadow: isSyncingNames ? 'none' : '0 4px 10px rgba(59,130,246,0.2)'
          }}
        >
          {isSyncingNames ? '⏳ Mensinkronisasi...' : '⚡ Sync Nama Map ke Global (Inggris)'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '1.5rem', alignItems: 'start' }}>
        {/* Left Side: DB Maps Table */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="search-container" style={{ maxWidth: '350px', width: '100%' }}>
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Cari map terdaftar di DB..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.6rem 2.5rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--border)',
                  background: 'rgba(0,0,0,0.2)',
                  color: '#fff',
                  fontSize: '0.9rem'
                }}
              />
            </div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Total Map Terdaftar: <strong>{totalItems}</strong>
            </span>
          </div>

          <div style={{ overflowX: 'auto', maxHeight: '550px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>ID</th>
                  <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Nama Map</th>
                  <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Universe ID</th>
                  <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Place ID / Redirect</th>
                  <th style={{ padding: '1rem', color: 'var(--text-muted)', textAlign: 'right' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && page === 1 ? (
                  <tr>
                    <td colSpan="5" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Memuat database map...
                    </td>
                  </tr>
                ) : maps.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Tidak ada map ditemukan di database.
                    </td>
                  </tr>
                ) : (
                  <>
                    {maps.map((m) => (
                      <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.01)'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                        <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>#{m.id}</td>
                        <td style={{ padding: '1rem', color: '#fff', fontWeight: 600 }}>
                          📍 {m.name}
                        </td>
                        <td style={{ padding: '1rem' }}>
                          {m.universe_id ? (
                            <span style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.8rem', border: '1px solid rgba(59,130,246,0.2)' }}>
                              {m.universe_id}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Belum Ditautkan</span>
                          )}
                        </td>
                        <td style={{ padding: '1rem' }}>
                          {m.place_id ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.8rem', border: '1px solid rgba(16,185,129,0.2)' }}>
                                {m.place_id}
                              </span>
                              <a href={`https://www.roblox.com/games/${m.place_id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#fbbf24', textDecoration: 'none', fontSize: '0.8rem' }} title="Buka Game Resmi di Roblox">
                                🔗 Buka Game
                              </a>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Belum Ditautkan</span>
                          )}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right' }}>
                          <button
                            onClick={() => handleDeleteMap(m.id, m.name)}
                            style={{
                              background: 'rgba(239,68,68,0.15)',
                              color: '#f87171',
                              border: '1px solid rgba(239,68,68,0.3)',
                              padding: '0.25rem 0.6rem',
                              borderRadius: '0.35rem',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              transition: 'all 0.2s'
                            }}
                          >
                            🗑️ Hapus
                          </button>
                        </td>
                      </tr>
                    ))}
                    {page < totalPages && (
                      <tr ref={mapLoaderRef}>
                        <td colSpan="5" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.01)' }}>
                          {isFetchingMore ? '⏳ Memuat lebih banyak map...' : '📜 Gulir ke bawah untuk memuat lebih banyak'}
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Side: Add Forms */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Add Manual Card */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1.25rem' }}>
            <h4 style={{ margin: '0 0 1rem 0', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              ➕ Tambah Map Manual
            </h4>
            <form onSubmit={handleAddMapManual} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <input
                type="text"
                placeholder="Nama Map (contoh: Cidro Janji)"
                value={manualName}
                onChange={e => setManualName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.6rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--border)',
                  background: 'rgba(0,0,0,0.2)',
                  color: '#fff',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              />
              <button
                type="submit"
                disabled={isAddingMap || !manualName.trim()}
                style={{
                  width: '100%',
                  background: manualName.trim() ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'rgba(255,255,255,0.05)',
                  color: manualName.trim() ? '#fff' : 'var(--text-muted)',
                  border: 'none',
                  padding: '0.6rem',
                  borderRadius: '0.5rem',
                  fontWeight: 'bold',
                  fontSize: '0.85rem',
                  cursor: manualName.trim() ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s'
                }}
              >
                {isAddingMap ? 'Menambahkan...' : 'Daftarkan Map'}
              </button>
            </form>
          </div>

          {/* Search Roblox Online Card */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1.25rem' }}>
            <h4 style={{ margin: '0 0 0.25rem 0', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🔍 Cari Game di Roblox
            </h4>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '1rem' }}>
              Cari game resmi secara online lewat Roblox API dan langsung tambahkan ke database lokal.
            </span>
            <form onSubmit={handleSearchRoblox} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <input
                type="text"
                placeholder="Cari game Roblox..."
                value={robloxQuery}
                onChange={e => setRobloxQuery(e.target.value)}
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--border)',
                  background: 'rgba(0,0,0,0.2)',
                  color: '#fff',
                  fontSize: '0.85rem',
                  outline: 'none'
                }}
              />
              <button
                type="submit"
                disabled={isSearchingRoblox || !robloxQuery.trim()}
                style={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  color: '#fff',
                  border: 'none',
                  padding: '0.5rem 0.85rem',
                  borderRadius: '0.5rem',
                  fontWeight: 'bold',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {isSearchingRoblox ? '⏳' : 'Cari'}
              </button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto', paddingRight: '0.25rem' }}>
              {robloxResults.length > 0 ? (
                robloxResults.map((r, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(255,255,255,0.03)',
                      padding: '0.5rem',
                      borderRadius: '0.5rem',
                      border: '1px solid rgba(255,255,255,0.02)'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, marginRight: '0.5rem', overflow: 'hidden' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }} title={r.name}>
                        {r.name}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        Creator: {r.creatorName || 'Unknown'}
                      </span>
                    </div>
                    <button
                      onClick={() => handleAddRobloxGame(r.name)}
                      style={{
                        background: 'rgba(16,185,129,0.15)',
                        color: '#34d399',
                        border: '1px solid rgba(16,185,129,0.3)',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '0.35rem',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: 'bold'
                      }}
                    >
                      ➕
                    </button>
                  </div>
                ))
              ) : robloxQuery.trim() && !isSearchingRoblox ? (
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem 0' }}>
                  Tidak ada hasil pencarian online.
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const SystemSettingsPanel = ({ showToast, onConfigUpdate }) => {
  const [settings, setSettings] = useState({
    app_name: 'Co-Play Capsule',
    enable_registration: true,
    require_admin_approval: true,
    shadow_activity_threshold: 20,
    discord_webhook_url: '',
    maintenance_mode: false,
    global_roblox_cookie: ''
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetchWithAuth('/api/admin/settings');
        if (!res.ok) throw new Error('Gagal mengambil pengaturan sistem');
        const data = await res.json();
        setSettings(data);
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, [showToast]);

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetchWithAuth('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan pengaturan');
      showToast('Pengaturan sistem berhasil diperbarui', 'success');
      
      if (onConfigUpdate) {
        onConfigUpdate(settings);
      }
      
      // If cookie changed, refresh display value
      if (settings.global_roblox_cookie && settings.global_roblox_cookie !== '********') {
        setSettings(prev => ({ ...prev, global_roblox_cookie: '********' }));
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
        ⏳ Memuat pengaturan sistem...
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--bg-card)', padding: '2rem', borderRadius: '0.75rem', border: '1px solid var(--border)', maxWidth: '600px', margin: '0 auto' }}>
      <h3 style={{ color: '#fff', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>⚙️ Pengaturan Global Sistem</h3>
      
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* Nama Aplikasi */}
        <div>
          <label style={{ fontWeight: '600', color: '#fff', display: 'block', marginBottom: '0.25rem' }}>Nama Aplikasi (Website Name)</label>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>Nama sistem/situs web yang ditampilkan di header, tab browser, dan halaman masuk.</span>
          <input
            type="text"
            value={settings.app_name || ''}
            onChange={e => handleChange('app_name', e.target.value)}
            style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)', color: '#fff' }}
            required
          />
        </div>

        {/* Pendaftaran Registrasi */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <label style={{ fontWeight: '600', color: '#fff', display: 'block', marginBottom: '0.25rem' }}>Pendaftaran Pengguna Baru</label>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Izinkan pengunjung mendaftarkan akun baru secara mandiri.</span>
          </div>
          <button
            type="button"
            onClick={() => handleChange('enable_registration', !settings.enable_registration)}
            style={{
              width: '50px',
              height: '26px',
              borderRadius: '13px',
              background: settings.enable_registration ? '#22c55e' : '#334155',
              border: 'none',
              position: 'relative',
              cursor: 'pointer',
              transition: 'all 0.3s'
            }}
          >
            <div style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              background: '#fff',
              position: 'absolute',
              top: '3px',
              left: settings.enable_registration ? '27px' : '3px',
              transition: 'all 0.3s'
            }} />
          </button>
        </div>

        {/* Butuh Approval Admin */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <label style={{ fontWeight: '600', color: '#fff', display: 'block', marginBottom: '0.25rem' }}>Persetujuan Admin Mandatori</label>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Setiap pengguna baru yang terdaftar wajib disetujui admin sebelum bisa masuk.</span>
          </div>
          <button
            type="button"
            onClick={() => handleChange('require_admin_approval', !settings.require_admin_approval)}
            style={{
              width: '50px',
              height: '26px',
              borderRadius: '13px',
              background: settings.require_admin_approval ? '#22c55e' : '#334155',
              border: 'none',
              position: 'relative',
              cursor: 'pointer',
              transition: 'all 0.3s'
            }}
          >
            <div style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              background: '#fff',
              position: 'absolute',
              top: '3px',
              left: settings.require_admin_approval ? '27px' : '3px',
              transition: 'all 0.3s'
            }} />
          </button>
        </div>

        {/* Mode Pemeliharaan */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <label style={{ fontWeight: '600', color: '#fff', display: 'block', marginBottom: '0.25rem' }}>Mode Pemeliharaan (Maintenance)</label>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Batasi login sistem hanya untuk administrator.</span>
          </div>
          <button
            type="button"
            onClick={() => handleChange('maintenance_mode', !settings.maintenance_mode)}
            style={{
              width: '50px',
              height: '26px',
              borderRadius: '13px',
              background: settings.maintenance_mode ? '#eab308' : '#334155',
              border: 'none',
              position: 'relative',
              cursor: 'pointer',
              transition: 'all 0.3s'
            }}
          >
            <div style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              background: '#fff',
              position: 'absolute',
              top: '3px',
              left: settings.maintenance_mode ? '27px' : '3px',
              transition: 'all 0.3s'
            }} />
          </button>
        </div>

        {/* Shadow Activity Threshold */}
        <div>
          <label style={{ fontWeight: '600', color: '#fff', display: 'block', marginBottom: '0.25rem' }}>Ambang Batas Deteksi Siluman (Menit)</label>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>Durasi minimum offline sebelum avatar berubah dianggap siluman.</span>
          <input
            type="number"
            min="1"
            value={settings.shadow_activity_threshold}
            onChange={e => handleChange('shadow_activity_threshold', parseInt(e.target.value, 10))}
            style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)', color: '#fff' }}
            required
          />
        </div>

        {/* Discord Webhook */}
        <div>
          <label style={{ fontWeight: '600', color: '#fff', display: 'block', marginBottom: '0.25rem' }}>Discord Webhook URL</label>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>Kirim log perubahan status teman ke channel Discord Anda secara realtime.</span>
          <input
            type="url"
            placeholder="https://discord.com/api/webhooks/..."
            value={settings.discord_webhook_url || ''}
            onChange={e => handleChange('discord_webhook_url', e.target.value)}
            style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)', color: '#fff' }}
          />
        </div>

        {/* Global Roblox Cookie */}
        <div>
          <label style={{ fontWeight: '600', color: '#fff', display: 'block', marginBottom: '0.25rem' }}>Global Roblox Cookie (.ROBLOSECURITY)</label>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>Cookie cadangan sistem jika pengguna tidak memasang cookie kustom sendiri.</span>
          <input
            type="password"
            placeholder="Masukkan cookie Roblox..."
            value={settings.global_roblox_cookie || ''}
            onChange={e => handleChange('global_roblox_cookie', e.target.value)}
            style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)', color: '#fff' }}
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSaving}
          style={{
            marginTop: '1rem',
            padding: '0.75rem',
            borderRadius: '0.5rem',
            background: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)',
            color: '#000',
            border: 'none',
            fontWeight: 'bold',
            cursor: isSaving ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s'
          }}
        >
          {isSaving ? '⏳ Menyimpan...' : '💾 Simpan Pengaturan'}
        </button>

      </form>
    </div>
  );
};

export default AdminDashboard;
