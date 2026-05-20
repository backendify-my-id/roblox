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

  const fetchInitialData = async () => {
    setIsLoading(true);
    try {
      const [actRes, profRes, friendsRes, trackersRes] = await Promise.all([
        fetchWithAuth(`/api/admin/users/${selectedUser.id}/logs?offset=0`),
        fetchWithAuth(`/api/admin/users/${selectedUser.id}/profile-changes?offset=0`),
        fetchWithAuth(`/api/admin/users/${selectedUser.id}/friends?offset=0`),
        fetchWithAuth(`/api/admin/users/${selectedUser.id}/tracked-by`)
      ]);

      if (actRes.ok) {
        const d = await actRes.json();
        const logs = Array.isArray(d) ? d : [];
        if (logs.length < 100) setHasMoreActivity(false);
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
    const newOffset = activityOffset + 100;
    try {
      const res = await fetchWithAuth(`/api/admin/users/${selectedUser.id}/logs?offset=${newOffset}`);
      if (res.ok) {
        const d = await res.json();
        const logs = Array.isArray(d) ? d : [];
        if (logs.length < 100) setHasMoreActivity(false);
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

  return (
    <div className="app-container">
      <div className="header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ background: 'linear-gradient(to right, #ef4444, #f59e0b)', WebkitBackgroundClip: 'text', color: 'transparent', fontSize: '2.5rem', margin: 0 }}>
            Admin Panel
          </h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Manajemen Pengguna & Database Sistem
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {user.role === 'admin' && (
            <button
              onClick={handleBackup}
              style={{ background: '#10b981', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              💾 Backup DB
            </button>
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
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
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
                    <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>Status Kehadiran</th>
                    <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>Mode Siluman</th>
                    <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Teman</th>
                    <th style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>Dibuat Pada</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Tidak ada data ditemukan</td>
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
      ) : (
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
)}

      {selectedUser && (
        <UserDetailModal selectedUser={selectedUser} onClose={() => setSelectedUser(null)} showToast={showToast} />
      )}
    </div>
  );
};

export default AdminDashboard;
