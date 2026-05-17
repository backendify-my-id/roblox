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

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetchWithAuth('/api/admin/users');
        if (!res.ok) throw new Error('Gagal memuat data pengguna');
        const data = await res.json();
        setUsers(data);
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        setIsLoading(false);
      }
    };
    fetchUsers();
  }, [showToast]);

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
          <button
            onClick={handleBackup}
            style={{ background: '#10b981', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            💾 Backup DB
          </button>
          <button
            onClick={onBack}
            style={{ background: 'var(--bg-card)', color: '#fff', border: '1px solid var(--border)', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer' }}
          >
            &larr; Kembali ke Dashboard
          </button>
        </div>
      </div>

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
                    <td style={{ padding: '1rem' }}>
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

      {selectedUser && (
        <UserDetailModal selectedUser={selectedUser} onClose={() => setSelectedUser(null)} showToast={showToast} />
      )}
    </div>
  );
};

export default AdminDashboard;
