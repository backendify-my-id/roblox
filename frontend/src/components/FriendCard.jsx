import React from 'react';

const FriendCard = ({ friend, onClickLog }) => {
  const getStatusClass = (status) => {
    switch(status) {
      case 'Online': return 'status-online';
      case 'In-Game': return 'status-ingame';
      case 'In-Studio': return 'status-instudio';
      default: return 'status-offline';
    }
  };

  return (
    <div className="friend-card" onClick={() => onClickLog(friend)}>
      <div className="card-header-v2">
        {friend.avatar_url ? (
          <img src={friend.avatar_url} alt="Avatar" className="avatar-img" />
        ) : (
          <div className="avatar-img" style={{ background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ?
          </div>
        )}
        
        <div style={{ flex: 1 }}>
          <div className="username">
            {friend.friend_display_name || friend.friend_username}
          </div>
          {friend.friend_display_name && friend.friend_display_name !== friend.friend_username && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>@{friend.friend_username}</div>
          )}
          <div className="user-id">ID: {friend.friend_roblox_id}</div>
        </div>
      </div>

      <div className="tags">
        {friend.is_new_friend && <span className="badge badge-new">Baru</span>}
        {friend.is_deleted && <span className="badge badge-deleted">Dihapus</span>}
      </div>
      
      <div className={`status-badge ${getStatusClass(friend.current_status)}`}>
        <div className="status-indicator"></div>
        <span>{friend.current_status || 'Offline'}</span>
      </div>

      {(friend.current_status === 'In-Game' || friend.current_status === 'In-Studio') && (
        <div className="game-info">
          🎮 {friend.current_game || 'Private / Hidden Game'}
        </div>
      )}
    </div>
  );
};

export default FriendCard;
