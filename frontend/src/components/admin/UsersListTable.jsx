import React from 'react';
import { fetchWithAuth } from '../../utils/api';

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

const UsersListTable = ({
  users,
  isLoading,
  isFetchingMore,
  searchQuery,
  setSearchQuery,
  roleFilter,
  setRoleFilter,
  presenceFilter,
  setPresenceFilter,
  totalItems,
  currentPage,
  totalPages,
  loaderRef,
  hasManagePermissions,
  setSelectedUser,
  showToast,
  setUsers
}) => {
  return (
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
  );
};

export default UsersListTable;
