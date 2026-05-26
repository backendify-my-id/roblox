import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../utils/api';

const ActivityModal = ({ friend, onClose }) => {
  const [activeTab, setActiveTab] = useState('logs');
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchLogs = async (currentOffset = 0) => {
    try {
      const response = await fetchWithAuth(`/api/friends/${friend.id}/logs?offset=${currentOffset}&limit=1000`);
      if (!response.ok) throw new Error('Failed to fetch logs');
      const data = await response.json();
      const newLogs = Array.isArray(data) ? data : [];
      
      if (newLogs.length < 1000) {
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
    const newOffset = offset + 1000;
    setOffset(newOffset);
    fetchLogs(newOffset);
  };

  // ─── ANALYTICS COMPUTATIONS ──────────────────────────────────────────────────
  // Filter logs for the last 7 days (rolling window)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const filteredLogs = logs.filter(log => new Date(log.created_at) >= sevenDaysAgo);
  const totalLogs = filteredLogs.length;

  // 1. Status Breakdown
  const statusCounts = filteredLogs.reduce((acc, log) => {
    acc[log.status] = (acc[log.status] || 0) + 1;
    return acc;
  }, {});

  // 2. Most Played Games
  const gameCounts = filteredLogs.reduce((acc, log) => {
    if (log.status === 'In-Game') {
      const gameName = (log.map && log.map.name) ? log.map.name : log.game_name;
      if (gameName) {
        acc[gameName] = (acc[gameName] || 0) + 1;
      }
    }
    return acc;
  }, {});
  const topGames = Object.entries(gameCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // 3. Hourly Activity Blocks
  const hourBlocks = {
    'Dini Hari (00:00 - 06:00)': 0,
    'Pagi (06:00 - 12:00)': 0,
    'Siang (12:00 - 18:00)': 0,
    'Malam (18:00 - 00:00)': 0,
  };
  const hourlyRaw = Array(24).fill(0);
  
  filteredLogs.forEach(log => {
    const hour = new Date(log.created_at).getHours();
    hourlyRaw[hour]++;
    if (hour >= 0 && hour < 6) hourBlocks['Dini Hari (00:00 - 06:00)']++;
    else if (hour >= 6 && hour < 12) hourBlocks['Pagi (06:00 - 12:00)']++;
    else if (hour >= 12 && hour < 18) hourBlocks['Siang (12:00 - 18:00)']++;
    else hourBlocks['Malam (18:00 - 00:00)']++;
  });

  const maxHourVal = Math.max(...hourlyRaw);
  const peakHour = maxHourVal > 0 ? hourlyRaw.indexOf(maxHourVal) : null;

  // 4. Day of Week Activity
  const daysOfWeek = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const dayCounts = Array(7).fill(0);
  filteredLogs.forEach(log => {
    const day = new Date(log.created_at).getDay();
    dayCounts[day]++;
  });
  const maxDayVal = Math.max(...dayCounts);

  const todayIndex = new Date().getDay();
  const orderedIndices = [];
  for (let i = 1; i <= 7; i++) {
    orderedIndices.push((todayIndex + i) % 7);
  }

  // 5. Play Duration per Day of Week (in minutes)
  const dayPlayMinutes = Array(7).fill(0);

  const addPlayDuration = (start, end, maxMinutes = 180) => {
    const diffMs = end - start;
    const diffMins = Math.round(diffMs / 60000);
    const finalMins = Math.min(diffMins, maxMinutes);
    if (finalMins <= 0) return;

    let adjustedEnd = end;
    if (diffMins > finalMins) {
      adjustedEnd = new Date(start.getTime() + finalMins * 60000);
    }

    let temp = new Date(start.getTime());
    while (temp < adjustedEnd) {
      const nextMidnight = new Date(temp);
      nextMidnight.setHours(24, 0, 0, 0);

      const limit = nextMidnight < adjustedEnd ? nextMidnight : adjustedEnd;
      const mins = Math.round((limit - temp) / 60000);
      if (mins > 0) {
        dayPlayMinutes[temp.getDay()] += mins;
      }
      temp = nextMidnight;
    }
  };

  const cronLogs = [...filteredLogs].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  let currentInGameStart = null;
  for (let i = 0; i < cronLogs.length; i++) {
    const log = cronLogs[i];
    if (log.status === 'In-Game') {
      if (currentInGameStart === null) {
        currentInGameStart = new Date(log.created_at);
      }
    } else {
      if (currentInGameStart !== null) {
        addPlayDuration(currentInGameStart, new Date(log.created_at));
        currentInGameStart = null;
      }
    }
  }
  if (currentInGameStart !== null) {
    addPlayDuration(currentInGameStart, new Date());
  }
  const maxDurationVal = Math.max(...dayPlayMinutes);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-content-large" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '780px' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: '1.4rem', margin: 0, background: 'linear-gradient(to right, #60a5fa, #a78bfa)', WebkitBackgroundClip: 'text', color: 'transparent' }}>
              Dashboard Aktivitas Teman
            </h2>
            <p style={{ color: 'var(--text-muted)', margin: '0.2rem 0 0 0', fontSize: '0.85rem' }}>
              {friend.friend_display_name || friend.friend_username} (@{friend.friend_username}) · ID: {friend.friend_roblox_id}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
        </div>

        {/* Tab Navigation */}
        <div className="modal-tabs">
          <button
            onClick={() => setActiveTab('logs')}
            className="modal-tab-btn"
            style={{
              border: activeTab === 'logs' ? '1px solid #3b82f6' : '1px solid transparent',
              background: activeTab === 'logs' ? 'rgba(59,130,246,0.15)' : 'transparent',
              color: activeTab === 'logs' ? '#60a5fa' : 'var(--text-muted)',
              fontWeight: activeTab === 'logs' ? 600 : 400,
            }}
          >
            📋 Log Aktivitas
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className="modal-tab-btn"
            style={{
              border: activeTab === 'analytics' ? '1px solid #a78bfa' : '1px solid transparent',
              background: activeTab === 'analytics' ? 'rgba(167,139,250,0.15)' : 'transparent',
              color: activeTab === 'analytics' ? '#c084fc' : 'var(--text-muted)',
              fontWeight: activeTab === 'analytics' ? 600 : 400,
            }}
          >
            📊 Analisis Tren
          </button>
        </div>
        
        {error ? (
          <div style={{ color: '#ef4444', textAlign: 'center', padding: '2rem' }}>Error: {error}</div>
        ) : isLoading && offset === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>Memuat riwayat aktivitas...</div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>Belum ada log aktivitas yang tercatat untuk teman ini.</div>
        ) : activeTab === 'logs' ? (
          /* ─── TAB 1: LOG TABLE ──────────────────────────────────────────────── */
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <div className="table-responsive">
              <table className="logs-table" style={{ width: '100%', borderCollapse: 'collapse', color: '#fff' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #334155', textAlign: 'left' }}>
                    <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>Waktu (Lokal)</th>
                    <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>Status</th>
                    <th style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)' }}>Game</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: '1px solid #334155' }}>
                      <td style={{ padding: '0.6rem 0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {new Date(log.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                      </td>
                      <td style={{ padding: '0.6rem 0.5rem' }}>
                        <span style={{ 
                          color: log.status === 'In-Game' ? '#a78bfa' : 
                                 log.status === 'Online' ? '#22c55e' : 
                                 log.status === 'Removed' ? '#ef4444' : 
                                 (log.status === 'First Added' || log.status === 'Added Again') ? '#60a5fa' : 'var(--text-muted)' 
                        }}>
                          {log.status}
                        </span>
                      </td>
                      <td style={{ padding: '0.6rem 0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {log.game_name || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
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
        ) : (
          /* ─── TAB 2: GLOSSY CSS VISUALIZATIONS ──────────────────────────────── */
          <div style={{ overflowY: 'auto', flex: 1, paddingRight: '0.25rem' }}>
            {filteredLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Belum ada data aktivitas dalam 7 hari terakhir untuk dianalisis.</div>
            ) : (
              <>
                {/* Top Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '0.75rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Peak Hour Teraktif</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#fbbf24' }}>
                  {peakHour !== null ? `Pukul ${peakHour.toString().padStart(2, '0')}:00` : '-'}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Berdasarkan waktu aktivitas log lokal</div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '0.75rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Game Terfavorit</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 'bold', color: '#a78bfa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {topGames.length > 0 ? topGames[0][0] : '-'}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {topGames.length > 0 ? `${topGames[0][1]} sesi terdeteksi` : 'Belum bermain game'}
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '0.75rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Sampel Log</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#60a5fa' }}>{totalLogs} Log</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Cadangan log aktivitas terpasang</div>
              </div>
            </div>

            {/* Charts Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
              
              {/* Game Terpopuler Progress Bars */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', padding: '1.25rem', borderRadius: '0.75rem' }}>
                <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  🎮 Top Game Terpopuler
                </h4>
                {topGames.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 0', fontSize: '0.85rem' }}>Tidak ada log game terdaftar.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    {topGames.map(([game, count], idx) => {
                      const percentage = Math.round((count / topGames[0][1]) * 100);
                      return (
                        <div key={game}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                            <span style={{ fontWeight: 600, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '80%' }}>
                              {idx + 1}. {game}
                            </span>
                            <span style={{ color: '#a78bfa' }}>{count} kali</span>
                          </div>
                          <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div 
                              style={{ 
                                height: '100%', 
                                width: `${percentage}%`, 
                                background: 'linear-gradient(to right, #6366f1, #a855f7)', 
                                borderRadius: '4px',
                                boxShadow: '0 0 8px rgba(168, 85, 247, 0.4)'
                              }} 
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Pembagian Waktu Bermain (Hourly Blocks) */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', padding: '1.25rem', borderRadius: '0.75rem' }}>
                <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  🕒 Distribusi Waktu Bermain
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {Object.entries(hourBlocks).map(([block, count]) => {
                    const totalHours = Object.values(hourBlocks).reduce((a, b) => a + b, 0);
                    const percentage = totalHours > 0 ? Math.round((count / totalHours) * 100) : 0;
                    return (
                      <div key={block}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                          <span style={{ color: '#e2e8f0' }}>{block}</span>
                          <span style={{ color: '#fbbf24', fontWeight: 600 }}>{percentage}% ({count})</span>
                        </div>
                        <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div 
                            style={{ 
                              height: '100%', 
                              width: `${percentage}%`, 
                              background: 'linear-gradient(to right, #f59e0b, #eab308)', 
                              borderRadius: '4px',
                              boxShadow: '0 0 8px rgba(234, 179, 8, 0.4)'
                            }} 
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Bottom Row: Day of Week Graph */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', padding: '1.25rem', borderRadius: '0.75rem', marginBottom: '1.5rem' }}>
              <h4 style={{ margin: '0 0 1.25rem 0', fontSize: '0.95rem', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                📅 Aktivitas Mingguan (Hari Ini Paling Kanan)
              </h4>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: '120px', padding: '0 0.5rem' }}>
                {orderedIndices.map(dayIdx => {
                  const count = dayCounts[dayIdx];
                  const percentage = maxDayVal > 0 ? Math.round((count / maxDayVal) * 80) + 10 : 10;
                  const isToday = dayIdx === todayIndex;
                  return (
                    <div key={dayIdx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                      <div style={{ fontSize: '0.7rem', color: isToday ? '#a78bfa' : '#60a5fa', fontWeight: 'bold', marginBottom: '0.25rem', transition: 'all 0.2s' }}>
                        {count}
                      </div>
                      <div 
                        style={{ 
                          width: '24px', 
                          height: `${percentage}px`, 
                          background: isToday ? 'linear-gradient(to top, #7c3aed, #a78bfa)' : 'linear-gradient(to top, #1d4ed8, #60a5fa)', 
                          borderRadius: '4px 4px 0 0',
                          transition: 'all 0.2s ease-in-out',
                          cursor: 'pointer',
                          boxShadow: isToday ? '0 0 10px rgba(167, 139, 250, 0.4)' : '0 0 8px rgba(96, 165, 250, 0.2)'
                        }} 
                        onMouseEnter={e => {
                          e.currentTarget.style.transform = 'scaleY(1.15) translateY(-5px)';
                          e.currentTarget.style.boxShadow = isToday ? '0 0 18px rgba(167, 139, 250, 0.8)' : '0 0 15px rgba(96, 165, 250, 0.6)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.transform = 'scaleY(1) translateY(0px)';
                          e.currentTarget.style.boxShadow = isToday ? '0 0 10px rgba(167, 139, 250, 0.4)' : '0 0 8px rgba(96, 165, 250, 0.2)';
                        }}
                      />
                      <div style={{ fontSize: '0.6rem', color: isToday ? '#c084fc' : 'var(--text-muted)', fontWeight: isToday ? 'bold' : 'normal', marginTop: '0.35rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {daysOfWeek[dayIdx].substring(0, 3)} {isToday && '🌟'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Durasi Bermain Mingguan */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', padding: '1.25rem', borderRadius: '0.75rem', marginBottom: '1.5rem' }}>
              <h4 style={{ margin: '0 0 1.25rem 0', fontSize: '0.95rem', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🎮 Durasi Bermain Mingguan (Menit - Hari Ini Paling Kanan)
              </h4>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: '120px', padding: '0 0.5rem' }}>
                {orderedIndices.map(dayIdx => {
                  const count = dayPlayMinutes[dayIdx];
                  const percentage = maxDurationVal > 0 ? Math.round((count / maxDurationVal) * 80) + 10 : 10;
                  const isToday = dayIdx === todayIndex;
                  return (
                    <div key={dayIdx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                      <div style={{ fontSize: '0.7rem', color: isToday ? '#fbbf24' : '#34d399', fontWeight: 'bold', marginBottom: '0.25rem', transition: 'all 0.2s' }}>
                        {count}m
                      </div>
                      <div 
                        style={{ 
                          width: '24px', 
                          height: `${percentage}px`, 
                          background: isToday ? 'linear-gradient(to top, #d97706, #fbbf24)' : 'linear-gradient(to top, #047857, #34d399)', 
                          borderRadius: '4px 4px 0 0',
                          transition: 'all 0.2s ease-in-out',
                          cursor: 'pointer',
                          boxShadow: isToday ? '0 0 10px rgba(251, 191, 36, 0.4)' : '0 0 8px rgba(52, 211, 153, 0.2)'
                        }} 
                        onMouseEnter={e => {
                          e.currentTarget.style.transform = 'scaleY(1.15) translateY(-5px)';
                          e.currentTarget.style.boxShadow = isToday ? '0 0 18px rgba(251, 191, 36, 0.8)' : '0 0 15px rgba(52, 211, 153, 0.6)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.transform = 'scaleY(1) translateY(0px)';
                          e.currentTarget.style.boxShadow = isToday ? '0 0 10px rgba(251, 191, 36, 0.4)' : '0 0 8px rgba(52, 211, 153, 0.2)';
                        }}
                      />
                      <div style={{ fontSize: '0.6rem', color: isToday ? '#fcd34d' : 'var(--text-muted)', fontWeight: isToday ? 'bold' : 'normal', marginTop: '0.35rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {daysOfWeek[dayIdx].substring(0, 3)} {isToday && '🌟'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Distribution Status Footprint */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', padding: '1.25rem', borderRadius: '0.75rem' }}>
              <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem' }}>
                📊 Proporsi Distribusi Status Kehadiran
              </h4>
              
              {/* Segmented Bar */}
              <div style={{ display: 'flex', height: '24px', borderRadius: '8px', overflow: 'hidden', marginBottom: '1rem', background: 'rgba(255,255,255,0.05)' }}>
                {Object.entries(statusCounts).map(([status, count]) => {
                  const percentage = totalLogs > 0 ? (count / totalLogs) * 100 : 0;
                  if (percentage === 0) return null;
                  
                  const statusColors = {
                    'In-Game': 'linear-gradient(to right, #8b5cf6, #a855f7)',
                    'Online': 'linear-gradient(to right, #10b981, #10b981)',
                    'Removed': 'linear-gradient(to right, #ef4444, #ef4444)',
                    'First Added': 'linear-gradient(to right, #3b82f6, #3b82f6)',
                    'Added Again': 'linear-gradient(to right, #60a5fa, #60a5fa)',
                    'Offline': 'linear-gradient(to right, #64748b, #64748b)'
                  };

                  return (
                    <div 
                      key={status}
                      style={{ 
                        width: `${percentage}%`, 
                        background: statusColors[status] || 'linear-gradient(to right, #94a3b8, #94a3b8)',
                        height: '100%',
                        transition: 'width 0.3s ease'
                      }}
                      title={`${status}: ${Math.round(percentage)}% (${count})`}
                    />
                  );
                })}
              </div>

              {/* Legend Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.5rem' }}>
                {Object.entries(statusCounts).map(([status, count]) => {
                  const percentage = totalLogs > 0 ? Math.round((count / totalLogs) * 100) : 0;
                  const statusDots = {
                    'In-Game': '#a78bfa',
                    'Online': '#22c55e',
                    'Removed': '#ef4444',
                    'First Added': '#3b82f6',
                    'Added Again': '#60a5fa',
                    'Offline': '#64748b'
                  };

                  return (
                    <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusDots[status] || '#94a3b8' }} />
                      <strong style={{ color: '#fff' }}>{percentage}%</strong> {status} ({count})
                    </div>
                  );
                })}
              </div>

            </div>
          </>
        )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityModal;
