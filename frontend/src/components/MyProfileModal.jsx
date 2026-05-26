import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../utils/api';

const MyProfileModal = ({ user, onClose }) => {
  const [activeTab, setActiveTab] = useState('activity');
  const [activityLogs, setActivityLogs] = useState([]);
  const [profileLogs, setProfileLogs] = useState([]);
  
  const [activityOffset, setActivityOffset] = useState(0);
  const [profileOffset, setProfileOffset] = useState(0);
  
  const [hasMoreActivity, setHasMoreActivity] = useState(true);
  const [hasMoreProfile, setHasMoreProfile] = useState(true);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const fetchInitialData = async () => {
    setIsLoading(true);
    try {
      const [actRes, profRes] = await Promise.all([
        fetchWithAuth(`/api/user/logs?offset=0`),
        fetchWithAuth(`/api/user/profile-changes?offset=0`)
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
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  const handleLoadMoreActivity = async () => {
    setIsLoadingMore(true);
    const newOffset = activityOffset + 100;
    try {
      const res = await fetchWithAuth(`/api/user/logs?offset=${newOffset}`);
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
      const res = await fetchWithAuth(`/api/user/profile-changes?offset=${newOffset}`);
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

  const tabs = [
    { key: 'activity', label: `📋 Activity Log` },
    { key: 'profile', label: `🔄 Perubahan Profil` },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {user.avatar ? (
              <img src={user.avatar} alt="" style={{ width: 48, height: 48, borderRadius: '50%', border: '2px solid #3b82f6' }} />
            ) : (
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#334155' }} />
            )}
            <div>
              <h2 style={{ fontSize: '1.3rem', margin: 0 }}>Riwayat Saya</h2>
              <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.85rem' }}>@{user.username} · ID: {user.roblox_id}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
        </div>

        {/* Tabs */}
        <div className="modal-tabs">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="modal-tab-btn"
              style={{
                border: activeTab === tab.key ? '1px solid #3b82f6' : '1px solid transparent',
                background: activeTab === tab.key ? 'rgba(59,130,246,0.15)' : 'transparent',
                color: activeTab === tab.key ? '#60a5fa' : 'var(--text-muted)',
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
                <div className="table-responsive">
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
                          <td style={{ padding: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{new Date(log.created_at).toLocaleString('id-ID')}</td>
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
                </div>
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
          ) : (
            profileLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Belum ada riwayat perubahan profil.</div>
            ) : (
              <>
                <div className="table-responsive">
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
                </div>
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
          )}
        </div>
      </div>
    </div>
  );
};

export default MyProfileModal;
