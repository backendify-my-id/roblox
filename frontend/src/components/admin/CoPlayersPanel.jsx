import React from 'react';

const getRoleBadgeStyle = (roleName) => {
  switch (roleName?.toLowerCase()) {
    case 'admin':
      return { background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)' };
    case 'moderator':
      return { background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)' };
    case 'observer':
      return { background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.3)' };
    case 'user':
      return { background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)' };
    default:
      return { background: 'rgba(100, 116, 139, 0.15)', color: '#94a3b8', border: '1px solid rgba(100, 116, 139, 0.3)' };
  }
};

const getRoleDisplayName = (roleName) => {
  switch (roleName?.toLowerCase()) {
    case 'admin': return 'Admin';
    case 'moderator': return 'Moderator';
    case 'observer': return 'Observer';
    case 'user': return 'User';
    default: return roleName || 'Synced Friend';
  }
};

const CoPlayersPanel = ({
  coPlayingGroups,
  isLoadingCoPlayers,
  coPlaySearchMap,
  setCoPlaySearchMap,
  coPlaySearchDate,
  setCoPlaySearchDate,
  coPlaySearchHour,
  setCoPlaySearchHour,
  coPlaySearchResults,
  isSearchingCoPlay,
  handleSearchCoPlayers,
  handleClearCoPlaySearch
}) => {
  return (
    <div>
      {/* Historical Search Panel */}
      <div style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        padding: '1.25rem',
        borderRadius: '1rem',
        marginBottom: '1.5rem',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)'
      }}>
        <h4 style={{ margin: '0 0 1rem 0', color: '#fbbf24', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          🔍 Pelacakan Riwayat Bermain Bersama (Co-Play)
        </h4>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 1rem 0' }}>
          Cari tahu dengan siapa saja target yang Anda pantau bermain game Roblox pada jam dan hari tertentu berdasarkan rekaman log aktivitas.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>

          {/* Map Name Input */}
          <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>Nama Map / Game</span>
            <input
              type="text"
              placeholder="Misal: Indo Hangout, Mount Lunex..."
              value={coPlaySearchMap}
              onChange={e => setCoPlaySearchMap(e.target.value)}
              style={{
                padding: '0.6rem 0.75rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--border)',
                background: 'rgba(0,0,0,0.2)',
                color: '#fff',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            />
          </div>

          {/* Date Input */}
          <div style={{ width: '160px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>Tanggal</span>
            <input
              type="date"
              value={coPlaySearchDate}
              onChange={e => setCoPlaySearchDate(e.target.value)}
              style={{
                padding: '0.6rem 0.75rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--border)',
                background: 'rgba(0,0,0,0.2)',
                color: '#fff',
                fontSize: '0.9rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            />
          </div>

          {/* Hour Dropdown */}
          <div style={{ width: '160px', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>Jam Bermain</span>
            <select
              value={coPlaySearchHour}
              onChange={e => setCoPlaySearchHour(parseInt(e.target.value))}
              style={{
                padding: '0.6rem 0.75rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--border)',
                background: 'rgba(0,0,0,0.2)',
                color: '#fff',
                fontSize: '0.9rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              {Array.from({ length: 24 }).map((_, h) => (
                <option key={h} value={h}>
                  {h.toString().padStart(2, '0')}:00 - {(h + 1).toString().padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={handleSearchCoPlayers}
              disabled={isSearchingCoPlay}
              style={{
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#fff',
                border: 'none',
                padding: '0.6rem 1.25rem',
                borderRadius: '0.5rem',
                fontWeight: 'bold',
                cursor: isSearchingCoPlay ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 4px 12px rgba(245, 158, 11, 0.2)',
                transition: 'all 0.2s'
              }}
            >
              {isSearchingCoPlay ? 'Mencari...' : '🕵️ Cari Riwayat'}
            </button>

            {coPlaySearchResults !== null && (
              <button
                onClick={handleClearCoPlaySearch}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.1)',
                  padding: '0.6rem 1.25rem',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                🔄 Reset / Live View
              </button>
            )}
          </div>

        </div>
      </div>

      {/* Results Area */}
      {coPlaySearchResults !== null ? (
        /* ─── HISTORICAL SEARCH RESULTS ─── */
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '1.2rem', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Hasil Pelacakan Riwayat: <span style={{ color: '#fbbf24' }}>"{coPlaySearchMap}"</span>
            </h3>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Tanggal: <strong>{coPlaySearchDate}</strong> pukul <strong>{coPlaySearchHour.toString().padStart(2, '0')}:00 - {(coPlaySearchHour + 1).toString().padStart(2, '0')}:00</strong>
            </span>
          </div>

          {coPlaySearchResults.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'var(--bg-card)', borderRadius: '1rem', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
              <h3>Tidak Ada Riwayat Terdeteksi</h3>
              <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>Tidak ada pengguna yang terdeteksi bermain map "{coPlaySearchMap}" pada jam {coPlaySearchHour.toString().padStart(2, '0')}:00 tanggal {coPlaySearchDate}.</p>
            </div>
          ) : (
            <div style={{ background: 'var(--bg-card)', borderRadius: '1rem', border: '1px solid var(--border)', padding: '1.25rem' }}>
              <div style={{ marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <span style={{ color: '#4ade80', fontWeight: 'bold', fontSize: '0.95rem' }}>
                  🟢 Terdeteksi {coPlaySearchResults.length} Orang Bermain Bersama:
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                {coPlaySearchResults.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(255,255,255,0.03)',
                      padding: '0.75rem 1rem',
                      borderRadius: '0.75rem',
                      border: '1px solid rgba(255,255,255,0.03)',
                      transition: 'border-color 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(251, 191, 36, 0.3)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.03)'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {p.avatar_url ? (
                        <img src={p.avatar_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%', border: '1.5px solid #fbbf24' }} />
                      ) : (
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#334155' }} />
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#fff' }}>
                          {p.roblox_display_name || p.roblox_username}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          @{p.roblox_username}
                        </span>
                        {p.play_start_time && (
                          <span style={{ fontSize: '0.7rem', color: '#fbbf24', marginTop: '0.15rem' }}>
                            Mulai: pukul {p.play_start_time}
                          </span>
                        )}
                      </div>
                    </div>

                    <span style={{
                      fontSize: '0.75rem',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '0.25rem',
                      ...getRoleBadgeStyle(p.role_name)
                    }}>
                      {getRoleDisplayName(p.role_name)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ─── LIVE CO-PLAYERS VIEW ─── */
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '1.2rem', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🟢 Sedang Bermain Bersama (Live)
            </h3>
          </div>

          {isLoadingCoPlayers ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Memuat data bermain bersama...</div>
          ) : coPlayingGroups.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'var(--bg-card)', borderRadius: '1rem', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎮</div>
              <h3>Belum Ada Pengguna Bermain Bersama</h3>
              <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>Saat ini tidak ada pengguna atau teman terlacak yang terdeteksi sedang bermain game Roblox secara bersamaan.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
              {coPlayingGroups.map((group) => (
                <div
                  key={group.game_name}
                  style={{
                    background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)',
                    borderRadius: '1rem',
                    border: '1px solid rgba(255,255,255,0.05)',
                    padding: '1.25rem',
                    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    transition: 'transform 0.2s, border-color 0.2s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)';
                  }}
                >
                  <div>
                    {/* Game Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.75rem' }}>
                      <div style={{ flex: 1, marginRight: '0.5rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#f87171', fontWeight: 'bold', wordBreak: 'break-word' }}>
                          {group.game_name}
                        </h3>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Roblox Map/Game</span>
                      </div>
                      <span style={{
                        background: 'rgba(34, 197, 94, 0.15)',
                        color: '#4ade80',
                        padding: '0.25rem 0.6rem',
                        borderRadius: '1rem',
                        fontSize: '0.8rem',
                        fontWeight: 'bold',
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                        boxShadow: '0 0 10px rgba(34, 197, 94, 0.1)',
                        whiteSpace: 'nowrap'
                      }}>
                        🟢 {group.players.length} Pemain
                      </span>
                    </div>

                    {/* Players List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '250px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                      {group.players.map((p) => (
                        <div
                          key={p.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: 'rgba(255,255,255,0.03)',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '0.5rem',
                            border: '1px solid rgba(255,255,255,0.03)'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {p.avatar_url ? (
                              <img src={p.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', border: '1.5px solid #ef4444' }} />
                            ) : (
                              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#334155' }} />
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.25rem' }}>
                                {p.roblox_display_name || p.roblox_username}
                                {p.friends_with && p.friends_with.length > 0 && (
                                  <span
                                    title={`Berteman dengan di website: ${p.friends_with.join(', ')}`}
                                    style={{
                                      fontSize: '0.65rem',
                                      background: 'rgba(34, 197, 94, 0.25)',
                                      color: '#4ade80',
                                      padding: '0.05rem 0.35rem',
                                      borderRadius: '0.25rem',
                                      border: '1px solid rgba(34, 197, 94, 0.4)',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.15rem',
                                      cursor: 'help'
                                    }}
                                  >
                                    🤝 Teman
                                  </span>
                                )}
                              </span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                @{p.roblox_username}
                              </span>
                            </div>
                          </div>
                          <span style={{
                            fontSize: '0.75rem',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '0.25rem',
                            ...getRoleBadgeStyle(p.role_name)
                          }}>
                            {getRoleDisplayName(p.role_name)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CoPlayersPanel;
