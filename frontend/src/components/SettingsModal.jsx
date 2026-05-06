import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../utils/api';

const SettingsModal = ({ user, onClose, showToast }) => {
  const [isStealth, setIsStealth] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Ambil status terbaru dari database saat modal dibuka
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetchWithAuth('/api/user/settings');
        if (!res.ok) throw new Error('Gagal mengambil pengaturan');
        const data = await res.json();
        setIsStealth(data.is_stealth);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleToggleStealth = async () => {
    setIsLoading(true);
    try {
      const res = await fetchWithAuth('/api/user/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_stealth: !isStealth })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Gagal memperbarui pengaturan');
      }
      
      setIsStealth(!isStealth);
      showToast(`Mode Siluman ${!isStealth ? 'diaktifkan' : 'dimatikan'}`, 'success');
      
      // Update local storage agar header ikut sinkron (opsional)
      const updatedUser = { ...user, is_stealth: !isStealth };
      localStorage.setItem('user', JSON.stringify(updatedUser));
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
        <div className="modal-header">
          <h3>Pengaturan Akun</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        
        <div style={{ padding: '1rem 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'rgba(59,130,246,0.05)', borderRadius: '0.75rem', border: '1px solid rgba(59,130,246,0.1)' }}>
            <div>
              <div style={{ fontWeight: '600', color: '#fff', marginBottom: '0.25rem' }}>Mode Siluman (Stealth)</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '250px' }}>
                Selalu tampilkan status Offline di activity log orang lain meskipun Anda sedang Online.
              </div>
            </div>
            <button
              onClick={handleToggleStealth}
              disabled={isLoading}
              style={{
                width: '50px',
                height: '26px',
                borderRadius: '13px',
                background: isStealth ? '#22c55e' : '#334155',
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
                left: isStealth ? '27px' : '3px',
                transition: 'all 0.3s'
              }} />
            </button>
          </div>
          
          <div style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic' }}>
            * Fitur ini eksklusif untuk Admin sistem.
          </div>
        </div>

        <button 
          onClick={onClose}
          style={{ width: '100%', marginTop: '1rem', padding: '0.75rem', borderRadius: '0.5rem', background: 'var(--bg-card)', border: '1px solid var(--border)', color: '#fff', cursor: 'pointer' }}
        >
          Tutup
        </button>
      </div>
    </div>
  );
};

export default SettingsModal;
