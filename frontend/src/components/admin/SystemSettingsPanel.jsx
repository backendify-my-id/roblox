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
    app_name: 'Co-Play Capsule',
    enable_registration: true,
    require_admin_approval: true,
    shadow_activity_threshold: 20,
    discord_webhook_url: '',
    maintenance_mode: false,
    global_roblox_cookie: ''
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetchWithAuth('/api/admin/settings');
        if (!res.ok) throw new Error('Gagal mengambil pengaturan sistem');
        const data = await res.json();
        setSettings(data);
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

  return (
    <div style={{ background: 'var(--bg-card)', padding: '2rem', borderRadius: '0.75rem', border: '1px solid var(--border)', maxWidth: '600px', margin: '0 auto' }}>
      <h3 style={{ color: '#fff', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>⚙️ Pengaturan Global Sistem</h3>
      
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* Nama Aplikasi */}
        <div>
          <label style={{ fontWeight: '600', color: '#fff', display: 'block', marginBottom: '0.25rem' }}>Nama Aplikasi (Website Name)</label>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>Nama sistem/situs web yang ditampilkan di header, tab browser, dan halaman masuk.</span>
          <input
            type="text"
            value={settings.app_name || ''}
            onChange={e => handleChange('app_name', e.target.value)}
            style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)', color: '#fff' }}
            required
          />
        </div>

        {/* Pendaftaran Registrasi */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <label style={{ fontWeight: '600', color: '#fff', display: 'block', marginBottom: '0.25rem' }}>Pendaftaran Pengguna Baru</label>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Izinkan pengunjung mendaftarkan akun baru secara mandiri.</span>
          </div>
          <button
            type="button"
            onClick={() => handleChange('enable_registration', !settings.enable_registration)}
            style={{
              width: '50px',
              height: '26px',
              borderRadius: '13px',
              background: settings.enable_registration ? '#22c55e' : '#334155',
              border: 'none',
              position: 'relative',
              cursor: 'pointer',
              transition: 'all 0.3s'
            }}
          >
            <div style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              background: '#fff',
              position: 'absolute',
              top: '3px',
              left: settings.enable_registration ? '27px' : '3px',
              transition: 'all 0.3s'
            }} />
          </button>
        </div>

        {/* Butuh Approval Admin */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <label style={{ fontWeight: '600', color: '#fff', display: 'block', marginBottom: '0.25rem' }}>Persetujuan Admin Mandatori</label>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Setiap pengguna baru yang terdaftar wajib disetujui admin sebelum bisa masuk.</span>
          </div>
          <button
            type="button"
            onClick={() => handleChange('require_admin_approval', !settings.require_admin_approval)}
            style={{
              width: '50px',
              height: '26px',
              borderRadius: '13px',
              background: settings.require_admin_approval ? '#22c55e' : '#334155',
              border: 'none',
              position: 'relative',
              cursor: 'pointer',
              transition: 'all 0.3s'
            }}
          >
            <div style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              background: '#fff',
              position: 'absolute',
              top: '3px',
              left: settings.require_admin_approval ? '27px' : '3px',
              transition: 'all 0.3s'
            }} />
          </button>
        </div>

        {/* Mode Pemeliharaan */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <label style={{ fontWeight: '600', color: '#fff', display: 'block', marginBottom: '0.25rem' }}>Mode Pemeliharaan (Maintenance)</label>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Batasi login sistem hanya untuk administrator.</span>
          </div>
          <button
            type="button"
            onClick={() => handleChange('maintenance_mode', !settings.maintenance_mode)}
            style={{
              width: '50px',
              height: '26px',
              borderRadius: '13px',
              background: settings.maintenance_mode ? '#eab308' : '#334155',
              border: 'none',
              position: 'relative',
              cursor: 'pointer',
              transition: 'all 0.3s'
            }}
          >
            <div style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              background: '#fff',
              position: 'absolute',
              top: '3px',
              left: settings.maintenance_mode ? '27px' : '3px',
              transition: 'all 0.3s'
            }} />
          </button>
        </div>

        {/* Shadow Activity Threshold */}
        <div>
          <label style={{ fontWeight: '600', color: '#fff', display: 'block', marginBottom: '0.25rem' }}>Ambang Batas Deteksi Siluman (Menit)</label>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>Durasi minimum offline sebelum avatar berubah dianggap siluman.</span>
          <input
            type="number"
            min="1"
            value={settings.shadow_activity_threshold}
            onChange={e => handleChange('shadow_activity_threshold', parseInt(e.target.value, 10))}
            style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)', color: '#fff' }}
            required
          />
        </div>

        {/* Discord Webhook */}
        <div>
          <label style={{ fontWeight: '600', color: '#fff', display: 'block', marginBottom: '0.25rem' }}>Discord Webhook URL</label>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>Kirim log perubahan status teman ke channel Discord Anda secara realtime.</span>
          <input
            type="url"
            placeholder="https://discord.com/api/webhooks/..."
            value={settings.discord_webhook_url || ''}
            onChange={e => handleChange('discord_webhook_url', e.target.value)}
            style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)', color: '#fff' }}
          />
        </div>

        {/* Global Roblox Cookie */}
        <div>
          <label style={{ fontWeight: '600', color: '#fff', display: 'block', marginBottom: '0.25rem' }}>Global Roblox Cookie (.ROBLOSECURITY)</label>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>Cookie cadangan sistem jika pengguna tidak memasang cookie kustom sendiri.</span>
          <input
            type="password"
            placeholder="Masukkan cookie Roblox..."
            value={settings.global_roblox_cookie || ''}
            onChange={e => handleChange('global_roblox_cookie', e.target.value)}
            style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)', color: '#fff' }}
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSaving}
          style={{
            marginTop: '1rem',
            padding: '0.75rem',
            borderRadius: '0.5rem',
            background: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)',
            color: '#000',
            border: 'none',
            fontWeight: 'bold',
            cursor: isSaving ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s'
          }}
        >
          {isSaving ? '⏳ Menyimpan...' : '💾 Simpan Pengaturan'}
        </button>

      </form>
    </div>
  );
};

export default SystemSettingsPanel;
