import React, { useState, useEffect, useRef } from 'react';
import { fetchWithAuth } from '../../utils/api';

/**
 * DatabaseMapsList Component
 * Handles registered Roblox map databases, manual adding of maps,
 * Roblox API online game search, and name synchronization batches.
 * 
 * @param {Object} props
 * @param {Function} props.showToast - Function to trigger dynamic toasts
 */
const DatabaseMapsList = ({ showToast }) => {
  const [maps, setMaps] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination states
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const mapLoaderRef = useRef(null);

  // Roblox Online Search states
  const [robloxQuery, setRobloxQuery] = useState('');
  const [robloxResults, setRobloxResults] = useState([]);
  const [isSearchingRoblox, setIsSearchingRoblox] = useState(false);

  // Manual Add state
  const [manualName, setManualName] = useState('');
  const [isAddingMap, setIsAddingMap] = useState(false);

  // Sync Names state & function
  const [isSyncingNames, setIsSyncingNames] = useState(false);

  // Mobile responsiveness check
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSyncMapNames = async () => {
    if (!await window.customConfirm('Apakah Anda yakin ingin menyinkronkan seluruh nama map di database ke nama bahasa Inggris resmi? Tindakan ini akan memakan waktu beberapa detik karena memanggil Roblox API secara batch.')) {
      return;
    }
    setIsSyncingNames(true);
    try {
      const res = await fetchWithAuth('/api/maps/sync-names', {
        method: 'POST'
      });
      if (!res.ok) throw new Error('Gagal menyinkronkan nama map');
      const data = await res.json();
      showToast(`Berhasil menyinkronkan nama map! Diproses: ${data.total_processed}, Diperbarui: ${data.total_updated} ⚡`, 'success');
      setPage(1);
      fetchMaps(1, true);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsSyncingNames(false);
    }
  };

  const fetchMaps = async (currentPage = 1, isSearchChange = false) => {
    if (currentPage === 1) {
      setIsLoading(true);
    } else {
      setIsFetchingMore(true);
    }
    try {
      const limit = 20;
      const res = await fetchWithAuth(`/api/maps?search=${encodeURIComponent(searchQuery)}&page=${currentPage}&limit=${limit}`);
      if (!res.ok) throw new Error('Gagal memuat data map dari database');
      const data = await res.json();

      const fetchedData = Array.isArray(data.data) ? data.data : [];
      setMaps(prev => (currentPage === 1 || isSearchChange) ? fetchedData : [...prev, ...fetchedData]);
      setTotalPages(data.total_pages || 1);
      setTotalItems(data.total_items || 0);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsLoading(false);
      setIsFetchingMore(false);
    }
  };

  // Reset pagination when search query changes
  useEffect(() => {
    setPage(1);
    fetchMaps(1, true);
  }, [searchQuery]);

  // Fetch when page changes (only if page > 1 to avoid double fetching on mount)
  useEffect(() => {
    if (page > 1) {
      fetchMaps(page, false);
    }
  }, [page]);

  // Setup Intersection Observer for auto scroll pagination
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting) {
          if (page < totalPages && !isLoading && !isFetchingMore) {
            setPage(prev => prev + 1);
          }
        }
      },
      { threshold: 0.1 }
    );

    const currentLoader = mapLoaderRef.current;
    if (currentLoader) {
      observer.observe(currentLoader);
    }

    return () => {
      if (currentLoader) {
        observer.unobserve(currentLoader);
      }
    };
  }, [page, totalPages, isLoading, isFetchingMore]);

  const handleDeleteMap = async (id, name) => {
    if (!await window.customConfirm(`Apakah Anda yakin ingin menghapus map "${name}" dari database? Tindakan ini akan mengembalikan status pemetaan Co-Player ke string mentah.`)) {
      return;
    }
    try {
      const res = await fetchWithAuth(`/api/maps/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Gagal menghapus map');
      showToast('Map berhasil dihapus dari database! 🗑️', 'success');
      setPage(1);
      fetchMaps(1, true);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleAddMapManual = async (e) => {
    e.preventDefault();
    if (!manualName.trim()) return;
    setIsAddingMap(true);
    try {
      const res = await fetchWithAuth('/api/maps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: manualName.trim() })
      });
      if (!res.ok) throw new Error('Gagal menambahkan map');
      showToast('Map berhasil ditambahkan ke database! 🗺️', 'success');
      setManualName('');
      setPage(1);
      fetchMaps(1, true);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsAddingMap(false);
    }
  };

  const handleSearchRoblox = async (e) => {
    e.preventDefault();
    if (!robloxQuery.trim()) return;
    setIsSearchingRoblox(true);
    try {
      const res = await fetchWithAuth(`/api/maps/search-roblox?query=${encodeURIComponent(robloxQuery.trim())}`);
      if (!res.ok) throw new Error('Gagal mencari game di Roblox');
      const data = await res.json();
      setRobloxResults(Array.isArray(data) ? data : []);
      if (data.length === 0) {
        showToast('Tidak ada game ditemukan di Roblox untuk kata kunci tersebut.', 'info');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsSearchingRoblox(false);
    }
  };

  const handleAddRobloxGame = async (gameName) => {
    try {
      const res = await fetchWithAuth('/api/maps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: gameName })
      });
      if (!res.ok) throw new Error('Gagal menambahkan game Roblox');
      showToast(`Game "${gameName}" berhasil didaftarkan ke database! 🎮`, 'success');
      setPage(1);
      fetchMaps(1, true);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'fadeIn 0.3s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, color: '#fff', fontSize: isMobile ? '1.3rem' : '1.6rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🗺️ Database Map Roblox Terdaftar
          </h2>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Daftar map/game Roblox yang tersimpan di sistem untuk memetakan Co-Player dan mengumpulkan detail aktivitas.
          </span>
        </div>
        <button
          onClick={handleSyncMapNames}
          disabled={isSyncingNames}
          style={{
            background: isSyncingNames ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            color: isSyncingNames ? 'var(--text-muted)' : '#fff',
            border: 'none',
            padding: '0.6rem 1.2rem',
            borderRadius: '0.5rem',
            fontWeight: 'bold',
            fontSize: '0.85rem',
            cursor: isSyncingNames ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            boxShadow: isSyncingNames ? 'none' : '0 4px 10px rgba(59,130,246,0.2)',
            width: isMobile ? '100%' : 'auto'
          }}
        >
          {isSyncingNames ? '⏳ Mensinkronisasi...' : '⚡ Sync Nama Map ke Global (Inggris)'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 350px', gap: '1.5rem', alignItems: 'start' }}>
        {/* Left Side: DB Maps Table / Cards list */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden' }}>
          <div style={{ 
            padding: '1.25rem', 
            borderBottom: '1px solid var(--border)', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: isMobile ? 'flex-start' : 'center',
            flexDirection: isMobile ? 'column' : 'row',
            gap: '0.75rem'
          }}>
            <div className="search-container" style={{ maxWidth: isMobile ? '100%' : '350px', width: '100%' }}>
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Cari map terdaftar di DB..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.6rem 2.5rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--border)',
                  background: 'rgba(0,0,0,0.2)',
                  color: '#fff',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Total Map Terdaftar: <strong>{totalItems}</strong>
            </span>
          </div>

          {!isMobile ? (
            <div style={{ overflowX: 'auto', maxHeight: '550px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                  <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>ID</th>
                    <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Nama Map</th>
                    <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Universe ID</th>
                    <th style={{ padding: '1rem', color: 'var(--text-muted)' }}>Place ID / Redirect</th>
                    <th style={{ padding: '1rem', color: 'var(--text-muted)', textAlign: 'right' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && page === 1 ? (
                    <tr>
                      <td colSpan="5" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        Memuat database map...
                      </td>
                    </tr>
                  ) : maps.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        Tidak ada map ditemukan di database.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {maps.map((m) => (
                        <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.01)'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                          <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>#{m.id}</td>
                          <td style={{ padding: '1rem', color: '#fff', fontWeight: 600 }}>
                            📍 {m.name}
                          </td>
                          <td style={{ padding: '1rem' }}>
                            {m.universe_id ? (
                              <span style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.8rem', border: '1px solid rgba(59,130,246,0.2)' }}>
                                {m.universe_id}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Belum Ditautkan</span>
                            )}
                          </td>
                          <td style={{ padding: '1rem' }}>
                            {m.place_id ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.8rem', border: '1px solid rgba(16,185,129,0.2)' }}>
                                  {m.place_id}
                                </span>
                                <a href={`https://www.roblox.com/games/${m.place_id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#fbbf24', textDecoration: 'none', fontSize: '0.8rem' }} title="Buka Game Resmi di Roblox">
                                  🔗 Buka Game
                                </a>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Belum Ditautkan</span>
                            )}
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'right' }}>
                            <button
                              onClick={() => handleDeleteMap(m.id, m.name)}
                              style={{
                                background: 'rgba(239,68,68,0.15)',
                                color: '#f87171',
                                border: '1px solid rgba(239,68,68,0.3)',
                                padding: '0.25rem 0.6rem',
                                borderRadius: '0.35rem',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                transition: 'all 0.2s'
                              }}
                            >
                              🗑️ Hapus
                            </button>
                          </td>
                        </tr>
                      ))}
                      {page < totalPages && (
                        <tr ref={mapLoaderRef}>
                          <td colSpan="5" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.01)' }}>
                            {isFetchingMore ? '⏳ Memuat lebih banyak map...' : '📜 Gulir ke bawah untuk memuat lebih banyak'}
                          </td>
                        </tr>
                      )}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1.25rem', maxHeight: '550px', overflowY: 'auto' }}>
              {isLoading && page === 1 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Memuat database map...
                </div>
              ) : maps.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Tidak ada map ditemukan di database.
                </div>
              ) : (
                <>
                  {maps.map((m) => (
                    <div key={m.id} style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border)',
                      borderRadius: '0.75rem',
                      padding: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.6rem'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>#{m.id}</span>
                        <button
                          onClick={() => handleDeleteMap(m.id, m.name)}
                          style={{
                            background: 'rgba(239,68,68,0.15)',
                            color: '#f87171',
                            border: '1px solid rgba(239,68,68,0.3)',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '0.35rem',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: 600
                          }}
                        >
                          🗑️ Hapus
                        </button>
                      </div>
                      <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.95rem' }}>
                        📍 {m.name}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                        {m.universe_id ? (
                          <span style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa', padding: '0.15rem 0.4rem', borderRadius: '0.25rem', fontSize: '0.75rem', border: '1px solid rgba(59,130,246,0.2)' }}>
                            Univ: {m.universe_id}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Belum Ditautkan</span>
                        )}
                        {m.place_id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399', padding: '0.15rem 0.4rem', borderRadius: '0.25rem', fontSize: '0.75rem', border: '1px solid rgba(16,185,129,0.2)' }}>
                              Place: {m.place_id}
                            </span>
                            <a href={`https://www.roblox.com/games/${m.place_id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#fbbf24', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 600 }}>
                              [Buka Game]
                            </a>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Belum Ditautkan</span>
                        )}
                      </div>
                    </div>
                  ))}
                  {page < totalPages && (
                    <div ref={mapLoaderRef} style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {isFetchingMore ? '⏳ Memuat lebih banyak map...' : '📜 Gulir ke bawah untuk memuat lebih banyak'}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Add Forms */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Add Manual Card */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1.25rem' }}>
            <h4 style={{ margin: '0 0 1rem 0', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              ➕ Tambah Map Manual
            </h4>
            <form onSubmit={handleAddMapManual} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <input
                type="text"
                placeholder="Nama Map (contoh: Cidro Janji)"
                value={manualName}
                onChange={e => setManualName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.6rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--border)',
                  background: 'rgba(0,0,0,0.2)',
                  color: '#fff',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              />
              <button
                type="submit"
                disabled={isAddingMap || !manualName.trim()}
                style={{
                  width: '100%',
                  background: manualName.trim() ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'rgba(255,255,255,0.05)',
                  color: manualName.trim() ? '#fff' : 'var(--text-muted)',
                  border: 'none',
                  padding: '0.6rem',
                  borderRadius: '0.5rem',
                  fontWeight: 'bold',
                  fontSize: '0.85rem',
                  cursor: manualName.trim() ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s'
                }}
              >
                {isAddingMap ? 'Menambahkan...' : 'Daftarkan Map'}
              </button>
            </form>
          </div>

          {/* Search Roblox Online Card */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1.25rem' }}>
            <h4 style={{ margin: '0 0 0.25rem 0', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🔍 Cari Game di Roblox
            </h4>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '1rem' }}>
              Cari game resmi secara online lewat Roblox API and langsung tambahkan ke database lokal.
            </span>
            <form onSubmit={handleSearchRoblox} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <input
                type="text"
                placeholder="Cari game Roblox..."
                value={robloxQuery}
                onChange={e => setRobloxQuery(e.target.value)}
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--border)',
                  background: 'rgba(0,0,0,0.2)',
                  color: '#fff',
                  fontSize: '0.85rem',
                  outline: 'none'
                }}
              />
              <button
                type="submit"
                disabled={isSearchingRoblox || !robloxQuery.trim()}
                style={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  color: '#fff',
                  border: 'none',
                  padding: '0.5rem 0.85rem',
                  borderRadius: '0.5rem',
                  fontWeight: 'bold',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {isSearchingRoblox ? '⏳' : 'Cari'}
              </button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto', paddingRight: '0.25rem' }}>
              {robloxResults.length > 0 ? (
                robloxResults.map((r, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(255,255,255,0.03)',
                      padding: '0.5rem',
                      borderRadius: '0.5rem',
                      border: '1px solid rgba(255,255,255,0.02)'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, marginRight: '0.5rem', overflow: 'hidden' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }} title={r.name}>
                        {r.name}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        Creator: {r.creatorName || 'Unknown'}
                      </span>
                    </div>
                    <button
                      onClick={() => handleAddRobloxGame(r.name)}
                      style={{
                        background: 'rgba(16,185,129,0.15)',
                        color: '#34d399',
                        border: '1px solid rgba(16,185,129,0.3)',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '0.35rem',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: 'bold'
                      }}
                    >
                      ➕
                    </button>
                  </div>
                ))
              ) : robloxQuery.trim() && !isSearchingRoblox ? (
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem 0' }}>
                  Tidak ada hasil pencarian online.
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DatabaseMapsList;
