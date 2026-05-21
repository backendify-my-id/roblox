import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../utils/api';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:7000';

export default function GameListsPage({ user, showToast, onNavigate }) {
  const [lists, setLists] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', description: '' });
  const [joinCode, setJoinCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchLists = async () => {
    setIsLoading(true);
    try {
      const res = await fetchWithAuth('/api/lists');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setLists(Array.isArray(data) ? data : []);
    } catch {
      showToast('Gagal memuat daftar list.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchLists(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!createForm.name.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetchWithAuth('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      if (!res.ok) throw new Error();
      showToast('List berhasil dibuat! 🎮', 'success');
      setShowCreateModal(false);
      setCreateForm({ name: '', description: '' });
      fetchLists();
    } catch {
      showToast('Gagal membuat list.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetchWithAuth('/api/lists/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_code: joinCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal bergabung');
      showToast('Berhasil bergabung ke list! 🎉', 'success');
      setShowJoinModal(false);
      setJoinCode('');
      fetchLists();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '0.75rem 1rem', borderRadius: '0.5rem',
    border: '1px solid #334155', background: '#0f172a', color: '#f8fafc',
    fontSize: '0.9rem', outline: 'none', transition: 'border-color 0.2s',
    fontFamily: 'Inter, sans-serif',
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-dark)', padding: '2rem' }}>
      {/* Header */}
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{
              fontSize: '2.2rem', fontWeight: 800,
              background: 'linear-gradient(to right, #ec4899, #8b5cf6)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              marginBottom: '0.35rem', letterSpacing: '-0.01em'
            }}>
              ✨ Roblox Co-Play Bucket Lists 💖
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
              Kelola daftar game Roblox yang ingin dimainkan bersama pasangan atau teman dekat, dan abadikan setiap kenangannya!
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowJoinModal(true)}
              style={{
                padding: '0.6rem 1.2rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.05)', color: '#94a3b8', cursor: 'pointer',
                fontSize: '0.9rem', fontWeight: 600, transition: 'all 0.2s',
              }}
              onMouseOver={e => { e.currentTarget.style.borderColor = '#ec4899'; e.currentTarget.style.color = '#fff'; }}
              onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#94a3b8'; }}
            >
              🔗 Gabung dengan Kode
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              style={{
                padding: '0.6rem 1.2rem', borderRadius: '0.75rem', border: 'none',
                background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
                color: '#fff', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 700,
                transition: 'opacity 0.2s', boxShadow: '0 4px 14px rgba(236,72,153,0.3)',
              }}
              onMouseOver={e => e.currentTarget.style.opacity = '0.9'}
              onMouseOut={e => e.currentTarget.style.opacity = '1'}
            >
              + Buat List Baru
            </button>
          </div>
        </div>

        {/* Lists Grid */}
        {isLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
            {[1,2,3].map(i => (
              <div key={i} className="skeleton" style={{ height: '180px', borderRadius: '1rem' }} />
            ))}
          </div>
        ) : lists.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🗂️</div>
            <h3 style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Belum ada list</h3>
            <p style={{ fontSize: '0.9rem' }}>Buat list baru atau gabung dengan kode undangan dari teman</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
            {lists.map(list => (
              <GameListCard
                key={list.id}
                list={list}
                currentUserId={user?.id}
                onOpen={() => onNavigate('listDetail', list.id)}
                onDeleted={fetchLists}
                showToast={showToast}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontWeight: 700 }}>🆕 Buat List Baru</h2>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>×</button>
            </div>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  Nama List *
                </label>
                <input
                  style={inputStyle}
                  placeholder="Contoh: Date Night Roblox 💕"
                  value={createForm.name}
                  onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))}
                  required
                  autoFocus
                  onFocus={e => e.target.style.borderColor = '#3b82f6'}
                  onBlur={e => e.target.style.borderColor = '#334155'}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  Deskripsi (opsional)
                </label>
                <textarea
                  style={{ ...inputStyle, resize: 'vertical', minHeight: '80px' }}
                  placeholder="Deskripsi singkat tentang list ini..."
                  value={createForm.description}
                  onChange={e => setCreateForm(p => ({ ...p, description: e.target.value }))}
                  onFocus={e => e.target.style.borderColor = '#3b82f6'}
                  onBlur={e => e.target.style.borderColor = '#334155'}
                />
              </div>
              <button
                type="submit"
                disabled={submitting || !createForm.name.trim()}
                style={{
                  padding: '0.75rem', borderRadius: '0.5rem', border: 'none',
                  background: submitting ? '#334155' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                  color: '#fff', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer',
                  fontSize: '0.95rem', transition: 'all 0.2s',
                }}
              >
                {submitting ? 'Membuat...' : '✨ Buat List'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Join Modal */}
      {showJoinModal && (
        <div className="modal-overlay" onClick={() => setShowJoinModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontWeight: 700 }}>🔗 Gabung dengan Kode</h2>
              <button className="modal-close" onClick={() => setShowJoinModal(false)}>×</button>
            </div>
            <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  Kode Undangan
                </label>
                <input
                  style={{ ...inputStyle, textTransform: 'uppercase', letterSpacing: '0.15em', fontSize: '1.1rem', textAlign: 'center' }}
                  placeholder="XXXXXXXX"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={20}
                  autoFocus
                  onFocus={e => e.target.style.borderColor = '#3b82f6'}
                  onBlur={e => e.target.style.borderColor = '#334155'}
                />
              </div>
              <button
                type="submit"
                disabled={submitting || !joinCode.trim()}
                style={{
                  padding: '0.75rem', borderRadius: '0.5rem', border: 'none',
                  background: submitting ? '#334155' : 'linear-gradient(135deg, #10b981, #3b82f6)',
                  color: '#fff', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer',
                  fontSize: '0.95rem',
                }}
              >
                {submitting ? 'Bergabung...' : '🚀 Gabung Sekarang'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function GameListCard({ list, currentUserId, onOpen, onDeleted, showToast }) {
  const isOwner = list.owner_id === currentUserId;
  const memberCount = list.members?.length ?? 0;
  const entryCount = list.entries?.length ?? 0;

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!confirm(`Hapus list "${list.name}"? Semua game dan media akan terhapus.`)) return;
    try {
      const res = await fetchWithAuth(`/api/lists/${list.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      showToast('List berhasil dihapus.', 'success');
      onDeleted();
    } catch {
      showToast('Gagal menghapus list.', 'error');
    }
  };

  const handleLeave = async (e) => {
    e.stopPropagation();
    if (!confirm(`Keluar dari list "${list.name}"?`)) return;
    try {
      const res = await fetchWithAuth(`/api/lists/${list.id}/leave`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      showToast('Anda telah keluar dari list.', 'success');
      onDeleted();
    } catch {
      showToast('Gagal keluar dari list.', 'error');
    }
  };

  const gradients = [
    'linear-gradient(135deg, rgba(236,72,153,0.12), rgba(139,92,246,0.12))',
    'linear-gradient(135deg, rgba(236,72,153,0.12), rgba(245,158,11,0.12))',
    'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(59,130,246,0.12))',
    'linear-gradient(135deg, rgba(236,72,153,0.12), rgba(16,185,129,0.12))',
  ];
  const gradient = gradients[list.id % gradients.length];

  return (
    <div
      onClick={onOpen}
      style={{
        background: `${gradient}, rgba(20, 27, 45, 0.4)`,
        backdropFilter: 'blur(10px)',
        borderRadius: '1.25rem', padding: '1.5rem',
        border: '1px solid rgba(255,255,255,0.06)',
        cursor: 'pointer', transition: 'all 0.25s ease',
        display: 'flex', flexDirection: 'column', gap: '0.75rem',
        position: 'relative', overflow: 'hidden',
      }}
      onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 16px 30px rgba(0,0,0,0.3)'; }}
      onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      {/* Owner badge */}
      {isOwner && (
        <span style={{
          position: 'absolute', top: '1rem', right: '1rem',
          fontSize: '0.68rem', fontWeight: 700, padding: '0.2rem 0.5rem',
          borderRadius: '0.25rem', background: 'rgba(59,130,246,0.2)',
          color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)',
        }}>OWNER</span>
      )}

      <div style={{ fontSize: '1.5rem' }}>🎮</div>

      <div>
        <h3 style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.25rem', paddingRight: '3rem' }}>{list.name}</h3>
        {list.description && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.5,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {list.description}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginTop: 'auto' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>🎯 {entryCount} game</span>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>👥 {memberCount} anggota</span>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.75rem' }}>
        {isOwner ? (
          <button
            onClick={handleDelete}
            style={{
              fontSize: '0.75rem', padding: '0.3rem 0.7rem', borderRadius: '0.35rem',
              border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)',
              color: '#f87171', cursor: 'pointer', transition: 'all 0.2s',
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(239,68,68,0.2)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
          >🗑️ Hapus</button>
        ) : (
          <button
            onClick={handleLeave}
            style={{
              fontSize: '0.75rem', padding: '0.3rem 0.7rem', borderRadius: '0.35rem',
              border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.1)',
              color: '#fbbf24', cursor: 'pointer', transition: 'all 0.2s',
            }}
          >🚪 Keluar</button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
          style={{
            marginLeft: 'auto', fontSize: '0.75rem', padding: '0.3rem 0.7rem', borderRadius: '0.35rem',
            border: 'none', background: 'rgba(59,130,246,0.2)', color: '#60a5fa',
            cursor: 'pointer', fontWeight: 600,
          }}
        >Buka →</button>
      </div>
    </div>
  );
}
