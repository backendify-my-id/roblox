import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../utils/api';

const SettingsModal = ({ user, onClose, showToast }) => {
  const [isStealth, setIsStealth] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [exempts, setExempts] = useState([]);
  const [newExemptUsername, setNewExemptUsername] = useState('');
  const [isAddingExempt, setIsAddingExempt] = useState(false);
  const [cookie, setCookie] = useState('');
  const [hasCookie, setHasCookie] = useState(false);
  const [isSavingCookie, setIsSavingCookie] = useState(false);

  // Ganti Password states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      showToast('Harap isi semua field password', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Konfirmasi password baru tidak cocok', 'error');
      return;
    }
    if (newPassword.length < 6) {
      showToast('Password baru minimal 6 karakter', 'error');
      return;
    }

    setIsChangingPassword(true);
    try {
      const res = await fetchWithAuth('/api/user/change-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: currentPassword.trim(),
          new_password: newPassword.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengubah password');

      showToast('Password berhasil diperbarui', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Ambil status terbaru dari database saat modal dibuka
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetchWithAuth('/api/user/settings');
        if (!res.ok) throw new Error('Gagal mengambil pengaturan');
        const data = await res.json();
        setIsStealth(data.is_stealth);
        setExempts(data.exempts || []);
        setHasCookie(data.has_cookie || false);
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

  const handleAddExempt = async (e) => {
    e.preventDefault();
    if (!newExemptUsername.trim()) return;
    
    setIsAddingExempt(true);
    try {
      const res = await fetchWithAuth('/api/user/stealth-exemptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newExemptUsername })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menambahkan');
      
      setExempts(prev => [...prev, data.exempt]);
      setNewExemptUsername('');
      showToast('Berhasil menambahkan pengecualian', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsAddingExempt(false);
    }
  };

  const handleRemoveExempt = async (id) => {
    try {
      const res = await fetchWithAuth(`/api/user/stealth-exemptions/${id}`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error('Gagal menghapus pengecualian');
      
      setExempts(prev => prev.filter(e => e.id !== id));
      showToast('Berhasil menghapus pengecualian', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleSaveCookie = async () => {
    if (!cookie.trim()) {
      showToast('Masukkan cookie terlebih dahulu', 'error');
      return;
    }
    setIsSavingCookie(true);
    try {
      const res = await fetchWithAuth('/api/user/roblox-cookie', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookie: cookie.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan cookie');
      
      setHasCookie(true);
      setCookie('');
      showToast('Cookie Roblox berhasil disimpan dan terenkripsi', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsSavingCookie(false);
    }
  };

  const handleDeleteCookie = async () => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus cookie Roblox Anda dan beralih menggunakan cookie global?')) return;
    setIsSavingCookie(true);
    try {
      const res = await fetchWithAuth('/api/user/roblox-cookie', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookie: '' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus cookie');
      
      setHasCookie(false);
      setCookie('');
      showToast('Cookie berhasil dihapus. Sistem beralih ke cookie global.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsSavingCookie(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h3>Pengaturan Akun</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        
        <div style={{ padding: '1rem 0' }}>
          {user.role === 'admin' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'rgba(59,130,246,0.05)', borderRadius: '0.75rem', border: '1px solid rgba(59,130,246,0.1)' }}>
                <div>
                  <div style={{ fontWeight: '600', color: '#fff', marginBottom: '0.25rem' }}>Mode Siluman (Stealth)</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '280px' }}>
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

              {isStealth && (
                <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                  <h4 style={{ color: '#fff', marginBottom: '0.5rem', fontSize: '1rem' }}>Pengecualian (Exemptions)</h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                    Pengguna di bawah ini akan melihat status Anda yang sebenarnya (Mode Siluman tidak berlaku untuk mereka).
                  </p>

                  <form onSubmit={handleAddExempt} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                    <input
                      type="text"
                      placeholder="Username Roblox target..."
                      value={newExemptUsername}
                      onChange={e => setNewExemptUsername(e.target.value)}
                      style={{ flex: 1, padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--bg-card)', color: '#fff' }}
                      required
                    />
                    <button 
                      type="submit" 
                      disabled={isAddingExempt || !newExemptUsername}
                      style={{ padding: '0 1rem', borderRadius: '0.5rem', background: '#3b82f6', color: '#fff', border: 'none', cursor: isAddingExempt ? 'not-allowed' : 'pointer' }}
                    >
                      {isAddingExempt ? '...' : 'Tambah'}
                    </button>
                  </form>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '150px', overflowY: 'auto' }}>
                    {exempts.length === 0 ? (
                      <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '1rem 0' }}>
                        Belum ada pengecualian.
                      </div>
                    ) : (
                      exempts.map(ex => (
                        <div key={ex.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-card)', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {ex.avatar_url ? (
                              <img src={ex.avatar_url} alt="" style={{ width: 24, height: 24, borderRadius: '50%' }} />
                            ) : (
                              <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#334155' }} />
                            )}
                            <span style={{ color: '#fff', fontSize: '0.9rem' }}>@{ex.username}</span>
                          </div>
                          <button 
                            onClick={() => handleRemoveExempt(ex.id)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.2rem' }}
                            title="Hapus pengecualian"
                          >
                            &times;
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Cookie Roblox Section */}
          <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
            <h4 style={{ color: '#fff', marginBottom: '0.5rem', fontSize: '1rem' }}>Cookie Roblox (.ROBLOSECURITY)</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Masukkan cookie Roblox Anda untuk melacak teman dengan hak akses akun Anda. Kosongkan untuk menggunakan cookie global default (.env).
            </p>
            {hasCookie && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', padding: '0.5rem', borderRadius: '0.375rem', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', fontSize: '0.85rem', color: '#4ade80' }}>
                <span>🛡️ Cookie tersimpan secara terenkripsi</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="password"
                placeholder="Paste .ROBLOSECURITY cookie..."
                value={cookie}
                onChange={e => setCookie(e.target.value)}
                style={{ flex: 1, padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--bg-card)', color: '#fff', fontSize: '0.9rem' }}
              />
              <button
                onClick={handleSaveCookie}
                disabled={isSavingCookie}
                style={{ padding: '0 1rem', borderRadius: '0.5rem', background: '#3b82f6', color: '#fff', border: 'none', cursor: isSavingCookie ? 'not-allowed' : 'pointer', fontSize: '0.9rem' }}
              >
                {isSavingCookie ? 'Menyimpan...' : 'Simpan'}
              </button>
              {hasCookie && (
                <button
                  onClick={handleDeleteCookie}
                  disabled={isSavingCookie}
                  style={{ padding: '0 1rem', borderRadius: '0.5rem', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', cursor: isSavingCookie ? 'not-allowed' : 'pointer', fontSize: '0.9rem' }}
                >
                  Hapus
                </button>
              )}
            </div>
          </div>

          {/* Ganti Password Section */}
          <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
            <h4 style={{ color: '#fff', marginBottom: '0.75rem', fontSize: '1rem' }}>Ganti Password Akun</h4>
            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Password Lama</label>
                <input
                  type="password"
                  placeholder="Masukkan password lama..."
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--bg-card)', color: '#fff', fontSize: '0.85rem' }}
                  required
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Password Baru</label>
                  <input
                    type="password"
                    placeholder="Minimal 6 karakter..."
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--bg-card)', color: '#fff', fontSize: '0.85rem' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Konfirmasi Password</label>
                  <input
                    type="password"
                    placeholder="Ulangi password baru..."
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'var(--bg-card)', color: '#fff', fontSize: '0.85rem' }}
                    required
                  />
                </div>
              </div>
              {newPassword && confirmPassword && (
                <div style={{ fontSize: '0.8rem', color: newPassword === confirmPassword ? '#4ade80' : '#f87171' }}>
                  {newPassword === confirmPassword ? '✓ Password cocok' : '✗ Konfirmasi password tidak cocok'}
                </div>
              )}
              <button
                type="submit"
                disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword || newPassword.length < 6}
                style={{
                  width: '100%',
                  marginTop: '0.5rem',
                  padding: '0.6rem',
                  borderRadius: '0.5rem',
                  background: 'linear-gradient(to right, #3b82f6, #60a5fa)',
                  color: '#fff',
                  border: 'none',
                  cursor: (isChangingPassword || newPassword !== confirmPassword || newPassword.length < 6) ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  opacity: (isChangingPassword || newPassword !== confirmPassword || newPassword.length < 6) ? 0.7 : 1
                }}
              >
                {isChangingPassword ? 'Memproses...' : 'Ubah Password'}
              </button>
            </form>
          </div>
          
          <div style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic' }}>
            * Fitur ini eksklusif untuk Admin sistem.
          </div>
        </div>

        <button 
          onClick={onClose}
          style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem', borderRadius: '0.5rem', background: 'var(--bg-card)', border: '1px solid var(--border)', color: '#fff', cursor: 'pointer' }}
        >
          Tutup
        </button>
      </div>
    </div>
  );
};

export default SettingsModal;
