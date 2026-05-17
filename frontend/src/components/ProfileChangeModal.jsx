import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../utils/api';

const ProfileChangeModal = ({ friend, onClose }) => {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchLogs = async (currentOffset = 0) => {
    try {
      const response = await fetchWithAuth(`/api/friends/${friend.id}/profile-changes?offset=${currentOffset}`);
      if (!response.ok) throw new Error('Failed to fetch profile change logs');
      const data = await response.json();
      const newLogs = Array.isArray(data) ? data : [];
      
      if (newLogs.length < 50) {
        setHasMore(false);
      }
      
      if (currentOffset === 0) {
        setLogs(newLogs);
      } else {
        setLogs(prev => [...prev, ...newLogs]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchLogs(0);
  }, [friend.id]);

  const handleLoadMore = () => {
    setIsLoadingMore(true);
    const newOffset = offset + 50;
    setOffset(newOffset);
    fetchLogs(newOffset);
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ background: '#1e293b', width: '90%', maxWidth: '600px', borderRadius: '1rem', padding: '1.5rem', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.2rem' }}>Profile Changes</h2>
            <p style={{ color: 'var(--text-muted)' }}>{friend.friend_username} ({friend.friend_roblox_id})</p>
          </div>
          <button className="modal-close" onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
        </div>
        
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {error ? (
            <div style={{ color: '#ef4444', textAlign: 'center' }}>Error: {error}</div>
          ) : isLoading && offset === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading changes...</div>
          ) : logs.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Belum ada riwayat perubahan profil.</div>
          ) : (
            <>
              <table className="logs-table" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #334155', textAlign: 'left' }}>
                    <th style={{ padding: '0.5rem' }}>Waktu</th>
                    <th style={{ padding: '0.5rem' }}>Perubahan</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: '1px solid #334155' }}>
                      <td style={{ padding: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                        {new Date(log.created_at).toLocaleString('id-ID')}
                      </td>
                      <td style={{ padding: '0.5rem', fontSize: '0.95rem' }}>
                        <strong>{log.change_type.toUpperCase()}:</strong> <br/>
                        {log.change_type === 'avatar' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                            <div style={{ textAlign: 'center' }}>
                              <img src={log.old_value} alt="Old avatar" style={{ width: 64, height: 64, borderRadius: '50%', border: '2px solid #ef4444', opacity: 0.6 }} />
                              <div style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>Lama</div>
                            </div>
                            <span style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>→</span>
                            <div style={{ textAlign: 'center' }}>
                              <img src={log.new_value} alt="New avatar" style={{ width: 64, height: 64, borderRadius: '50%', border: '2px solid #22c55e' }} />
                              <div style={{ color: '#22c55e', fontSize: '0.75rem', marginTop: '0.25rem' }}>Baru</div>
                            </div>
                          </div>
                        ) : (
                          <>
                            <span style={{ color: '#ef4444', textDecoration: 'line-through' }}>{log.old_value}</span> <br/>
                            <span style={{ color: '#22c55e' }}>{log.new_value}</span>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {hasMore && (
                <div style={{ textAlign: 'center', marginTop: '1rem', paddingBottom: '0.5rem' }}>
                  <button 
                    onClick={handleLoadMore} 
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
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfileChangeModal;
