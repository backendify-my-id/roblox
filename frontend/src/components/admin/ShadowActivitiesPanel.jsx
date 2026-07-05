import React from 'react';

const ShadowActivitiesPanel = ({
  shadowActivities,
  isLoadingShadow,
  shadowSearchQuery,
  setShadowSearchQuery,
  shadowVisibleCount,
  setShadowVisibleCount,
  hasReviewShadow,
  handleUpdateShadowActivity
}) => {
  if (isLoadingShadow) {
    return <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Menganalisis data aktivitas siluman...</div>;
  }

  const filteredShadows = shadowActivities.filter(act => {
    const u = act.user || {};
    const query = shadowSearchQuery.toLowerCase();
    return (
      (u.roblox_username && u.roblox_username.toLowerCase().includes(query)) ||
      (u.roblox_display_name && u.roblox_display_name.toLowerCase().includes(query))
    );
  });
  const visibleShadows = filteredShadows.slice(0, shadowVisibleCount);

  return (
    <div>
      <div style={{ marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="search-container" style={{ maxWidth: '300px', flex: '1 1 200px' }}>
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Cari username siluman..."
            value={shadowSearchQuery}
            onChange={(e) => {
              setShadowSearchQuery(e.target.value);
              setShadowVisibleCount(6); // reset limit on new search
            }}
            style={{
              width: '100%',
              padding: '0.6rem 2.5rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              color: '#fff',
              fontSize: '0.95rem'
            }}
          />
        </div>
        <div style={{ color: 'var(--text-muted)' }}>
          Total Kasus Ditemukan: <strong>{filteredShadows.length}</strong>
        </div>
      </div>

      {filteredShadows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'var(--bg-card)', borderRadius: '1rem', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🕵️</div>
          <h3>Tidak Ada Aktivitas Siluman Terdeteksi</h3>
          <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>Bagus! Tidak ada pengguna dengan kriteria pencarian tersebut atau status offline yang melakukan modifikasi avatar.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.5rem' }}>
            {visibleShadows.map((act) => {
              const u = act.user || {};
              return (
                <div
                  key={act.id}
                  style={{
                    background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)',
                    borderRadius: '1rem',
                    border: act.is_reviewed ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(245, 158, 11, 0.2)',
                    padding: '1.25rem',
                    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    transition: 'transform 0.2s, border-color 0.2s',
                    opacity: act.is_reviewed ? 0.75 : 1
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.borderColor = act.is_reviewed ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.borderColor = act.is_reviewed ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)';
                  }}
                >
                  <div>
                    {/* User Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', border: act.is_reviewed ? '1.5px solid #10b981' : '1.5px solid #f59e0b' }} />
                        ) : (
                          <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#334155' }} />
                        )}
                        <div>
                          <div style={{ fontWeight: 600, color: '#fff' }}>{u.roblox_display_name || u.roblox_username}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>@{u.roblox_username}</div>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <span style={{
                        fontSize: '0.75rem',
                        padding: '0.25rem 0.6rem',
                        borderRadius: '1rem',
                        background: act.is_reviewed ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: act.is_reviewed ? '#34d399' : '#fbbf24',
                        border: act.is_reviewed ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
                        fontWeight: 'bold'
                      }}>
                        {act.is_reviewed ? '✅ Ditinjau' : '⚠️ Kasus Baru'}
                      </span>
                    </div>

                    {/* Comparison Panel */}
                    <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem' }}>
                      <div style={{ textAlign: 'center' }}>
                        <img src={act.old_avatar} alt="Old" style={{ width: 60, height: 60, borderRadius: '50%', border: '2px solid rgba(239, 68, 68, 0.4)', background: '#1e293b' }} />
                        <div style={{ color: '#f87171', fontSize: '0.7rem', marginTop: '0.25rem', fontWeight: 600 }}>Sebelum</div>
                      </div>
                      <div style={{ fontSize: '1.5rem', color: 'var(--text-muted)' }}>➔</div>
                      <div style={{ textAlign: 'center' }}>
                        <img src={act.new_avatar} alt="New" style={{ width: 60, height: 60, borderRadius: '50%', border: '2px solid rgba(34, 197, 94, 0.6)', background: '#1e293b' }} />
                        <div style={{ color: '#4ade80', fontSize: '0.7rem', marginTop: '0.25rem', fontWeight: 600 }}>Sesudah</div>
                      </div>
                    </div>

                    {/* Meta Details */}
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Waktu Deteksi:</span>
                        <strong style={{ color: '#fff' }}>{new Date(act.created_at).toLocaleString('id-ID')}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Status Terdaftar:</span>
                        <span style={{ color: '#ef4444', fontWeight: 'bold' }}>🔴 Offline</span>
                      </div>
                    </div>

                    {/* Auto Conclusion AI */}
                    <div style={{ background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.1)', borderRadius: '0.5rem', padding: '0.75rem', fontSize: '0.78rem', color: '#fbbf24', lineHeight: '1.4', marginBottom: '1rem' }}>
                      <strong>📝 Kesimpulan Sistem:</strong><br />
                      Pengguna mengubah kosmetik avatar Roblox secara real-time saat terdaftar <strong>Offline</strong>{act.offline_duration > 0 ? <> (selama <strong>{act.offline_duration} menit</strong>)</> : ''}. Disimpulkan sedang bermain siluman.
                    </div>

                    {/* Incident Form — selalu tampil, aksi hanya untuk yang punya izin review */}
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.75rem', marginTop: '0.75rem' }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                        Catatan Penyelidikan:
                        {!hasReviewShadow && (
                          <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', color: '#64748b', fontStyle: 'italic' }}>
                            (hanya baca)
                          </span>
                        )}
                      </label>
                      <textarea
                        id={`notes-${act.id}`}
                        defaultValue={act.admin_notes}
                        placeholder={hasReviewShadow ? 'Tambahkan catatan penyelidikan...' : 'Tidak ada catatan penyelidikan.'}
                        readOnly={!hasReviewShadow}
                        style={{
                          width: '100%',
                          minHeight: '60px',
                          padding: '0.4rem 0.6rem',
                          borderRadius: '0.35rem',
                          border: '1px solid var(--border)',
                          background: hasReviewShadow ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.15)',
                          color: hasReviewShadow ? '#fff' : '#94a3b8',
                          fontSize: '0.8rem',
                          resize: hasReviewShadow ? 'vertical' : 'none',
                          outline: 'none',
                          marginBottom: hasReviewShadow ? '0.75rem' : '0',
                          cursor: hasReviewShadow ? 'text' : 'default',
                          opacity: hasReviewShadow ? 1 : 0.7
                        }}
                      />

                      {/* Tombol aksi — hanya untuk yang punya izin review */}
                      {hasReviewShadow && (
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                          <button
                            onClick={() => {
                              const notes = document.getElementById(`notes-${act.id}`).value;
                              handleUpdateShadowActivity(act.id, !act.is_reviewed, notes);
                            }}
                            style={{
                              flex: 1,
                              padding: '0.4rem 0.75rem',
                              borderRadius: '0.35rem',
                              border: 'none',
                              background: act.is_reviewed ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                              color: act.is_reviewed ? '#fbbf24' : '#34d399',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                          >
                            {act.is_reviewed ? '🔄 Buka Kasus' : '✅ Selesaikan'}
                          </button>
                          <button
                            onClick={() => {
                              const notes = document.getElementById(`notes-${act.id}`).value;
                              handleUpdateShadowActivity(act.id, act.is_reviewed, notes);
                            }}
                            style={{
                              padding: '0.4rem 0.75rem',
                              borderRadius: '0.35rem',
                              border: '1px solid rgba(255,255,255,0.1)',
                              background: 'transparent',
                              color: '#fff',
                              fontSize: '0.8rem',
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                          >
                            💾 Simpan Catatan
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {shadowVisibleCount < filteredShadows.length && (
            <div style={{ textAlign: 'center', marginTop: '2rem' }}>
              <button
                onClick={() => setShadowVisibleCount(prev => prev + 6)}
                style={{
                  background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(245, 158, 11, 0.1) 100%)',
                  color: '#fbbf24',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  padding: '0.75rem 2rem',
                  borderRadius: '0.5rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 15px rgba(245, 158, 11, 0.05)'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.5)';
                  e.currentTarget.style.background = 'rgba(245, 158, 11, 0.25)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.3)';
                  e.currentTarget.style.background = 'rgba(245, 158, 11, 0.2)';
                }}
              >
                🔽 Muat Lebih Banyak ({filteredShadows.length - shadowVisibleCount} Kasus Lagi)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ShadowActivitiesPanel;
