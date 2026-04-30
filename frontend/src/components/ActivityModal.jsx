import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../utils/api';

const ActivityModal = ({ friend, onClose }) => {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await fetchWithAuth(`/api/friends/${friend.id}/logs`);
        if (!response.ok) throw new Error('Failed to fetch logs');
        const data = await response.json();
        setLogs(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchLogs();
  }, [friend.id]);

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
        ) : isLoading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading logs...</div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No activity recorded yet for this friend.</div>
        ) : (
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
                  <td>{new Date(log.created_at).toLocaleString()}</td>
                  <td>
                    <span style={{ 
                      color: log.status === 'In-Game' ? '#a78bfa' : 
                             log.status === 'Online' ? 'var(--status-online)' : 'var(--text-muted)' 
                    }}>
                      {log.status}
                    </span>
                  </td>
                  <td>{log.game_name || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ActivityModal;
