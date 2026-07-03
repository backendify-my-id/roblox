import React, { useState } from 'react';

const FriendCard = ({ friend, showDisplayNames = true, onClickLog, onClickProfileLog, onSaveNote }) => {
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteText, setNoteText] = useState(friend.note || '');

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
          {showDisplayNames ? (
            <>
              <div className="username" style={{ textDecoration: isRemoved ? 'line-through' : 'none' }}>
                {friend.friend_display_name || friend.friend_username}
              </div>
              {friend.friend_display_name && friend.friend_display_name !== friend.friend_username && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>@{friend.friend_username}</div>
              )}
            </>
          ) : (
            <>
              <div className="username" style={{ textDecoration: isRemoved ? 'line-through' : 'none' }}>
                @{friend.friend_username}
              </div>
              {friend.friend_display_name && friend.friend_display_name !== friend.friend_username && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{friend.friend_display_name}</div>
              )}
            </>
          )}
          <div className="user-id">
            ID: <a href={`https://www.roblox.com/users/${friend.friend_roblox_id}/profile`} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', textDecoration: 'none', transition: 'color 0.2s' }} onMouseOver={e => e.currentTarget.style.textDecoration = 'underline'} onMouseOut={e => e.currentTarget.style.textDecoration = 'none'}>{friend.friend_roblox_id}</a>
          </div>
        </div>
      </div>

      <div className="tags" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
        {friend.is_new && !isRemoved && <span className="badge badge-new" style={{ background: '#3b82f6', color: '#fff', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem' }}>Baru</span>}
        {isRemoved && (
          <>
            <span className="badge badge-deleted" style={{ background: '#ef4444', color: '#fff', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem' }}>Dihapus</span>
            {friend.updated_at && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }} title={`Dihapus pada: ${new Date(friend.updated_at).toLocaleString('id-ID')}`}>
                ({new Date(friend.updated_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })})
              </span>
            )}
          </>
        )}
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

      <div style={{ marginTop: '0.75rem', background: 'rgba(0,0,0,0.15)', padding: '0.5rem', borderRadius: '0.5rem' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'flex', justifyContent: 'space-between' }}>
          <span>📝 Note:</span>
          {!isRemoved && (
            <button 
              onClick={() => {
                if (isEditingNote) {
                  onSaveNote(friend.id, noteText);
                  setIsEditingNote(false);
                } else {
                  setIsEditingNote(true);
                }
              }}
              style={{ background: 'none', border: 'none', color: isEditingNote ? '#22c55e' : '#3b82f6', cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}
            >
              {isEditingNote ? 'Simpan' : 'Edit'}
            </button>
          )}
        </div>
        {isEditingNote ? (
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Tulis catatan untuk teman ini..."
            style={{ width: '100%', minHeight: '50px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '0.25rem', color: '#fff', padding: '0.4rem', fontSize: '0.8rem', resize: 'vertical' }}
          />
        ) : (
          <div style={{ fontSize: '0.8rem', color: noteText ? '#fff' : 'var(--text-muted)', fontStyle: noteText ? 'normal' : 'italic' }}>
            {noteText || 'Belum ada catatan.'}
          </div>
        )}
      </div>

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
