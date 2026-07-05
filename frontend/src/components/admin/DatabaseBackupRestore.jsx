import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../../utils/api';

/**
 * DatabaseBackupRestore Component
 * Handles local manual SQL backups, restores, and scheduled backup archives.
 * 
 * @param {Object} props
 * @param {Function} props.showToast - Function to trigger dynamic toasts
 * @param {Function} props.handleBackup - Function to trigger local database download
 * @param {Function} props.handleRestore - Function to handle database restoration uploads
 * @param {Boolean} props.isRestoring - State of global restore operation
 */
const DatabaseBackupRestore = ({ showToast, handleBackup, handleRestore, isRestoring }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [autoBackups, setAutoBackups] = useState([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isTriggeringBackup, setIsTriggeringBackup] = useState(false);
  const [isRestoringArchive, setIsRestoringArchive] = useState(null);

  const fetchAutoBackups = async () => {
    setIsLoadingList(true);
    try {
      const res = await fetchWithAuth('/api/admin/backups/list');
      if (!res.ok) throw new Error('Gagal memuat arsip backup otomatis');
      const data = await res.json();
      setAutoBackups(Array.isArray(data) ? data : []);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    fetchAutoBackups();
  }, []);

  const onFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.name.endsWith('.sql')) {
      setSelectedFile(file);
    } else {
      showToast('Hanya mendukung format file SQL (.sql)', 'error');
      setSelectedFile(null);
    }
  };

  const triggerRestore = () => {
    if (!selectedFile) return;
    const fakeEvent = {
      target: {
        files: [selectedFile],
        value: ''
      }
    };
    handleRestore(fakeEvent);
  };

  const handleTriggerAutoBackup = async () => {
    setIsTriggeringBackup(true);
    showToast('Sedang membuat backup otomatis baru...', 'info');
    try {
      const res = await fetchWithAuth('/api/admin/backups/trigger-auto', {
        method: 'POST'
      });
      if (!res.ok) throw new Error('Gagal memicu backup otomatis');
      const data = await res.json();
      showToast(data.message || 'Backup otomatis berhasil dibuat', 'success');
      fetchAutoBackups();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsTriggeringBackup(false);
    }
  };

  const handleDownloadFile = async (filename) => {
    try {
      const res = await fetchWithAuth(`/api/admin/backups/download/${filename}`);
      if (!res.ok) throw new Error('Gagal mengunduh file backup');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteFile = async (filename) => {
    if (!await window.customConfirm(`Apakah Anda yakin ingin menghapus file backup "${filename}"?`)) return;
    try {
      const res = await fetchWithAuth(`/api/admin/backups/delete/${filename}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Gagal menghapus file backup');
      showToast('File backup berhasil dihapus', 'success');
      fetchAutoBackups();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleRestoreFromArchive = async (filename) => {
    const confirmRestore = await window.customConfirm(
      `PERINGATAN KRITIS:\nMemulihkan database dari arsip "${filename}" akan menghapus seluruh data aktif saat ini.\n\nApakah Anda yakin ingin melanjutkan?`
    );
    if (!confirmRestore) return;

    setIsRestoringArchive(filename);
    showToast('Sedang memulihkan basis data dari arsip, mohon tunggu...', 'info');
    try {
      const res = await fetchWithAuth(`/api/admin/backups/restore/${filename}`, {
        method: 'POST'
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Gagal memulihkan database');
      }
      showToast('Database berhasil dipulihkan!', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      showToast(err.message, 'error');
      setIsRestoringArchive(null);
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1rem' }}>
      {/* Description Intro Card */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '1.5rem', borderRadius: '1rem' }}>
        <h3 style={{ margin: '0 0 0.5rem 0', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          💾 Manajemen Ekspor & Impor Database
        </h3>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5' }}>
          Gunakan modul ini untuk mencadangkan data pelacakan Anda secara manual atau memulihkan database dari cadangan yang disimpan sebelumnya. Fitur ini mengekspor file SQL skema lengkap termasuk data akun, teman, riwayat aktivitas, dan log audit sistem.
        </p>
      </div>

      {/* Main Grid: Backup Card vs Restore Card */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {/* Backup Card */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '1.5rem', borderRadius: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1.5rem' }}>
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#fff', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              📥 Pencadangan (Backup)
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              Membuat salinan basis data instan. File SQL yang diunduh dapat disimpan dengan aman sebagai arsip lokal.
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '0.75rem', marginTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                <span>Format Output:</span>
                <strong style={{ color: '#10b981' }}>SQL (.sql)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <span>Kompresi:</span>
                <strong>Tidak ada (Teks SQL)</strong>
              </div>
            </div>
          </div>

          <button
            onClick={handleBackup}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#fff',
              border: 'none',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              boxShadow: '0 4px 10px rgba(16,185,129,0.2)',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem'
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'none'}
          >
            📥 Unduh Backup Database (.sql)
          </button>
        </div>

        {/* Restore Card */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '1.5rem', borderRadius: '1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#fff', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              📤 Pemulihan (Restore)
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              Memulihkan basis data dari cadangan file SQL. Proses ini akan menimpa seluruh data yang ada saat ini.
            </div>

            {/* Warning Banner */}
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', padding: '0.75rem 1rem', borderRadius: '0.5rem', fontSize: '0.8rem', marginTop: '1rem', lineHeight: '1.4' }}>
              ⚠️ <strong>PERINGATAN KRITIS:</strong> Seluruh data aktif di sistem (termasuk riwayat login, pelacakan teman, dan log aktivitas) akan dihapus total dan digantikan oleh isi file SQL backup.
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Drag & Drop File Picker */}
            <div style={{ position: 'relative', border: '2px dashed rgba(255,255,255,0.15)', padding: '1.5rem', borderRadius: '0.75rem', textAlign: 'center', background: 'rgba(0,0,0,0.2)', cursor: 'pointer', transition: 'all 0.2s' }}>
              <input
                type="file"
                accept=".sql"
                onChange={onFileChange}
                disabled={isRestoring || isRestoringArchive}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
              />
              <span style={{ fontSize: '1.5rem', display: 'block', marginBottom: '0.5rem' }}>📁</span>
              <span style={{ fontSize: '0.8rem', color: selectedFile ? '#60a5fa' : 'var(--text-muted)', fontWeight: selectedFile ? 600 : 'normal' }}>
                {selectedFile ? `File Terpilih: ${selectedFile.name}` : 'Klik untuk memilih file backup SQL'}
              </span>
            </div>

            {selectedFile && (
              <button
                onClick={triggerRestore}
                disabled={isRestoring || isRestoringArchive}
                style={{
                  width: '100%',
                  background: (isRestoring || isRestoringArchive) ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  color: '#fff',
                  border: 'none',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: (isRestoring || isRestoringArchive) ? 'not-allowed' : 'pointer',
                  boxShadow: (isRestoring || isRestoringArchive) ? 'none' : '0 4px 10px rgba(239,68,68,0.2)',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem'
                }}
              >
                {isRestoring ? '⏳ Memulihkan Database...' : '🚀 Mulai Pemulihan (Mereset Data)'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Auto Backup Archive List Card */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden', marginTop: '1rem' }}>
        <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h4 style={{ margin: 0, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              📦 Arsip Backup Otomatis & Terjadwal
            </h4>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              File tersimpan secara lokal di folder <code>uploads/db/</code>. Cadangan otomatis dibuat setiap hari pukul 00:00.
            </span>
          </div>

          <button
            onClick={handleTriggerAutoBackup}
            disabled={isTriggeringBackup || isRestoring || isRestoringArchive}
            style={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              color: '#fff',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: (isTriggeringBackup || isRestoring || isRestoringArchive) ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            {isTriggeringBackup ? '⏳ Membuat Backup...' : '⚡ Trigger Backup Otomatis Sekarang'}
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '1rem' }}>Nama File</th>
                <th style={{ padding: '1rem' }}>Waktu Pencadangan</th>
                <th style={{ padding: '1rem' }}>Ukuran File</th>
                <th style={{ padding: '1rem', textAlign: 'right' }}>Aksi / Operasi</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingList ? (
                <tr>
                  <td colSpan="4" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Memuat daftar arsip backup...
                  </td>
                </tr>
              ) : autoBackups.length === 0 ? (
                <tr>
                  <td colSpan="4" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Belum ada arsip backup otomatis di folder <code>uploads/db</code>.
                  </td>
                </tr>
              ) : (
                autoBackups.map((backup, idx) => {
                  const isThisRestoring = isRestoringArchive === backup.filename;
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.01)'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                      <td style={{ padding: '1rem', color: '#fff', fontWeight: 600 }}>
                        📄 {backup.filename}
                      </td>
                      <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>
                        {new Date(backup.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'medium' })}
                      </td>
                      <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>
                        {formatBytes(backup.size)}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => handleDownloadFile(backup.filename)}
                            disabled={isRestoring || isRestoringArchive}
                            style={{
                              background: 'rgba(59,130,246,0.15)',
                              color: '#60a5fa',
                              border: '1px solid rgba(59,130,246,0.3)',
                              padding: '0.3rem 0.75rem',
                              borderRadius: '0.35rem',
                              cursor: (isRestoring || isRestoringArchive) ? 'not-allowed' : 'pointer',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              transition: 'all 0.2s'
                            }}
                          >
                            📥 Download
                          </button>

                          <button
                            onClick={() => handleRestoreFromArchive(backup.filename)}
                            disabled={isRestoring || isRestoringArchive}
                            style={{
                              background: 'rgba(239,68,68,0.15)',
                              color: '#f87171',
                              border: '1px solid rgba(239,68,68,0.3)',
                              padding: '0.3rem 0.75rem',
                              borderRadius: '0.35rem',
                              cursor: (isRestoring || isRestoringArchive) ? 'not-allowed' : 'pointer',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              transition: 'all 0.2s'
                            }}
                          >
                            {isThisRestoring ? '⏳ Memulihkan...' : '🚀 Restore'}
                          </button>

                          <button
                            onClick={() => handleDeleteFile(backup.filename)}
                            disabled={isRestoring || isRestoringArchive}
                            style={{
                              background: 'rgba(255,255,255,0.05)',
                              color: '#94a3b8',
                              border: '1px solid rgba(255,255,255,0.1)',
                              padding: '0.3rem 0.75rem',
                              borderRadius: '0.35rem',
                              cursor: (isRestoring || isRestoringArchive) ? 'not-allowed' : 'pointer',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              transition: 'all 0.2s'
                            }}
                          >
                            🗑️ Hapus
                          </button>
                        </div>
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

export default DatabaseBackupRestore;
