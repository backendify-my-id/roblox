import React, { useState, useEffect } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:7000';

export default function PublicGameListPage({ shareToken, onBack }) {
  const [list, setList] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [lightbox, setLightbox] = useState(null); // { mediaList: [], index: 0 }
  const [viewingReviews, setViewingReviews] = useState(null); // entry being viewed for reviews

  useEffect(() => {
    const fetchPublicList = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`${BACKEND_URL}/api/public/lists/${shareToken}`);
        if (!res.ok) {
          if (res.status === 404) throw new Error('List tidak ditemukan atau link berbagi sudah tidak aktif.');
          throw new Error('Gagal memuat list.');
        }
        const data = await res.json();
        setList(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPublicList();
  }, [shareToken]);

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        Memuat Game List bersama... 🎮
      </div>
    );
  }

  if (error || !list) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-dark)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
        <h2 style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Link Tidak Valid</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '1.5rem', maxWidth: '400px' }}>{error}</p>
        <button onClick={onBack} style={{
          padding: '0.6rem 1.5rem', borderRadius: '0.5rem', border: 'none',
          background: 'var(--accent-primary)', color: '#fff', cursor: 'pointer', fontWeight: 600
        }}>Kembali</button>
      </div>
    );
  }

  const entries = list.entries || [];
  const filteredEntries = entries.filter(e =>
    statusFilter === 'all' ? true : e.status === statusFilter
  );

  const toPlayCount = entries.filter(e => e.status === 'to_play').length;
  const playedCount = entries.filter(e => e.status === 'played').length;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-dark)', padding: '2rem' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(236,72,153,0.08), rgba(139,92,246,0.08)), var(--bg-card)',
          borderRadius: '1.25rem', padding: '2rem', marginBottom: '2rem',
          border: '1px solid rgba(255,255,255,0.06)',
          textAlign: 'center', position: 'relative', overflow: 'hidden'
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>💖</div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, background: 'linear-gradient(to right, #ec4899, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '0.5rem' }}>
            {list.name}
          </h1>
          {list.description && <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '1rem', maxWidth: '600px', margin: '0 auto 1rem' }}>{list.description}</p>}
          
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <span>Dibuat oleh <strong style={{ color: '#f8fafc' }}>{list.owner?.roblox_display_name || list.owner?.roblox_username}</strong></span>
            <span>•</span>
            <span>👥 {list.members?.length} anggota</span>
          </div>

          <span style={{
            position: 'absolute', top: '1rem', right: '1rem',
            fontSize: '0.65rem', fontWeight: 700, padding: '0.2rem 0.5rem',
            borderRadius: '0.25rem', background: 'rgba(16,185,129,0.2)',
            color: '#34d399', border: '1px solid rgba(16,185,129,0.3)',
          }}>VIEW ONLY MODE</span>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
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
                    : 'linear-gradient(135deg, #ec4899, #8b5cf6)'
                  : 'transparent',
                color: statusFilter === f ? '#fff' : '#94a3b8',
                cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500,
                transition: 'all 0.2s',
              }}
            >
              {f === 'all' ? `Semua (${entries.length})` : f === 'to_play' ? `📋 Rencana (${toPlayCount})` : `✅ Dimainkan (${playedCount})`}
            </button>
          ))}
        </div>

        {/* Entries Grid */}
        {filteredEntries.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🗂️</div>
            <h3 style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Belum ada game</h3>
            <p style={{ fontSize: '0.85rem' }}>List game ini masih kosong dalam kategori ini.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '1.5rem' }}>
            {filteredEntries.map(entry => (
              <PublicEntryCard
                key={entry.id}
                entry={entry}
                onOpenMedia={(mediaList, index) => setLightbox({ mediaList, index })}
                onOpenReviews={() => setViewingReviews(entry)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Lightbox for media */}
      {lightbox && lightbox.mediaList[lightbox.index] && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
            backdropFilter: 'blur(6px)', zIndex: 200, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setLightbox(null)}
        >
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            {/* Navigation */}
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
              <button onClick={() => setLightbox(l => ({ ...l, index: l.index > 0 ? l.index - 1 : l.index }))}
                disabled={lightbox.index === 0}
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '50%', width: '40px', height: '40px', cursor: lightbox.index === 0 ? 'default' : 'pointer', fontSize: '1.2rem', opacity: lightbox.index === 0 ? 0.3 : 1 }}>
                ‹
              </button>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{lightbox.index + 1} / {lightbox.mediaList.length}</span>
              <button onClick={() => setLightbox(l => ({ ...l, index: l.index < l.mediaList.length - 1 ? l.index + 1 : l.index }))}
                disabled={lightbox.index === lightbox.mediaList.length - 1}
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '50%', width: '40px', height: '40px', cursor: lightbox.index === lightbox.mediaList.length - 1 ? 'default' : 'pointer', fontSize: '1.2rem', opacity: lightbox.index === lightbox.mediaList.length - 1 ? 0.3 : 1 }}>
                ›
              </button>
            </div>

            {/* Media file */}
            {lightbox.mediaList[lightbox.index].file_type === 'video' ? (
              <video src={`${BACKEND_URL}${lightbox.mediaList[lightbox.index].file_url}`} controls style={{ maxWidth: '85vw', maxHeight: '70vh', borderRadius: '0.75rem' }} />
            ) : (
              <img src={`${BACKEND_URL}${lightbox.mediaList[lightbox.index].file_url}`} alt={lightbox.mediaList[lightbox.index].caption} style={{ maxWidth: '85vw', maxHeight: '70vh', borderRadius: '0.75rem', objectFit: 'contain' }} />
            )}

            {/* Caption */}
            <div style={{ textAlign: 'center' }}>
              {lightbox.mediaList[lightbox.index].caption && <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{lightbox.mediaList[lightbox.index].caption}</p>}
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                Diunggah oleh {lightbox.mediaList[lightbox.index].uploaded_by?.roblox_display_name || lightbox.mediaList[lightbox.index].uploaded_by?.roblox_username || 'Unknown'}
              </p>
            </div>

            <button onClick={() => setLightbox(null)} style={{
              position: 'fixed', top: '1.5rem', right: '1.5rem', background: 'rgba(255,255,255,0.1)',
              border: 'none', color: '#fff', borderRadius: '50%', width: '44px', height: '44px',
              cursor: 'pointer', fontSize: '1.4rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>×</button>
          </div>
        </div>
      )}

      {/* Reviews Modal */}
      {viewingReviews && (
        <div className="modal-overlay" onClick={() => setViewingReviews(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2 style={{ fontWeight: 700 }}>💬 Ulasan Kelompok</h2>
              <button className="modal-close" onClick={() => setViewingReviews(null)}>×</button>
            </div>
            
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '1rem', color: '#f8fafc' }}>{viewingReviews.roblox_map?.name || 'Tidak Diketahui'}</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {(viewingReviews.reviews || []).length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '1rem' }}>Belum ada ulasan dari anggota kelompok.</p>
              ) : (
                (viewingReviews.reviews || []).map(rev => (
                  <div key={rev.id} style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#60a5fa' }}>{rev.user?.roblox_display_name || rev.user?.roblox_username}</span>
                      <span style={{ color: '#fbbf24', fontSize: '0.85rem' }}>{'★'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}</span>
                    </div>
                    {rev.comment && <p style={{ fontSize: '0.85rem', lineHeight: 1.5, color: '#e2e8f0' }}>"{rev.comment}"</p>}
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.5rem', textAlign: 'right' }}>
                      {new Date(rev.created_at).toLocaleDateString('id-ID')}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PublicEntryCard({ entry, onOpenMedia, onOpenReviews }) {
  const isPlayed = entry.status === 'played';
  const media = entry.media || [];
  const reviews = entry.reviews || [];

  // Compute average rating
  const avgRating = reviews.length > 0
    ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)
    : null;

  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: '1rem', padding: '1.5rem',
      border: `1px solid ${isPlayed ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)'}`,
      display: 'flex', flexDirection: 'column', gap: '0.85rem'
    }}>
      {/* Badge & Rating */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.55rem', borderRadius: '9999px',
          background: isPlayed ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
          color: isPlayed ? '#34d399' : '#fbbf24',
          border: `1px solid ${isPlayed ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
        }}>
          {isPlayed ? '✅ Played' : '📋 Rencana'}
        </span>
        {avgRating && (
          <span style={{ fontSize: '0.85rem', color: '#fbbf24', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.15rem' }}>
            ★ {avgRating} <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>({reviews.length})</span>
          </span>
        )}
      </div>

      {/* Main Info */}
      <div>
        <h3 style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.3rem' }}>{entry.roblox_map?.name || 'Tidak Diketahui'}</h3>
        {entry.description && <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.4 }}>{entry.description}</p>}
        {entry.roblox_map?.url_path && (
          <a href={`https://www.roblox.com${entry.roblox_map.url_path}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.78rem', color: '#60a5fa', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.4rem' }}>
            🔗 Buka di Roblox
          </a>
        )}
      </div>

      {/* Media Gallery (Preview) */}
      {isPlayed && media.length > 0 && (
        <div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>📸 Galeri Kenangan:</span>
          <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.3rem' }}>
            {media.map((item, idx) => (
              <div
                key={item.id}
                onClick={() => onOpenMedia(media, idx)}
                style={{
                  width: '50px', height: '50px', borderRadius: '0.35rem', overflow: 'hidden',
                  background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)',
                  cursor: 'pointer', flexShrink: 0
                }}
              >
                {item.file_type === 'video' ? (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1e293b', fontSize: '0.8rem' }}>▶️</div>
                ) : (
                  <img src={`${BACKEND_URL}${item.file_url}`} alt="thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reviews (Preview) */}
      {isPlayed && reviews.length > 0 && (
        <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.65rem' }}>
          <button
            onClick={onOpenReviews}
            style={{
              background: 'none', border: 'none', color: '#a78bfa', fontSize: '0.78rem',
              cursor: 'pointer', padding: 0, fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.25rem'
            }}
          >
            💬 Lihat {reviews.length} Ulasan Kelompok →
          </button>
        </div>
      )}
    </div>
  );
}
