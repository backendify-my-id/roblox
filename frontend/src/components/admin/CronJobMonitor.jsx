import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../../utils/api';

/**
 * CronJobMonitor Component
 * Displays Roblox API rate limit gauge, server cluster details,
 * and live-updated cron job execution logs/statistics.
 * 
 * @param {Object} props
 * @param {Function} props.showToast - Function to trigger dynamic toasts
 */
const CronJobMonitor = ({ showToast }) => {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchStatus = async () => {
    try {
      const res = await fetchWithAuth('/api/admin/cron-status');
      if (!res.ok) throw new Error('Gagal memuat status cron');
      const json = await res.json();
      setData(json);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    const handleWSMessage = (e) => {
      const { type, payload } = e.detail;
      console.log('[CronMonitor WS] message received:', type, payload);
      if (type === 'cron_progress') {
        const {
          remaining_hits,
          max_hits,
          job_name,
          instance_id,
          status,
          start_time,
          last_run,
          duration_ms,
          processed_count,
          failed_count,
          change_count
        } = payload;

        setData(prev => {
          if (!prev) return prev;

          const newRemaining = remaining_hits ?? prev.remaining_hits;
          const newMax = max_hits ?? prev.max_hits;

          const updatedJobs = prev.jobs.map(job => {
            if (job.job_name === job_name && job.instance_id === instance_id) {
              return {
                ...job,
                status,
                start_time,
                last_run,
                duration_ms,
                processed_count,
                failed_count,
                change_count
              };
            }
            return job;
          });

          const exists = prev.jobs.some(job => job.job_name === job_name && job.instance_id === instance_id);
          if (!exists && job_name) {
            updatedJobs.push({
              job_name,
              instance_id,
              status,
              start_time,
              last_run,
              duration_ms,
              processed_count,
              failed_count,
              change_count
            });
          }

          return {
            ...prev,
            remaining_hits: newRemaining,
            max_hits: newMax,
            jobs: updatedJobs
          };
        });
      }
    };

    window.addEventListener('ws-message', handleWSMessage);
    return () => window.removeEventListener('ws-message', handleWSMessage);
  }, [autoRefresh]);

  if (isLoading && !data) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        Memuat data pemantauan sistem...
      </div>
    );
  }

  const remainingHits = data?.remaining_hits ?? 80;
  const maxHits = data?.max_hits ?? 80;
  const percentage = Math.round((remainingHits / maxHits) * 100);

  let gaugeColor = '#10b981';
  if (percentage < 30) {
    gaugeColor = '#ef4444';
  } else if (percentage < 60) {
    gaugeColor = '#f59e0b';
  }

  const jobs = data?.jobs || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1rem' }}>
      {/* Upper Grid: Rate Limit & Cluster Info */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        {/* Roblox API Rate Limit Gauge Card */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '1.5rem', borderRadius: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Roblox API Rate Limit (Per IP)</span>
            <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', color: 'var(--text-muted)' }}>Menit Berjalan</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ position: 'relative', width: '80px', height: '80px', borderRadius: '50%', background: `conic-gradient(${gaugeColor} ${percentage}%, rgba(255,255,255,0.05) ${percentage}%)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '68px', height: '68px', borderRadius: '50%', background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#fff' }}>{remainingHits}</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Sisa Hits</span>
              </div>
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#fff', marginBottom: '0.25rem' }}>
                {percentage}% <span style={{ fontSize: '0.9rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>Tersedia</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                Batas aman sistem: <strong>{maxHits} request / menit</strong>.
              </div>
              <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${percentage}%`, height: '100%', background: gaugeColor, transition: 'width 0.5s ease-in-out' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Server Cluster Configuration Card */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '1.5rem', borderRadius: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Konfigurasi Cluster Server</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Instance ID Server Ini</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#3b82f6' }}>#{data?.instance_id ?? 1}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Total Server di Cluster</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#10b981' }}>{data?.total_instances ?? 1} Instance</div>
            </div>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(59,130,246,0.05)', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid rgba(59,130,246,0.1)' }}>
            ℹ️ Beban sinkronisasi dibagi menggunakan partisi database modulo ID (`id % total_instances`).
          </div>
        </div>
      </div>

      {/* Control Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '0.75rem 1.25rem', borderRadius: '0.75rem', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="checkbox"
            id="auto-refresh-cron"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
          />
          <label htmlFor="auto-refresh-cron" style={{ fontSize: '0.85rem', color: '#fff', cursor: 'pointer', userSelect: 'none' }}>
            Live Stream (WS) ⚡
          </label>
        </div>
        <button
          onClick={fetchStatus}
          style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '0.4rem 1rem', borderRadius: '0.35rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
        >
          Ambil Data Terbaru
        </button>
      </div>

      {/* Cron Jobs State Table */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, color: '#fff' }}>Daftar Pekerjaan Latar Belakang (Cron Jobs)</h4>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '1rem' }}>Pekerjaan (Job)</th>
                <th style={{ padding: '1rem' }}>Instance Server</th>
                <th style={{ padding: '1rem' }}>Status</th>
                <th style={{ padding: '1rem' }}>Mulai Eksekusi</th>
                <th style={{ padding: '1rem' }}>Selesai Terakhir</th>
                <th style={{ padding: '1rem' }}>Durasi</th>
                <th style={{ padding: '1rem' }}>Statistik</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Belum ada metadata eksekusi cron di Redis. Tunggu cron berjalan otomatis.
                  </td>
                </tr>
              ) : (
                jobs.map((job, idx) => {
                  const isRunning = job.status === 'running';
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', background: isRunning ? 'rgba(20,184,166,0.03)' : 'transparent', transition: 'background 0.2s' }}>
                      <td style={{ padding: '1rem', fontWeight: 'bold', color: '#fff' }}>
                        {job.job_name === 'friends_sync' ? '👥 Friends & Profile Sync' : '🟢 Presence Sync'}
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <span style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                          Instance #{job.instance_id}
                        </span>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: isRunning ? '#14b8a6' : '#94a3b8',
                            display: 'inline-block',
                            boxShadow: isRunning ? '0 0 8px #14b8a6' : 'none'
                          }} />
                          <span style={{ fontWeight: 600, color: isRunning ? '#2dd4bf' : 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase' }}>
                            {isRunning ? 'Running' : 'Idle'}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{job.start_time || '-'}</td>
                      <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{job.last_run || '-'}</td>
                      <td style={{ padding: '1rem', color: '#fff' }}>
                        {job.duration_ms > 0 ? `${(job.duration_ms / 1000).toFixed(2)} detik` : '-'}
                      </td>
                      <td style={{ padding: '1rem' }}>
                        {job.job_name === 'friends_sync' ? (
                          <div style={{ fontSize: '0.8rem' }}>
                            <span style={{ color: '#4ade80' }}>✓ {job.processed_count} Sukses</span> · <span style={{ color: '#f87171' }}>✗ {job.failed_count} Gagal</span>
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.8rem' }}>
                            <span style={{ color: '#a78bfa' }}>👥 {job.processed_count} Teman</span> · <span style={{ color: '#fbbf24' }}>⚡ {job.change_count} Perubahan</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CronJobMonitor;
