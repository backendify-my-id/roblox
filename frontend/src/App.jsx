import React, { useState, useEffect, useCallback } from 'react';
import TargetCard from './components/TargetCard';
import TargetSearchForm from './components/TargetSearchForm';
import FriendCard from './components/FriendCard';
import ActivityModal from './components/ActivityModal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// ─── Page: Target Dashboard ─────────────────────────────────────────────────
function TargetDashboard({ onSelectTarget }) {
  const [targets, setTargets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [syncMsg, setSyncMsg] = useState(null);

  const fetchTargets = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/v2/targets`);
      if (!res.ok) throw new Error('Failed to load targets');
      const data = await res.json();
      setTargets(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTargets();
  }, [fetchTargets]);

  const handleAddTarget = async (username) => {
    setIsSyncing(true);
    setSyncMsg(null);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v2/targets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      setSyncMsg(data.synced
        ? `✅ Berhasil sync ${data.target_user.roblox_username} — ${data.friend_count} teman`
        : `ℹ️ ${data.message}`
      );
      await fetchTargets();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteTarget = async (id) => {
    try {
      const res = await fetch(`${API_URL}/api/v2/targets/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Gagal menghapus target');
      setSyncMsg('🗑️ Target berhasil dihapus');
      await fetchTargets();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="app-container">
      <div className="header">
        <h1>Roblox Analytics Dashboard</h1>
        <p>Lacak aktivitas teman dari akun target Roblox secara otomatis.</p>
      </div>

      <div className="add-friend-container">
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Track Target Baru</h2>
        <TargetSearchForm onSearch={handleAddTarget} isLoading={isSyncing} />
        {syncMsg && <div style={{ color: '#22c55e', fontSize: '0.9rem' }}>{syncMsg}</div>}
        {error && <div style={{ color: '#ef4444', fontSize: '0.9rem' }}>Error: {error}</div>}
      </div>

      {isLoading ? (
        <div className="loading">Memuat daftar target...</div>
      ) : targets.length === 0 ? (
        <div className="loading">Belum ada target yang dilacak. Tambahkan username Roblox di atas!</div>
      ) : (
        <>
          <div style={{ marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {targets.length} target terlacak — klik untuk lihat daftar teman
          </div>
          <div className="friends-grid">
            {targets.map((t) => (
              <TargetCard 
                key={t.id} 
                target={t} 
                onClick={onSelectTarget} 
                onDelete={handleDeleteTarget}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Page: Friends of a Target ───────────────────────────────────────────────
function FriendsList({ target, onBack }) {
  const [friends, setFriends] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedFriend, setSelectedFriend] = useState(null);

  useEffect(() => {
    const fetchFriends = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_URL}/api/v2/targets/${target.id}/friends`);
        if (!res.ok) throw new Error('Failed to fetch friends');
        const data = await res.json();
        setFriends(Array.isArray(data.friends) ? data.friends : []);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchFriends();
  }, [target.id]);

  return (
    <div className="app-container">
      {/* Back button + Target info header */}
      <div style={{ marginBottom: '2rem' }}>
        <button
          onClick={onBack}
          style={{
            background: 'none', border: '1px solid #334155', color: 'var(--text-muted)',
            padding: '0.4rem 1rem', borderRadius: '0.5rem', cursor: 'pointer',
            marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
            transition: 'color 0.2s, border-color 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#60a5fa'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = '#334155'; }}
        >
          ← Kembali ke Dashboard
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {target.avatar_url && (
            <img src={target.avatar_url} alt="Avatar" style={{ width: 64, height: 64, borderRadius: '50%', border: '3px solid #3b82f6' }} />
          )}
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: 700, background: 'linear-gradient(to right, #60a5fa, #a78bfa)', WebkitBackgroundClip: 'text', color: 'transparent' }}>
              {target.roblox_display_name || target.roblox_username}
            </h1>
            {target.roblox_display_name && target.roblox_display_name !== target.roblox_username && (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>@{target.roblox_username}</div>
            )}
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              {friends.length} teman • Klik kartu untuk lihat riwayat aktivitas
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="loading" style={{ color: '#ef4444' }}>Error: {error}</div>
      ) : isLoading ? (
        <div className="loading">Memuat daftar teman & status live...</div>
      ) : friends.length === 0 ? (
        <div className="loading">Tidak ada teman yang ditemukan untuk target ini.</div>
      ) : (
        <div className="friends-grid">
          {friends.map((f) => (
            <FriendCard key={f.id} friend={f} onClickLog={setSelectedFriend} />
          ))}
        </div>
      )}

      {selectedFriend && (
        <ActivityModal friend={selectedFriend} onClose={() => setSelectedFriend(null)} />
      )}
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
function App() {
  const [selectedTarget, setSelectedTarget] = useState(null);

  if (selectedTarget) {
    return <FriendsList target={selectedTarget} onBack={() => setSelectedTarget(null)} />;
  }
  return <TargetDashboard onSelectTarget={setSelectedTarget} />;
}

export default App;
