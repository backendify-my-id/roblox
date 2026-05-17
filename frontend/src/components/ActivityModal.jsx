import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../utils/api';

const ActivityModal = ({ friend, onClose }) => {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchLogs = async (currentOffset = 0) => {
    try {
      const response = await fetchWithAuth(`/api/friends/${friend.id}/logs?offset=${currentOffset}`);
      if (!response.ok) throw new Error('Failed to fetch logs');
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.2rem' }}>Activity Logs</h2>
            <p style={{ color: 'var(--text-muted)' }}>{friend.friend_username} ({friend.friend_roblox_id})</p>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        
        {error ? (
          <div style={{ color: '#ef4444', textAlign: 'center' }}>Error: {error}</div>
        ) : isLoading && offset === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading logs...</div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No activity recorded yet for this friend.</div>
        ) : (
          <div style={{ overflowY: 'auto', maxHeight: '60vh' }}>
            <table className="logs-table">
              <thead>
                <tr>
                  <th>Time (Local)</th>
                  <th>Status</th>
                  <th>Game</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{new Date(log.created_at).toLocaleString('en-GB')}</td>
                    <td>
                      <span style={{ 
                        color: log.status === 'In-Game' ? '#a78bfa' : 
                               log.status === 'Online' ? 'var(--status-online)' : 
                               log.status === 'Removed' ? '#ef4444' : 
                               (log.status === 'First Added' || log.status === 'Added Again') ? '#60a5fa' : 'var(--text-muted)' 
                      }}>
                        {log.status}
                      </span>
                    </td>
                    <td>{log.game_name || '-'}</td>
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
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityModal;
