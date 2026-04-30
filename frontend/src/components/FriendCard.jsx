import React from 'react';

const FriendCard = ({ friend, onClickLog, onClickProfileLog }) => {
  const getStatusClass = (status) => {
    switch(status) {
      case 'Online': return 'status-online';
      case 'In-Game': return 'status-ingame';
      case 'In-Studio': return 'status-instudio';
      default: return 'status-offline';
    }
  };

  const isRemoved = friend.status === 'removed';

  return (
    <div className="friend-card" style={{ opacity: isRemoved ? 0.6 : 1, filter: isRemoved ? 'grayscale(80%)' : 'none' }}>
      <div className="card-header-v2">
        {friend.avatar_url ? (
          <img src={friend.avatar_url} alt="Avatar" className="avatar-img" />
        ) : (
          <div className="avatar-img" style={{ background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ?
          </div>
        )}
        
        <div style={{ flex: 1 }}>
          <div className="username" style={{ textDecoration: isRemoved ? 'line-through' : 'none' }}>
            {friend.friend_display_name || friend.friend_username}
          </div>
          {friend.friend_display_name && friend.friend_display_name !== friend.friend_username && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>@{friend.friend_username}</div>
          )}
          <div className="user-id">ID: {friend.friend_roblox_id}</div>
        </div>
      </div>

      <div className="tags">
        {friend.is_new && !isRemoved && <span className="badge badge-new" style={{ background: '#3b82f6', color: '#fff', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem' }}>Baru</span>}
        {isRemoved && <span className="badge badge-deleted" style={{ background: '#ef4444', color: '#fff', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem' }}>Dihapus</span>}
      </div>
      
      {!isRemoved && (
        <>
          <div className={`status-badge ${getStatusClass(friend.current_presence)}`}>
            <div className="status-indicator"></div>
            <span>{friend.current_presence || 'Offline'}</span>
          </div>

          {(friend.current_presence === 'In-Game' || friend.current_presence === 'In-Studio') && (
            <div className="game-info">
              🎮 {friend.current_game_name || 'Private / Hidden Game'}
            </div>
          )}
        </>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        <button 
          onClick={() => onClickLog(friend)}
          style={{ flex: 1, padding: '0.4rem', borderRadius: '0.4rem', border: '1px solid #334155', background: 'transparent', color: '#60a5fa', cursor: 'pointer' }}
        >
          Activity Log
        </button>
        <button 
          onClick={() => onClickProfileLog(friend)}
          style={{ flex: 1, padding: '0.4rem', borderRadius: '0.4rem', border: '1px solid #334155', background: 'transparent', color: '#a78bfa', cursor: 'pointer' }}
        >
          Profile Changes
        </button>
      </div>
    </div>
  );
};

export default FriendCard;
