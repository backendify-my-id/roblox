import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../utils/api';

// ─── User Detail Modal ────────────────────────────────────────────────────────
const UserDetailModal = ({ selectedUser, onClose, showToast }) => {
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
  // Filter logs for the last 7 days (rolling window)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const filteredLogs = activityLogs.filter(log => new Date(log.created_at) >= sevenDaysAgo);
  const totalUserLogs = filteredLogs.length;

  // 1. Status Breakdown
  const userStatusCounts = filteredLogs.reduce((acc, log) => {
    acc[log.status] = (acc[log.status] || 0) + 1;
    return acc;
  }, {});

  // 2. Most Played Games
  const userGameCounts = filteredLogs.reduce((acc, log) => {
    if (log.status === 'In-Game' && log.game_name) {
      acc[log.game_name] = (acc[log.game_name] || 0) + 1;
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
        const endTime = new Date(log.created_at);
        const diffMs = endTime - currentInGameStart;
        const diffMins = Math.round(diffMs / 60000);
        const finalMins = Math.min(diffMins, 180);
        if (finalMins > 0) {
          const day = currentInGameStart.getDay();
          userDayPlayMinutes[day] += finalMins;
        }
        currentInGameStart = null;
      }
    }
  }
  if (currentInGameStart !== null) {
    const diffMs = new Date() - currentInGameStart;
    const diffMins = Math.round(diffMs / 60000);
    const finalMins = Math.min(Math.max(diffMins, 0), 180);
    if (finalMins > 0) {
      const day = currentInGameStart.getDay();
      userDayPlayMinutes[day] += finalMins;
    }
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
    { key: 'analytics', label: `📊 Analisis Tren` },
    { key: 'profile', label: `🔄 Perubahan Profil` },
    { key: 'friends', label: `👥 Teman (${selectedUser.friends_count || 0})` },
    { key: 'trackers', label: `👁️ Dilacak Oleh (${trackersList.length})` },
  ];

  return (
    <div className="modal-overlay" onClick={onClose} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ background: '#1e293b', width: '90%', maxWidth: '750px', borderRadius: '1rem', padding: '1.5rem', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {selectedUser.avatar_url ? (
              <img src={selectedUser.avatar_url} alt="" style={{ width: 48, height: 48, borderRadius: '50%', border: '2px solid #3b82f6' }} />
            ) : (
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#334155' }} />
            )}
            <div>
              <h2 style={{ fontSize: '1.3rem', margin: 0 }}>{selectedUser.roblox_display_name || selectedUser.roblox_username}</h2>
              <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.85rem' }}>@{selectedUser.roblox_username} · ID: {selectedUser.roblox_user_id}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1.25rem' }}>
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
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '0.5rem',
                border: activeTab === tab.key ? '1px solid #3b82f6' : '1px solid transparent',
                background: activeTab === tab.key ? 'rgba(59,130,246,0.15)' : 'transparent',
                color: activeTab === tab.key ? '#60a5fa' : 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.85rem',
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
                <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #334155', textAlign: 'left' }}>
                      <th style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Waktu</th>
                      <th style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Status</th>
                      <th style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Game</th>
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
                        <td style={{ padding: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{log.game_name || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
          ) : (
            trackersList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Pengguna ini belum dilacak oleh siapa pun.</div>
            ) : (
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
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '0.5rem', fontSize: '0.9rem' }}>
                        <span style={{
                          padding: '0.2rem 0.5rem', borderRadius: '0.5rem', fontSize: '0.8rem',
                          background: t.role_name === 'Synced Friend' ? 'rgba(100,116,139,0.15)' : 'rgba(59,130,246,0.15)',
                          color: t.role_name === 'Synced Friend' ? '#94a3b8' : '#60a5fa'
                        }}>
                          {t.role_name}
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
            )
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
const AdminDashboard = ({ user, onBack, showToast }) => {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [presenceFilter, setPresenceFilter] = useState('All');
  const [selectedUser, setSelectedUser] = useState(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const hasViewUsers = user.role === 'admin' || (user.permissions && user.permissions.includes('view_users_list'));
  const hasViewCoPlayers = user.role === 'admin' || (user.permissions && user.permissions.includes('view_playing_together'));
  const hasViewShadow = user.role === 'admin' || (user.permissions && user.permissions.includes('view_shadow_activities'));
  const hasManagePermissions = user.role === 'admin' || (user.permissions && user.permissions.includes('manage_user_permissions'));
  const hasReviewShadow = user.role === 'admin' || (user.permissions && user.permissions.includes('review_shadow_activities'));

  // Co-Players State
  const [activeView, setActiveView] = useState(() => {
    if (hasViewUsers) return 'users';
    if (hasViewCoPlayers) return 'co-players';
    if (hasViewShadow) return 'shadow';
    return 'users';
  });
  const [coPlayingGroups, setCoPlayingGroups] = useState([]);
  const [isLoadingCoPlayers, setIsLoadingCoPlayers] = useState(false);

  // Shadow Activity State
  const [shadowActivities, setShadowActivities] = useState([]);
  const [isLoadingShadow, setIsLoadingShadow] = useState(false);
  const [shadowSearchQuery, setShadowSearchQuery] = useState('');
  const [shadowVisibleCount, setShadowVisibleCount] = useState(6);

  useEffect(() => {
    if (!hasViewUsers) {
      // Pengguna tidak punya akses ke daftar user — skip fetch, langsung selesai loading
      setIsLoading(false);
      return;
    }
    const fetchUsers = async () => {
      try {
        const res = await fetchWithAuth('/api/admin/users');
        if (!res.ok) throw new Error('Gagal memuat data pengguna');
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : []);
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        setIsLoading(false);
      }
    };
    fetchUsers();
  }, [showToast, hasViewUsers]);

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

  useEffect(() => {
    if (activeView === 'co-players') {
      fetchCoPlayers();
    } else if (activeView === 'shadow') {
      fetchShadowActivities();
    } else if (activeView === 'analytics') {
      fetchCoPlayers();
      fetchShadowActivities();
    }
  }, [activeView]);

  const filteredUsers = users.filter(u => {
    const matchSearch = u.roblox_username.toLowerCase().includes(searchQuery.toLowerCase()) || (u.roblox_display_name && u.roblox_display_name.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchRole = roleFilter === 'All' || u.role_name === roleFilter;

    // In Roblox Presence, Offline might be literal 'Offline' or could be empty. We check explicitly.
    // Assuming status are literal strings like 'Online', 'Offline', 'In-Game', 'In-Studio'.
    const matchPresence = presenceFilter === 'All' || u.current_presence === presenceFilter;

    return matchSearch && matchRole && matchPresence;
  });

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
      a.download = `roblox_tracker_backup_${new Date().toISOString().slice(0,10)}.sql`;
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

    const confirmRestore = window.confirm(
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
  const totalUsers = users.length;
  const registeredUsers = users.filter(u => u.is_registered).length;
  const stealthCount = users.filter(u => u.is_stealth).length;
  const totalShadows = shadowActivities.length;
  const reviewedShadows = shadowActivities.filter(a => a.is_reviewed).length;
  const pendingShadows = totalShadows - reviewedShadows;

  // Active presence breakdown
  const presenceCounts = users.reduce((acc, u) => {
    acc[u.current_presence] = (acc[u.current_presence] || 0) + 1;
    return acc;
  }, {});

  // Role breakdown
  const roleCounts = users.reduce((acc, u) => {
    if (u.is_registered) {
      acc[u.role_name] = (acc[u.role_name] || 0) + 1;
    }
    return acc;
  }, {});

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

  // Month-by-month Registration Growth (using user.created_at "2026-05-24 15:29:10")
  const monthlyRegs = {};
  users.forEach(u => {
    if (u.created_at && u.is_registered) {
      const datePart = u.created_at.split(' ')[0]; // "2026-05-24"
      const monthStr = datePart.substring(0, 7); // "2026-05"
      monthlyRegs[monthStr] = (monthlyRegs[monthStr] || 0) + 1;
    }
  });
  const sortedRegs = Object.entries(monthlyRegs)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6); // last 6 months
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
        <div className="admin-header-actions">
          {user.role === 'admin' && (
            <>
              <button
                onClick={handleBackup}
                style={{ background: '#10b981', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                💾 Backup DB
              </button>
              <label
                style={{
                  background: '#3b82f6',
                  color: '#fff',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  cursor: isRestoring ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  opacity: isRestoring ? 0.7 : 1
                }}
              >
                📂 {isRestoring ? 'Memulihkan...' : 'Restore DB'}
                <input
                  type="file"
                  accept=".sql"
                  onChange={handleRestore}
                  disabled={isRestoring}
                  style={{ display: 'none' }}
                />
              </label>
            </>
          )}
          <button
            onClick={onBack}
            style={{ background: 'var(--bg-card)', color: '#fff', border: '1px solid var(--border)', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer' }}
          >
            &larr; Kembali ke Dashboard
          </button>
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
              Total Data: <strong>{filteredUsers.length}</strong>
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
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Tidak ada data ditemukan</td>
                    </tr>
                  ) : (
                    filteredUsers.map(u => (
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
                                   showToast(`Peran ${u.roblox_username} berhasil diubah menjadi ${newRole}`, 'success');
                                   setUsers(prev => prev.map(usr => usr.id === u.id ? { ...usr, role_name: newRole } : usr));
                                 } catch (err) {
                                   showToast(err.message, 'error');
                                 }
                               }}
                               style={{
                                 background: 'rgba(0,0,0,0.3)',
                                 border: '1px solid var(--border)',
                                 color: '#fff',
                                 padding: '0.2rem 0.5rem',
                                 borderRadius: '0.4rem',
                                 fontSize: '0.85rem',
                                 cursor: 'pointer'
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
                               background: u.is_registered ? 'rgba(59,130,246,0.15)' : 'rgba(100,116,139,0.15)',
                               color: u.is_registered ? '#60a5fa' : '#94a3b8',
                               border: `1px solid ${u.is_registered ? 'rgba(59,130,246,0.3)' : 'rgba(100,116,139,0.3)'}`
                             }}>
                               {u.role_name}
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
        </>
      ) : activeView === 'co-players' ? (
        // Co-Players View
        <div>
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
                              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>
                                {p.roblox_display_name || p.roblox_username}
                              </span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                @{p.roblox_username}
                              </span>
                            </div>
                          </div>
                          <span style={{
                            fontSize: '0.7rem',
                            padding: '0.15rem 0.4rem',
                            borderRadius: '0.25rem',
                            background: p.role_name === 'admin' ? 'rgba(239, 68, 68, 0.15)' :
                                        p.role_name === 'user' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                            color: p.role_name === 'admin' ? '#f87171' :
                                   p.role_name === 'user' ? '#60a5fa' : '#94a3b8',
                            border: `1px solid ${p.role_name === 'admin' ? 'rgba(239,68,68,0.2)' :
                                                   p.role_name === 'user' ? 'rgba(59,130,246,0.2)' : 'rgba(148,163,184,0.2)'}`
                          }}>
                            {p.role_name}
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
                        Pengguna mengubah kosmetik avatar Roblox secara real-time saat terdaftar <strong>Offline</strong>. Disimpulkan sedang bermain siluman.
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
      ) : activeView === 'logs' ? (
        <SystemLogViewer showToast={showToast} />
      ) : null}

      {selectedUser && (
        <UserDetailModal selectedUser={selectedUser} onClose={() => setSelectedUser(null)} showToast={showToast} />
      )}
    </div>
  );
};

// ─── System Log Viewer Component ────────────────────────────────────────────────
const SystemLogViewer = ({ showToast }) => {
  const [logFiles, setLogFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [logContent, setLogContent] = useState('');
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState('ALL');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const terminalEndRef = React.useRef(null);

  const fetchLogFiles = async () => {
    setIsLoadingFiles(true);
    try {
      const res = await fetchWithAuth('/api/admin/logs/files');
      if (!res.ok) throw new Error('Gagal memuat daftar file log');
      const data = await res.json();
      setLogFiles(Array.isArray(data) ? data : []);
      if (data.length > 0 && !selectedFile) {
        setSelectedFile(data[0]); // Select today's log by default
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
    if (!autoRefresh || !selectedFile) return;
    const interval = setInterval(() => {
      fetchLogContent(selectedFile);
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, selectedFile]);

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
            Auto-Refresh (5s)
          </label>
        </div>
      </div>

      {/* Select Box and Filter bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Pilih File Log:</label>
          <select 
            value={selectedFile} 
            onChange={(e) => setSelectedFile(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', background: '#1e293b', border: '1px solid var(--border)', color: '#fff', fontSize: '0.85rem' }}
          >
            {isLoadingFiles ? (
              <option>Memuat file...</option>
            ) : logFiles.length === 0 ? (
              <option>Tidak ada file log ditemukan</option>
            ) : (
              logFiles.map(file => (
                <option key={file} value={file}>{file}</option>
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

export default AdminDashboard;
