import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../../utils/api';

/**
 * SystemSettingsPanel Component
 * Handles the retrieval and updating of system config settings including:
 * website name, registrations toggles, admin approval requirements, discord webhooks,
 * maintenance modes, shadow thresholds, and global backup cookies.
 * 
 * @param {Object} props
 * @param {Function} props.showToast - Function to trigger dynamic toasts
 * @param {Function} props.onConfigUpdate - Callback triggered when configs are successfully updated
 */
const SystemSettingsPanel = ({ showToast, onConfigUpdate }) => {
  const [settings, setSettings] = useState({
    app_name: 'Roblox Tracker App',
    enable_registration: true,
    require_admin_approval: true,
    shadow_activity_threshold: 20,
    discord_webhook_url: '',
    maintenance_mode: false,
    global_roblox_cookie: '',
    presence_sync_interval: '1m',
    friend_list_sync_interval: '15m',
    chat_sync_interval: '10m',
    log_retention_days: 30,
    profile_log_retention_days: 90,
    discord_notify_shadow_only: false,
    discord_notify_online_offline: true,
    discord_notify_game_changed: true,
    discord_notify_admin_actions: true,
    session_timeout_hours: 24
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetchWithAuth('/api/admin/settings');
        if (!res.ok) throw new Error('Gagal mengambil pengaturan sistem');
        const data = await res.json();
        setSettings(prev => ({ ...prev, ...data }));
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, [showToast]);

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetchWithAuth('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan pengaturan');
      showToast('Pengaturan sistem berhasil diperbarui', 'success');

      if (onConfigUpdate) {
        onConfigUpdate(settings);
      }

      // If cookie changed, refresh display value
      if (settings.global_roblox_cookie && settings.global_roblox_cookie !== '********') {
        setSettings(prev => ({ ...prev, global_roblox_cookie: '********' }));
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
        ⏳ Memuat pengaturan sistem...
      </div>
    );
  }

  // Common UI styles
  const inputStyle = {
    width: '100%',
    padding: '0.65rem',
    borderRadius: '0.5rem',
    border: '1px solid var(--border)',
    background: 'rgba(0,0,0,0.25)',
    color: '#fff',
    fontSize: '0.9rem',
    outline: 'none',
    transition: 'border-color 0.2s'
  };

  const selectStyle = {
    ...inputStyle,
    cursor: 'pointer'
  };

  const labelStyle = {
    fontWeight: '600',
    color: '#fff',
    display: 'block',
    marginBottom: '0.25rem',
    fontSize: '0.95rem'
  };

  const descStyle = {
    fontSize: '0.8rem',
    color: 'var(--text-muted)',
    display: 'block',
    marginBottom: '0.5rem'
  };

  const sectionHeaderStyle = {
    color: '#fbbf24',
    fontSize: '1.1rem',
    margin: '1.5rem 0 1rem 0',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    paddingBottom: '0.4rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  };

  const switchContainerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.5rem 0'
  };

  const renderSwitch = (key, value, activeColor = '#22c55e') => (
    <button
      type="button"
      onClick={() => handleChange(key, !value)}
      style={{
        width: '46px',
        height: '24px',
        borderRadius: '12px',
        background: value ? activeColor : '#334155',
        border: 'none',
        position: 'relative',
        cursor: 'pointer',
        transition: 'all 0.3s',
        flexShrink: 0
      }}
    >
      <div style={{
        width: '18px',
        height: '18px',
        borderRadius: '50%',
        background: '#fff',
        position: 'absolute',
        top: '3px',
        left: value ? '25px' : '3px',
        transition: 'all 0.3s'
      }} />
    </button>
  );

  return (
    <div style={{ background: 'var(--bg-card)', padding: '2rem', borderRadius: '0.75rem', border: '1px solid var(--border)', maxWidth: '650px', margin: '0 auto' }}>
      <h3 style={{ color: '#fff', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>⚙️ Pengaturan Global Sistem</h3>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {/* SECTION 1: DASAR SISTEM */}
        <div style={sectionHeaderStyle}>📋 Dasar & Akses Sistem</div>

        <div>
          <label style={labelStyle}>Nama Aplikasi (Website Name)</label>
          <span style={descStyle}>Nama sistem/situs web yang ditampilkan di header, tab browser, dan halaman masuk.</span>
          <input
            type="text"
            value={settings.app_name || ''}
            onChange={e => handleChange('app_name', e.target.value)}
            style={inputStyle}
            required
          />
        </div>

        <div style={switchContainerStyle}>
          <div>
            <label style={labelStyle}>Pendaftaran Pengguna Baru</label>
            <span style={descStyle}>Izinkan pengunjung mendaftarkan akun baru secara mandiri.</span>
          </div>
          {renderSwitch('enable_registration', settings.enable_registration)}
        </div>

        <div style={switchContainerStyle}>
          <div>
            <label style={labelStyle}>Persetujuan Admin Mandatori</label>
            <span style={descStyle}>Setiap pengguna baru yang terdaftar wajib disetujui admin sebelum bisa masuk.</span>
          </div>
          {renderSwitch('require_admin_approval', settings.require_admin_approval)}
        </div>

        <div style={switchContainerStyle}>
          <div>
            <label style={labelStyle}>Mode Pemeliharaan (Maintenance)</label>
            <span style={descStyle}>Batasi login sistem hanya untuk administrator.</span>
          </div>
          {renderSwitch('maintenance_mode', settings.maintenance_mode, '#eab308')}
        </div>


        {/* SECTION 2: SINKRONISASI OTOMATIS */}
        <div style={sectionHeaderStyle}>⏱️ Interval Sinkronisasi (Cron Sync)</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>Kehadiran (Presence)</label>
            <span style={descStyle}>Pengecekan status online/offline.</span>
            <select
              value={settings.presence_sync_interval}
              onChange={e => handleChange('presence_sync_interval', e.target.value)}
              style={selectStyle}
            >
              <option value="30s">30 Detik (Sangat Cepat)</option>
              <option value="1m">1 Menit (Direkomendasikan)</option>
              <option value="2m">2 Menit</option>
              <option value="5m">5 Menit</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Daftar Teman (Friends)</label>
            <span style={descStyle}>Sinkronisasi penambahan/hapus teman.</span>
            <select
              value={settings.friend_list_sync_interval}
              onChange={e => handleChange('friend_list_sync_interval', e.target.value)}
              style={selectStyle}
            >
              <option value="5m">5 Menit (Sangat Cepat)</option>
              <option value="10m">10 Menit</option>
              <option value="15m">15 Menit (Direkomendasikan)</option>
              <option value="30m">30 Menit</option>
              <option value="1h">1 Jam</option>
              <option value="6h">6 Jam</option>
            </select>
          </div>
        </div>

        <div>
          <label style={labelStyle}>Ringkasan Obrolan (Light Chat Sync)</label>
          <span style={descStyle}>Sinkronisasi berkala pesan chat ringan di latar belakang.</span>
          <select
            value={settings.chat_sync_interval}
            onChange={e => handleChange('chat_sync_interval', e.target.value)}
            style={selectStyle}
          >
            <option value="5m">5 Menit</option>
            <option value="10m">10 Menit (Direkomendasikan)</option>
            <option value="30m">30 Menit</option>
            <option value="1h">1 Jam</option>
          </select>
        </div>


        {/* SECTION 3: RETENSI LOG DATA */}
        <div style={sectionHeaderStyle}>🧹 Masa Retensi Log Data (Auto Cleanup)</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>Log Aktivitas (Activity Logs)</label>
            <span style={descStyle}>Riwayat online/offline/mabar.</span>
            <select
              value={settings.log_retention_days}
              onChange={e => handleChange('log_retention_days', parseInt(e.target.value, 10))}
              style={selectStyle}
            >
              <option value="7">7 Hari</option>
              <option value="30">30 Hari</option>
              <option value="90">90 Hari</option>
              <option value="0">Selamanya (Tidak Dihapus)</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Log Profil (Profile Changes)</label>
            <span style={descStyle}>Riwayat pergantian avatar/nama.</span>
            <select
              value={settings.profile_log_retention_days}
              onChange={e => handleChange('profile_log_retention_days', parseInt(e.target.value, 10))}
              style={selectStyle}
            >
              <option value="30">30 Hari</option>
              <option value="90">90 Hari</option>
              <option value="365">1 Tahun</option>
              <option value="0">Selamanya (Tidak Dihapus)</option>
            </select>
          </div>
        </div>


        {/* SECTION 4: WEBHOOK DISCORD */}
        <div style={sectionHeaderStyle}>🔔 Integrasi Discord Webhook</div>

        <div>
          <label style={labelStyle}>Discord Webhook URL</label>
          <span style={descStyle}>Kirim log kejadian penting secara real-time ke saluran Discord Anda.</span>
          <input
            type="url"
            placeholder="https://discord.com/api/webhooks/..."
            value={settings.discord_webhook_url || ''}
            onChange={e => handleChange('discord_webhook_url', e.target.value)}
            style={inputStyle}
          />
        </div>

        {settings.discord_webhook_url && (
          <div style={{ background: 'rgba(0,0,0,0.15)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#fff', display: 'block', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.25rem' }}>Kirim Notifikasi Untuk:</span>

            <div style={switchContainerStyle}>
              <div>
                <span style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 500 }}>Hanya Deteksi Siluman (Shadow Mode)</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Batasi notifikasi hanya jika teman mengganti avatar saat statusnya offline.</span>
              </div>
              {renderSwitch('discord_notify_shadow_only', settings.discord_notify_shadow_only)}
            </div>

            {!settings.discord_notify_shadow_only && (
              <>
                <div style={switchContainerStyle}>
                  <div>
                    <span style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 500 }}>Perubahan Status Online / Offline</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Kirim notifikasi setiap ada teman yang menjadi online/offline.</span>
                  </div>
                  {renderSwitch('discord_notify_online_offline', settings.discord_notify_online_offline)}
                </div>

                <div style={switchContainerStyle}>
                  <div>
                    <span style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 500 }}>Perubahan Permainan (In-Game)</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Kirim notifikasi ketika teman masuk ke game baru.</span>
                  </div>
                  {renderSwitch('discord_notify_game_changed', settings.discord_notify_game_changed)}
                </div>
              </>
            )}

            <div style={switchContainerStyle}>
              <div>
                <span style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 500 }}>Aksi Administratif Admin</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Kirim log keamanan ketika admin mengubah persetujuan user atau backup database.</span>
              </div>
              {renderSwitch('discord_notify_admin_actions', settings.discord_notify_admin_actions)}
            </div>
          </div>
        )}


        {/* SECTION 5: KEAMANAN & COOKIE */}
        <div style={sectionHeaderStyle}>🛡️ Keamanan & Cookie Cadangan</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>Masa Kedaluwarsa Sesi (JWT)</label>
            <span style={descStyle}>Batas waktu otomatis logout sesi admin/user.</span>
            <select
              value={settings.session_timeout_hours}
              onChange={e => handleChange('session_timeout_hours', parseInt(e.target.value, 10))}
              style={selectStyle}
            >
              <option value="2">2 Jam</option>
              <option value="8">8 Jam</option>
              <option value="24">24 Jam (Direkomendasikan)</option>
              <option value="168">7 Hari</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Ambang Batas Siluman (Shadow)</label>
            <span style={descStyle}>Durasi minimum offline sebelum ganti avatar dianggap siluman.</span>
            <input
              type="number"
              min="1"
              value={settings.shadow_activity_threshold}
              onChange={e => handleChange('shadow_activity_threshold', parseInt(e.target.value, 10))}
              style={inputStyle}
              required
            />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Global Roblox Cookie (Cadangan)</label>
          <span style={descStyle}>Cookie Roblox lengkap yang digunakan sistem jika pengguna tidak memasang cookie kustom sendiri.</span>
          <input
            type="password"
            placeholder="Masukkan cookie Roblox lengkap..."
            value={settings.global_roblox_cookie || ''}
            onChange={e => handleChange('global_roblox_cookie', e.target.value)}
            style={inputStyle}
          />
        </div>


        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSaving}
          style={{
            marginTop: '1.5rem',
            padding: '0.85rem',
            borderRadius: '0.5rem',
            background: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)',
            color: '#000',
            border: 'none',
            fontWeight: 'bold',
            fontSize: '0.95rem',
            cursor: isSaving ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 4px 12px rgba(234, 179, 8, 0.2)'
          }}
        >
          {isSaving ? '⏳ Menyimpan Pengaturan...' : '💾 Simpan Seluruh Pengaturan'}
        </button>

      </form>
    </div>
  );
};

export default SystemSettingsPanel;
