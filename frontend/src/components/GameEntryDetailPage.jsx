import React, { useState, useEffect, useRef } from 'react';
import { fetchWithAuth } from '../utils/api';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:7000';

export default function GameEntryDetailPage({ listId, entryId, user, showToast, onBack }) {
  const [entry, setEntry] = useState(null);
  const [media, setMedia] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null); // index of media being viewed
  const [uploading, setUploading] = useState(false);
  const [uploadCaption, setUploadCaption] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef();

  // Review states
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [hoveredStar, setHoveredStar] = useState(null);
  const [submittingReview, setSubmittingReview] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [listRes, mediaRes, reviewsRes] = await Promise.all([
        fetchWithAuth(`/api/lists/${listId}`),
        fetchWithAuth(`/api/lists/${listId}/entries/${entryId}/media`),
        fetchWithAuth(`/api/lists/${listId}/entries/${entryId}/reviews`),
      ]);
      if (listRes.ok) {
        const listData = await listRes.json();
        const found = (listData.entries || []).find(e => e.id === Number(entryId));
        setEntry(found || null);
      }
      if (mediaRes.ok) {
        const mediaData = await mediaRes.json();
        setMedia(Array.isArray(mediaData) ? mediaData : []);
      }
      if (reviewsRes.ok) {
        const reviewsData = await reviewsRes.json();
        const revs = Array.isArray(reviewsData) ? reviewsData : [];
        setReviews(revs);
        
        // Pre-fill my review if already exists
        const mine = revs.find(r => r.user_id === user?.id);
        if (mine) {
          setRating(mine.rating);
          setComment(mine.comment || '');
        }
      }
    } catch {
      showToast('Gagal memuat data galeri.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [listId, entryId]);

  const handleUpload = async (file) => {
    if (!file) return;
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      showToast('File terlalu besar. Maksimum 100MB.', 'error');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('media', file);
      formData.append('caption', uploadCaption);

      const token = localStorage.getItem('token');
      const res = await fetch(`${BACKEND_URL}/api/lists/${listId}/entries/${entryId}/media`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Upload gagal');
      }
      showToast('Media berhasil diupload! 📸', 'success');
      setUploadCaption('');
      fetchData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const handleDelete = async (mediaItem) => {
    if (!await window.customConfirm('Hapus foto/video ini?')) return;
    try {
      const res = await fetchWithAuth(`/api/lists/${listId}/entries/${entryId}/media/${mediaItem.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      showToast('Media dihapus.', 'success');
      setMedia(prev => prev.filter(m => m.id !== mediaItem.id));
      if (lightbox !== null && media[lightbox]?.id === mediaItem.id) setLightbox(null);
    } catch {
      showToast('Gagal menghapus media.', 'error');
    }
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    setSubmittingReview(true);
    try {
      const res = await fetchWithAuth(`/api/lists/${listId}/entries/${entryId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment }),
      });
      if (!res.ok) throw new Error();
      showToast('Ulasan berhasil disimpan! ✨', 'success');
      
      // Reload reviews
      const reviewsRes = await fetchWithAuth(`/api/lists/${listId}/entries/${entryId}/reviews`);
      if (reviewsRes.ok) {
        const reviewsData = await reviewsRes.json();
        setReviews(Array.isArray(reviewsData) ? reviewsData : []);
      }
    } catch {
      showToast('Gagal menyimpan ulasan.', 'error');
    } finally {
      setSubmittingReview(false);
    }
  };

  const canDelete = (item) => item.uploaded_by_id === user?.id;

  if (isLoading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: 'var(--text-muted)' }}>Memuat galeri...</span>
    </div>
  );

  const currentMedia = lightbox !== null ? media[lightbox] : null;

  // Compute average rating
  const avgRating = reviews.length > 0
    ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)
    : null;

  const mySubmitLabel = reviews.some(r => r.user_id === user?.id) ? 'Perbarui Ulasan' : 'Kirim Ulasan';

  return (
    <div className="lists-page-container">
      <div className="lists-page-content">
        {/* Back */}
        <button onClick={onBack} className="back-button">
          ← Kembali ke List
        </button>

        {/* Entry Info */}
        <div className="entry-detail-header-card">
          <div className="entry-detail-header-flex">
            <div>
              <span style={{
                display: 'inline-block', marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.65rem',
                borderRadius: '9999px', background: entry?.status === 'played' ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)',
                color: entry?.status === 'played' ? '#34d399' : '#fbbf24',
              }}>
                {entry?.status === 'played' ? '✅ Sudah Dimainkan' : '📋 Rencana'}
              </span>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.4rem' }}>{entry?.name}</h1>
              {entry?.description && <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{entry.description}</p>}
              {entry?.roblox_link && (
                <a href={entry.roblox_link} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.5rem', color: '#60a5fa', fontSize: '0.85rem', textDecoration: 'none' }}>
                  🔗 Buka di Roblox
                </a>
              )}
            </div>
            <div style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {entry?.played_at && <div>📅 Dimainkan: {new Date(entry.played_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</div>}
              <div style={{ marginTop: '0.25rem' }}>📸 {media.length} media</div>
              {avgRating && <div style={{ marginTop: '0.25rem', color: '#fbbf24', fontWeight: 600 }}>★ Rata-rata: {avgRating} ({reviews.length} ulasan)</div>}
            </div>
          </div>
        </div>

        {/* Two-Column Grid for Upload/Gallery & Reviews */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem', ... (media.length > 0 || entry?.status === 'played' ? { gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))' } : {}) }}>
          
          {/* Column 1: Upload & Gallery */}
          <div>
            {/* Upload Area */}
            <div style={{ marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>📤 Upload Kenangan</h2>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => !uploading && fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? '#3b82f6' : '#334155'}`,
                  borderRadius: '1rem', padding: '2rem', textAlign: 'center', cursor: uploading ? 'not-allowed' : 'pointer',
                  background: dragOver ? 'rgba(59,130,246,0.08)' : 'rgba(30,41,59,0.4)',
                  transition: 'all 0.2s', marginBottom: '0.75rem',
                }}
              >
                {uploading ? (
                  <div>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem', animation: 'spin 1s linear infinite' }}>⏳</div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Mengupload...</p>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📁</div>
                    <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Klik atau drag & drop file di sini</p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Mendukung: JPG, PNG, GIF, WebP, MP4, WebM, MOV (maks. 100MB)</p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
              <input
                style={{
                  width: '100%', padding: '0.65rem 1rem', borderRadius: '0.5rem', border: '1px solid #334155',
                  background: '#0f172a', color: '#f8fafc', fontSize: '0.85rem', outline: 'none',
                  fontFamily: 'Inter, sans-serif',
                }}
                placeholder="Caption (opsional) — contoh: 'Date night pertama di Brookhaven 💕'"
                value={uploadCaption}
                onChange={e => setUploadCaption(e.target.value)}
                onFocus={e => e.target.style.borderColor = '#3b82f6'}
                onBlur={e => e.target.style.borderColor = '#334155'}
              />
            </div>

            {/* Gallery */}
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>
                🖼️ Memory Gallery
                <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem', fontWeight: 400, color: 'var(--text-muted)' }}>({media.length} item)</span>
              </h2>

              {media.length === 0 ? (
                <div className="empty-state" style={{ padding: '2.5rem 1rem' }}>
                  <div className="empty-state-icon">📷</div>
                  <h3 style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Belum ada kenangan</h3>
                  <p style={{ fontSize: '0.85rem' }}>Upload foto atau video mabar kalian!</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
                  {media.map((item, idx) => (
                    <MediaCard
                      key={item.id}
                      item={item}
                      backendUrl={BACKEND_URL}
                      canDelete={canDelete(item)}
                      onOpen={() => setLightbox(idx)}
                      onDelete={() => handleDelete(item)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Column 2: Rating & Reviews (Only available if status is played) */}
          {entry?.status === 'played' && (
            <div>
              {/* Add Review Form */}
              <div style={{ background: 'var(--bg-card)', borderRadius: '1rem', padding: '1.5rem', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>⭐ Ulas Game Ini</h2>
                <form onSubmit={handleSubmitReview} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  
                  {/* Stars Widget */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Pilih Bintang:</label>
                    <div style={{ display: 'flex', gap: '0.4rem', fontSize: '1.8rem' }}>
                      {[1, 2, 3, 4, 5].map((star) => {
                        const isGold = hoveredStar !== null ? star <= hoveredStar : star <= rating;
                        return (
                          <span
                            key={star}
                            onMouseEnter={() => setHoveredStar(star)}
                            onMouseLeave={() => setHoveredStar(null)}
                            onClick={() => setRating(star)}
                            style={{ cursor: 'pointer', color: isGold ? '#fbbf24' : '#475569', transition: 'color 0.1s' }}
                          >
                            ★
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Review Text */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Komentar/Review:</label>
                    <textarea
                      style={{
                        width: '100%', padding: '0.65rem 1rem', borderRadius: '0.5rem', border: '1px solid #334155',
                        background: '#0f172a', color: '#f8fafc', fontSize: '0.85rem', outline: 'none',
                        fontFamily: 'Inter, sans-serif', resize: 'vertical', minHeight: '80px'
                      }}
                      placeholder="Apa pendapatmu tentang game ini setelah dimainkan?"
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      onFocus={e => e.target.style.borderColor = '#3b82f6'}
                      onBlur={e => e.target.style.borderColor = '#334155'}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submittingReview}
                    style={{
                      padding: '0.65rem', borderRadius: '0.5rem', border: 'none',
                      background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
                      color: '#0f172a', fontWeight: 700, cursor: submittingReview ? 'not-allowed' : 'pointer',
                      fontSize: '0.85rem', transition: 'opacity 0.2s',
                    }}
                  >
                    {submittingReview ? 'Menyimpan...' : mySubmitLabel}
                  </button>
                </form>
              </div>

              {/* Members Reviews List */}
              <div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>💬 Ulasan Teman</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {reviews.length === 0 ? (
                    <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                      <div className="empty-state-icon">💬</div>
                      <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.25rem' }}>Belum ada ulasan</h3>
                      <p style={{ fontSize: '0.8rem' }}>Jadilah yang pertama menulis ulasan untuk game ini!</p>
                    </div>
                  ) : (
                    reviews.map(rev => (
                      <div key={rev.id} style={{ background: 'var(--bg-card)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#60a5fa' }}>{rev.user?.roblox_display_name || rev.user?.roblox_username}</span>
                          <span style={{ color: '#fbbf24', fontSize: '0.85rem' }}>{'★'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}</span>
                        </div>
                        {rev.comment && <p style={{ fontSize: '0.82rem', lineHeight: 1.4, color: '#e2e8f0' }}>"{rev.comment}"</p>}
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.4rem', textAlign: 'right' }}>
                          {new Date(rev.updated_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

        </div>

      </div>

      {/* Lightbox */}
      {lightbox !== null && currentMedia && (
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
              <button onClick={() => setLightbox(l => l > 0 ? l - 1 : l)}
                disabled={lightbox === 0}
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '50%', width: '40px', height: '40px', cursor: lightbox === 0 ? 'default' : 'pointer', fontSize: '1.2rem', opacity: lightbox === 0 ? 0.3 : 1 }}>
                ‹
              </button>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{lightbox + 1} / {media.length}</span>
              <button onClick={() => setLightbox(l => l < media.length - 1 ? l + 1 : l)}
                disabled={lightbox === media.length - 1}
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '50%', width: '40px', height: '40px', cursor: lightbox === media.length - 1 ? 'default' : 'pointer', fontSize: '1.2rem', opacity: lightbox === media.length - 1 ? 0.3 : 1 }}>
                ›
              </button>
            </div>

            {/* Media */}
            {currentMedia.file_type === 'video' ? (
              <video src={`${BACKEND_URL}${currentMedia.file_url}`} controls style={{ maxWidth: '85vw', maxHeight: '70vh', borderRadius: '0.75rem' }} />
            ) : (
              <img src={`${BACKEND_URL}${currentMedia.file_url}`} alt={currentMedia.caption} style={{ maxWidth: '85vw', maxHeight: '70vh', borderRadius: '0.75rem', objectFit: 'contain' }} />
            )}

            {/* Caption & Info */}
            <div style={{ textAlign: 'center' }}>
              {currentMedia.caption && <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{currentMedia.caption}</p>}
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                Oleh {currentMedia.uploaded_by?.roblox_display_name || 'Unknown'} •&nbsp;
                {new Date(currentMedia.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
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

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function MediaCard({ item, backendUrl, canDelete, onOpen, onDelete }) {
  const isVideo = item.file_type === 'video';
  const src = `${backendUrl}${item.file_url}`;

  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: '0.75rem', overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer',
      transition: 'transform 0.2s, box-shadow 0.2s',
    }}
      onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)'; }}
      onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div style={{ position: 'relative', aspectRatio: '1', background: '#0f172a' }} onClick={onOpen}>
        {isVideo ? (
          <video src={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
        ) : (
          <img src={src} alt={item.caption} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        {isVideo && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}>
            <span style={{ fontSize: '2rem' }}>▶️</span>
          </div>
        )}
        <div style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'rgba(0,0,0,0.6)', borderRadius: '0.25rem', padding: '0.15rem 0.35rem', fontSize: '0.65rem', color: '#fff' }}>
          {isVideo ? '📹 VIDEO' : '📷 FOTO'}
        </div>
      </div>

      <div style={{ padding: '0.75rem' }}>
        {item.caption && <p style={{ fontSize: '0.82rem', fontWeight: 500, marginBottom: '0.3rem', color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.caption}</p>}
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
          {item.uploaded_by?.roblox_display_name || 'Unknown'} • {new Date(item.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
        </p>
        {canDelete && (
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{
            width: '100%', padding: '0.35rem', borderRadius: '0.35rem', border: '1px solid rgba(239,68,68,0.3)',
            background: 'rgba(239,68,68,0.08)', color: '#f87171', cursor: 'pointer', fontSize: '0.75rem',
          }}>🗑️ Hapus</button>
        )}
      </div>
    </div>
  );
}
