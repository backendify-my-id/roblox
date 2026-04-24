import React from 'react';

const TargetCard = ({ target, onClick, onDelete }) => {
  const lastSynced = new Date(target.last_synced);
  const isRecentlySynced = (Date.now() - lastSynced.getTime()) < 5 * 60 * 1000;

  return (
    <div className="friend-card" onClick={() => onClick(target)} style={{ cursor: 'pointer', position: 'relative' }}>
      <button 
        className="btn-delete" 
        onClick={(e) => {
          e.stopPropagation();
          if(window.confirm(`Hapus target ${target.roblox_username} dan semua datanya?`)) {
            onDelete(target.id);
          }
        }}
        title="Hapus Target"
        style={{ zIndex: 10 }}
      >
        &times;
      </button>

      <div className="card-header-v2">
        {target.avatar_url ? (
          <img src={target.avatar_url} alt="Avatar" className="avatar-img" style={{ width: 56, height: 56 }} />
        ) : (
          <div className="avatar-img" style={{ width: 56, height: 56, background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
            👤
          </div>
        )}
        <div style={{ flex: 1 }}>
          <div className="username">
            {target.roblox_display_name || target.roblox_username}
          </div>
          {target.roblox_display_name && target.roblox_display_name !== target.roblox_username && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>@{target.roblox_username}</div>
          )}
          <div className="user-id">ID: {target.roblox_user_id}</div>
        </div>
      </div>

      <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          👥 <strong style={{ color: 'var(--text-main)' }}>{target.friend_count}</strong> teman terlacak
        </div>
        <div style={{
          fontSize: '0.75rem',
          padding: '0.2rem 0.5rem',
          borderRadius: '9999px',
          background: isRecentlySynced ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.15)',
          color: isRecentlySynced ? '#22c55e' : 'var(--text-muted)',
        }}>
          {target.last_synced && lastSynced.getFullYear() > 2000
            ? (isRecentlySynced ? '● Live' : `Synced ${lastSynced.toLocaleTimeString()}`)
            : 'Belum disync'}
        </div>
      </div>
    </div>
  );
};

export default TargetCard;
