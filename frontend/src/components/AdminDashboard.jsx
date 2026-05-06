import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../utils/api';

// ─── User Detail Modal ────────────────────────────────────────────────────────
const UserDetailModal = ({ selectedUser, onClose }) => {
  const [activeTab, setActiveTab] = useState('activity');
  const [activityLogs, setActivityLogs] = useState([]);
  const [profileLogs, setProfileLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [actRes, profRes] = await Promise.all([
          fetchWithAuth(`/api/admin/users/${selectedUser.id}/logs`),
          fetchWithAuth(`/api/admin/users/${selectedUser.id}/profile-changes`)
        ]);
        if (actRes.ok) {
          const d = await actRes.json();
          setActivityLogs(Array.isArray(d) ? d : []);
        }
        if (profRes.ok) {
          const d = await profRes.json();
          setProfileLogs(Array.isArray(d) ? d : []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [selectedUser.id]);

  const tabs = [
    { key: 'activity', label: `📋 Activity Log (${activityLogs.length})` },
    { key: 'profile', label: `🔄 Perubahan Profil (${profileLogs.length})` },
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
            )
          ) : (
            profileLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Belum ada riwayat perubahan profil.</div>
            ) : (
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

  const filteredUsers = users.filter(u => 
    u.roblox_username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.roblox_display_name && u.roblox_display_name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

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
            onClick={onBack}
            style={{ background: 'var(--bg-card)', color: '#fff', border: '1px solid var(--border)', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer' }}
          >
            &larr; Kembali ke Dashboard
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="search-container" style={{ maxWidth: '400px', flex: 1 }}>
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
        <UserDetailModal selectedUser={selectedUser} onClose={() => setSelectedUser(null)} />
      )}
    </div>
  );
};

export default AdminDashboard;
