import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../utils/api';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:7000';

export default function GameListDetailPage({ listId, user, showToast, onBack, onNavigateEntry }) {
  const [list, setList] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showInvitePanel, setShowInvitePanel] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', roblox_link: '' });
  const [submitting, setSubmitting] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // States for editing current game list
  const [showEditListModal, setShowEditListModal] = useState(false);
  const [listForm, setListForm] = useState({ name: '', description: '' });
  const [listSubmitting, setListSubmitting] = useState(false);

  const fetchList = async () => {
    setIsLoading(true);
    try {
      const res = await fetchWithAuth(`/api/lists/${listId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setList(data);
    } catch {
      showToast('Gagal memuat detail list.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditList = async (e) => {
    e.preventDefault();
    if (!listForm.name.trim()) return;
    setListSubmitting(true);
    try {
      const res = await fetchWithAuth(`/api/lists/${listId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(listForm),
      });
      if (!res.ok) throw new Error();
      showToast('Informasi list berhasil diperbarui! 📝', 'success');
      setShowEditListModal(false);
      fetchList();
    } catch {
      showToast('Gagal memperbarui informasi list.', 'error');
    } finally {
      setListSubmitting(false);
    }
  };

  useEffect(() => { fetchList(); }, [listId]);

  const handleAddEntry = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetchWithAuth(`/api/lists/${listId}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      showToast('Game berhasil ditambahkan! 🎮', 'success');
      setShowAddModal(false);
      setForm({ name: '', description: '', roblox_link: '' });
      fetchList();
    } catch {
      showToast('Gagal menambahkan game.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateEntry = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetchWithAuth(`/api/lists/${listId}/entries/${editEntry.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      showToast('Game berhasil diupdate!', 'success');
      setEditEntry(null);
      fetchList();
    } catch {
      showToast('Gagal mengupdate game.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteEntry = async (entry) => {
    if (!confirm(`Hapus "${entry.name}" dari list ini?`)) return;
    try {
      const res = await fetchWithAuth(`/api/lists/${listId}/entries/${entry.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      showToast('Game dihapus dari list.', 'success');
      fetchList();
    } catch {
      showToast('Gagal menghapus game.', 'error');
    }
  };

  const handleToggleStatus = async (entry) => {
    const newStatus = entry.status === 'to_play' ? 'played' : 'to_play';
    try {
      const res = await fetchWithAuth(`/api/lists/${listId}/entries/${entry.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      showToast(newStatus === 'played' ? '✅ Selamat! Game ditandai sudah dimainkan!' : '📋 Game dikembalikan ke rencana.', 'success');
      fetchList();
    } catch {
      showToast('Gagal mengubah status game.', 'error');
    }
  };

  const handleRegenerateCode = async () => {
    if (!confirm('Kode lama akan tidak berlaku. Lanjutkan?')) return;
    try {
      const res = await fetchWithAuth(`/api/lists/${listId}/invite`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error();
      showToast('Kode undangan baru dibuat!', 'success');
      setList(prev => ({ ...prev, invite_code: data.invite_code }));
    } catch {
      showToast('Gagal generate kode baru.', 'error');
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(list?.invite_code || '');
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const copyShareLink = () => {
    const link = `${window.location.origin}/public/${list?.share_token}`;
    navigator.clipboard.writeText(link);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  const inputStyle = {
    width: '100%', padding: '0.75rem 1rem', borderRadius: '0.5rem',
    border: '1px solid #334155', background: '#0f172a', color: '#f8fafc',
    fontSize: '0.9rem', outline: 'none', fontFamily: 'Inter, sans-serif',
  };

  const filteredEntries = (list?.entries || []).filter(e =>
    statusFilter === 'all' ? true : e.status === statusFilter
  );

  const toPlayCount = (list?.entries || []).filter(e => e.status === 'to_play').length;
  const playedCount = (list?.entries || []).filter(e => e.status === 'played').length;
  const isOwner = list?.owner_id === user?.id;

  if (isLoading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--text-muted)' }}>Memuat list...</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-dark)', padding: '2rem' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        {/* Back button */}
        <button onClick={onBack} style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
          fontSize: '0.9rem', marginBottom: '1.5rem', padding: 0,
        }}
          onMouseOver={e => e.currentTarget.style.color = '#f8fafc'}
          onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}
        >
          ← Kembali ke Daftar List
        </button>

        {/* List Header */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(59,130,246,0.1), rgba(139,92,246,0.1)), var(--bg-card)',
          borderRadius: '1.25rem', padding: '1.75rem 2rem', marginBottom: '2rem',
          border: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🎮 {list?.name}
                {isOwner && (
                  <button
                    onClick={() => {
                      setListForm({ name: list?.name || '', description: list?.description || '' });
                      setShowEditListModal(true);
                    }}
                    style={{
                      background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
                      fontSize: '1rem', padding: '0.2rem', display: 'inline-flex', alignItems: 'center',
                      transition: 'color 0.2s', outline: 'none'
                    }}
                    onMouseOver={e => e.currentTarget.style.color = '#60a5fa'}
                    onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}
                    title="Edit Informasi List"
                  >
                    ✏️
                  </button>
                )}
              </h1>
              {list?.description && <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>{list.description}</p>}
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  👥 {list?.members?.length ?? 0} anggota:&nbsp;
                  <strong style={{ color: '#f8fafc' }}>
                    {(list?.members || []).map(m => m.user?.roblox_display_name || m.user?.roblox_username || 'User').join(', ')}
                  </strong>
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => setShowInvitePanel(v => !v)}
                style={{
                  padding: '0.6rem 1.1rem', borderRadius: '0.5rem', border: '1px solid #334155',
                  background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '0.85rem',
                }}
              >🔗 Bagikan List</button>
              <button
                onClick={() => { setEditEntry(null); setForm({ name: '', description: '', roblox_link: '' }); setShowAddModal(true); }}
                style={{
                  padding: '0.6rem 1.1rem', borderRadius: '0.5rem', border: 'none',
                  background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                  color: '#fff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                }}
              >+ Tambah Game</button>
            </div>
          </div>

          {/* Invite code & Public Link panel */}
          {showInvitePanel && (
            <div style={{
              marginTop: '1.25rem', padding: '1.25rem', borderRadius: '0.75rem',
              background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', flexDirection: 'column', gap: '1rem',
            }}>
              {/* Invite Code */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ minWidth: '150px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Kode Undangan (Edit Akses)</span>
                  <span style={{ fontSize: '1.2rem', fontWeight: 700, letterSpacing: '0.15em', color: '#60a5fa' }}>{list?.invite_code}</span>
                </div>
                <button onClick={copyCode} style={{
                  padding: '0.45rem 0.9rem', borderRadius: '0.4rem', border: '1px solid rgba(96,165,250,0.4)',
                  background: codeCopied ? 'rgba(16,185,129,0.2)' : 'rgba(96,165,250,0.15)',
                  color: codeCopied ? '#34d399' : '#60a5fa', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                }}>
                  {codeCopied ? '✅ Disalin!' : '📋 Salin Kode'}
                </button>
                {isOwner && (
                  <button onClick={handleRegenerateCode} style={{
                    padding: '0.45rem 0.9rem', borderRadius: '0.4rem', border: '1px solid rgba(245,158,11,0.4)',
                    background: 'rgba(245,158,11,0.1)', color: '#fbbf24', cursor: 'pointer', fontSize: '0.8rem',
                  }}>🔄 Buat Baru</button>
                )}
              </div>

              {/* View-Only Shareable Link */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '220px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Link Bagikan Publik (View-Only)</span>
                  <input
                    style={{ ...inputStyle, padding: '0.45rem 0.75rem', background: '#0a0f1d', border: '1px solid #1e293b', fontSize: '0.8rem', color: '#a78bfa' }}
                    readOnly
                    value={`${window.location.origin}/public/${list?.share_token}`}
                  />
                </div>
                <button onClick={copyShareLink} style={{
                  padding: '0.45rem 0.9rem', borderRadius: '0.4rem', border: '1px solid rgba(167,139,250,0.4)',
                  background: shareCopied ? 'rgba(16,185,129,0.2)' : 'rgba(167,139,250,0.15)',
                  color: shareCopied ? '#34d399' : '#a78bfa', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                  marginTop: '1.2rem',
                }}>
                  {shareCopied ? '✅ Disalin!' : '📋 Salin Link'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Stats + Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {['all', 'to_play', 'played'].map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              style={{
                padding: '0.45rem 1rem', borderRadius: '9999px', border: '1px solid',
                borderColor: statusFilter === f ? 'transparent' : '#334155',
                background: statusFilter === f
                  ? f === 'played' ? 'linear-gradient(135deg, #10b981, #3b82f6)'
                    : f === 'to_play' ? 'linear-gradient(135deg, #f59e0b, #ef4444)'
                    : 'linear-gradient(135deg, #3b82f6, #8b5cf6)'
                  : 'transparent',
                color: statusFilter === f ? '#fff' : '#94a3b8',
                cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500,
                transition: 'all 0.2s',
              }}
            >
              {f === 'all' ? `Semua (${(list?.entries || []).length})` : f === 'to_play' ? `📋 Rencana (${toPlayCount})` : `✅ Dimainkan (${playedCount})`}
            </button>
          ))}
        </div>

        {/* Entries Grid */}
        {filteredEntries.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">{statusFilter === 'played' ? '🏆' : '📋'}</div>
            <h3 style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
              {statusFilter === 'played' ? 'Belum ada game yang dimainkan' : 'Belum ada game dalam rencana'}
            </h3>
            <p style={{ fontSize: '0.9rem' }}>Tambahkan game Roblox yang ingin dimainkan bersama!</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
            {filteredEntries.map(entry => (
              <GameEntryCard
                key={entry.id}
                entry={entry}
                onToggleStatus={() => handleToggleStatus(entry)}
                onEdit={() => { setEditEntry(entry); setForm({ name: entry.name, description: entry.description || '', roblox_link: entry.roblox_link || '' }); setShowAddModal(true); }}
                onDelete={() => handleDeleteEntry(entry)}
                onOpenGallery={() => onNavigateEntry(entry.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Entry Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => { setShowAddModal(false); setEditEntry(null); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontWeight: 700 }}>{editEntry ? '✏️ Edit Game' : '🆕 Tambah Game'}</h2>
              <button className="modal-close" onClick={() => { setShowAddModal(false); setEditEntry(null); }}>×</button>
            </div>
            <form onSubmit={editEntry ? handleUpdateEntry : handleAddEntry} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Nama Game *</label>
                <input style={inputStyle} placeholder="Contoh: Brookhaven 🏡RP" value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required autoFocus
                  onFocus={e => e.target.style.borderColor = '#3b82f6'} onBlur={e => e.target.style.borderColor = '#334155'} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Deskripsi (opsional)</label>
                <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '70px' }} placeholder="Kenapa mau main ini?"
                  value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  onFocus={e => e.target.style.borderColor = '#3b82f6'} onBlur={e => e.target.style.borderColor = '#334155'} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Link Roblox (opsional)</label>
                <input style={inputStyle} placeholder="https://www.roblox.com/games/..." value={form.roblox_link}
                  onChange={e => setForm(p => ({ ...p, roblox_link: e.target.value }))}
                  onFocus={e => e.target.style.borderColor = '#3b82f6'} onBlur={e => e.target.style.borderColor = '#334155'} />
              </div>
              <button type="submit" disabled={submitting} style={{
                padding: '0.75rem', borderRadius: '0.5rem', border: 'none',
                background: submitting ? '#334155' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                color: '#fff', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '0.95rem',
              }}>
                {submitting ? 'Menyimpan...' : editEntry ? '💾 Simpan Perubahan' : '✨ Tambahkan ke List'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit List Info Modal */}
      {showEditListModal && (
        <div className="modal-overlay" onClick={() => setShowEditListModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontWeight: 700 }}>📝 Edit Informasi List</h2>
              <button className="modal-close" onClick={() => setShowEditListModal(false)}>×</button>
            </div>
            <form onSubmit={handleEditList} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Nama List *</label>
                <input style={inputStyle} placeholder="Contoh: Petualangan Roblox Kita 💕" value={listForm.name}
                  onChange={e => setListForm(p => ({ ...p, name: e.target.value }))} required autoFocus
                  onFocus={e => e.target.style.borderColor = '#3b82f6'} onBlur={e => e.target.style.borderColor = '#334155'} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Deskripsi (opsional)</label>
                <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '70px' }} placeholder="Ceritakan tujuan list ini..."
                  value={listForm.description} onChange={e => setListForm(p => ({ ...p, description: e.target.value }))}
                  onFocus={e => e.target.style.borderColor = '#3b82f6'} onBlur={e => e.target.style.borderColor = '#334155'} />
              </div>
              <button type="submit" disabled={listSubmitting} style={{
                padding: '0.75rem', borderRadius: '0.5rem', border: 'none',
                background: listSubmitting ? '#334155' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                color: '#fff', fontWeight: 600, cursor: listSubmitting ? 'not-allowed' : 'pointer', fontSize: '0.95rem',
              }}>
                {listSubmitting ? 'Menyimpan...' : '💾 Simpan Perubahan'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function GameEntryCard({ entry, onToggleStatus, onEdit, onDelete, onOpenGallery }) {
  const isPlayed = entry.status === 'played';
  const mediaCount = entry.media?.length ?? 0;

  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: '1rem', padding: '1.25rem',
      border: `1px solid ${isPlayed ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.06)'}`,
      display: 'flex', flexDirection: 'column', gap: '0.75rem',
      transition: 'all 0.2s',
    }}>
      {/* Status badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{
          fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '9999px',
          background: isPlayed ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)',
          color: isPlayed ? '#34d399' : '#fbbf24',
          border: `1px solid ${isPlayed ? 'rgba(16,185,129,0.4)' : 'rgba(245,158,11,0.4)'}`,
        }}>
          {isPlayed ? '✅ Sudah Dimainkan' : '📋 Rencana'}
        </span>
        {isPlayed && entry.played_at && (
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {new Date(entry.played_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        )}
      </div>

      {/* Content */}
      <div>
        <h3 style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.3rem' }}>{entry.name}</h3>
        {entry.description && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.5,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {entry.description}
          </p>
        )}
        {entry.roblox_link && (
          <a href={entry.roblox_link} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ fontSize: '0.78rem', color: '#60a5fa', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.4rem' }}>
            🔗 Buka di Roblox
          </a>
        )}
      </div>

      {/* Added by */}
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        Ditambahkan oleh <strong style={{ color: '#f8fafc' }}>{entry.added_by?.roblox_display_name || entry.added_by?.roblox_username || 'Unknown'}</strong>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
        <button onClick={onToggleStatus} style={{
          flex: 1, padding: '0.4rem 0.5rem', borderRadius: '0.4rem', border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
          background: isPlayed ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)',
          color: isPlayed ? '#fbbf24' : '#34d399',
        }}>
          {isPlayed ? '↩ Rencana' : '✅ Tandai Dimainkan'}
        </button>
        {isPlayed && (
          <button onClick={onOpenGallery} style={{
            padding: '0.4rem 0.6rem', borderRadius: '0.4rem', border: '1px solid rgba(139,92,246,0.4)',
            background: 'rgba(139,92,246,0.1)', color: '#a78bfa', cursor: 'pointer', fontSize: '0.78rem',
          }}>
            📸 {mediaCount > 0 ? `${mediaCount} Foto/Video` : 'Galeri'}
          </button>
        )}
        <button onClick={onEdit} style={{
          padding: '0.4rem 0.6rem', borderRadius: '0.4rem', border: '1px solid rgba(255,255,255,0.08)',
          background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '0.78rem',
        }}>✏️</button>
        <button onClick={onDelete} style={{
          padding: '0.4rem 0.6rem', borderRadius: '0.4rem', border: '1px solid rgba(239,68,68,0.2)',
          background: 'rgba(239,68,68,0.08)', color: '#f87171', cursor: 'pointer', fontSize: '0.78rem',
        }}>🗑️</button>
      </div>
    </div>
  );
}
