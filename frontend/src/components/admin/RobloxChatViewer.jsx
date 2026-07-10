import React, { useState, useEffect, useRef } from 'react';
import { fetchWithAuth } from '../../utils/api';

const RobloxChatViewer = ({ showToast }) => {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isLoadingConvs, setIsLoadingConvs] = useState(false);
  const [isLoadingMsgs, setIsLoadingMsgs] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [searchConvQuery, setSearchConvQuery] = useState('');

  const chatEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const isLoadingMoreRef = useRef(false);

  const spinStyle = `
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;

  // Fetch users with cookies
  const fetchChatUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const res = await fetchWithAuth('/api/admin/roblox-chat/users');
      if (!res.ok) throw new Error('Gagal mengambil daftar pengguna');
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsLoadingUsers(false);
    }
  };

  // Fetch user conversations
  const fetchConversations = async (userId) => {
    setIsLoadingConvs(true);
    setConversations([]);
    setSelectedConv(null);
    setMessages([]);
    try {
      const res = await fetchWithAuth(`/api/admin/roblox-chat/conversations?user_id=${userId}`);
      if (!res.ok) throw new Error('Gagal mengambil daftar obrolan');
      const data = await res.json();
      // Handle potential formats (conversations list is under 'conversations' key)
      const list = data.conversations || data.Conversations || (Array.isArray(data) ? data : []);
      setConversations(list);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsLoadingConvs(false);
    }
  };

  // Fetch conversation messages
  const fetchMessages = async (userId, convId) => {
    setIsLoadingMsgs(true);
    setNextCursor(null);
    setMessages([]); // Always clear messages immediately when switching conversations
    isLoadingMoreRef.current = false;
    try {
      const res = await fetchWithAuth(`/api/admin/roblox-chat/messages?user_id=${userId}&conversation_id=${convId}`);
      if (!res.ok) throw new Error('Gagal memuat riwayat pesan');
      const data = await res.json();
      const list = data.messages || data.Messages || (Array.isArray(data) ? data : []);
      const cursor = data.next_cursor || data.nextCursor || null;
      setNextCursor(cursor);
      // Roblox returns messages in newest-to-oldest, we reverse to display chronologically
      setMessages([...list].reverse());

      // Scroll to bottom after state update
      setTimeout(() => {
        if (chatEndRef.current) {
          chatEndRef.current.scrollIntoView({ behavior: 'auto' });
        }
      }, 50);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsLoadingMsgs(false);
    }
  };

  // Fetch older conversation messages (pagination)
  const fetchMoreMessages = async () => {
    if (!nextCursor || isLoadingMoreRef.current || !selectedUser || !selectedConv) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);

    const container = chatContainerRef.current;
    const oldScrollHeight = container ? container.scrollHeight : 0;

    try {
      const res = await fetchWithAuth(
        `/api/admin/roblox-chat/messages?user_id=${selectedUser.id}&conversation_id=${selectedConv.id}&cursor=${encodeURIComponent(nextCursor)}`
      );
      if (!res.ok) throw new Error('Gagal memuat pesan lama');
      const data = await res.json();
      const list = data.messages || data.Messages || [];
      const cursor = data.next_cursor || data.nextCursor || null;
      setNextCursor(cursor);

      if (list.length > 0) {
        const reversedNewMsgs = [...list].reverse();
        setMessages(prev => [...reversedNewMsgs, ...prev]);

        // Retain scroll position
        setTimeout(() => {
          if (container) {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = newScrollHeight - oldScrollHeight;
          }
        }, 30);
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsLoadingMore(false);
      isLoadingMoreRef.current = false;
    }
  };

  const handleScroll = () => {
    const container = chatContainerRef.current;
    if (!container) return;

    if (container.scrollTop === 0 && nextCursor && !isLoadingMoreRef.current && !isLoadingMsgs) {
      fetchMoreMessages();
    }
  };

  useEffect(() => {
    fetchChatUsers();
  }, []);

  const handleFullSync = async () => {
    if (!selectedUser || isSyncingAll) return;
    setIsSyncingAll(true);
    try {
      const res = await fetchWithAuth(`/api/admin/roblox-chat/sync-all?user_id=${selectedUser.id}`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error('Gagal memulai sinkronisasi penuh');
      const data = await res.json();
      showToast(data.message || 'Sinkronisasi penuh berhasil dimulai di latar belakang', 'success');
      // Automatically refresh the conversation list after a short delay
      setTimeout(() => {
        fetchConversations(selectedUser.id);
      }, 3000);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsSyncingAll(false);
    }
  };

  const handleSelectUser = (u) => {
    setSelectedUser(u);
    fetchConversations(u.id);
  };

  const handleSelectConv = (c) => {
    setSelectedConv(c);
    if (!c.id) {
      // If conversation ID is null, use the embedded messages directly
      const list = c.messages || c.Messages || [];
      // Roblox returns messages in newest-to-oldest, we reverse to display chronologically
      setMessages([...list].reverse());
      return;
    }
    if (selectedUser) {
      fetchMessages(selectedUser.id, c.id);
    }
  };

  const getConvTitle = (c) => {
    let title = c.name || c.title || c.Title;
    if (!title && c.user_data) {
      const otherNames = Object.values(c.user_data)
        .filter(u => String(u?.id) !== String(selectedUser?.roblox_user_id))
        .map(u => u.display_name || u.name)
        .join(', ');
      if (otherNames) title = otherNames;
    }
    return title || ( (c.type === 'group' || c.conversationType === 'group' || c.ConversationType === 'group' || c.type === 'MultiUser') ? 'Grup Tanpa Nama' : 'Obrolan Privat' );
  };

  const filteredConversations = conversations.filter(c => {
    const title = getConvTitle(c);
    return title.toLowerCase().includes(searchConvQuery.toLowerCase());
  });

  return (
    <div style={{
      display: 'flex',
      gap: '1rem',
      height: 'calc(100vh - 240px)',
      minHeight: '500px',
      color: '#fff',
      fontSize: '0.9rem',
      fontFamily: 'Outfit, sans-serif'
    }}>
      <style>{spinStyle}</style>
      {/* COLUMN 1: Users list */}
      <div style={{
        flex: '0 0 250px',
        background: 'rgba(30, 41, 59, 0.4)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '0.75rem',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        backdropFilter: 'blur(10px)',
        overflowY: 'auto'
      }}>
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
          👥 Pengguna Ber-Cookie
        </h3>
        {isLoadingUsers ? (
          <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)' }}>Memuat...</div>
        ) : users.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Tidak ada pengguna dengan cookie aktif.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {users.map((u) => {
              const isSelected = selectedUser?.id === u.id;
              return (
                <div
                  key={u.id}
                  onClick={() => handleSelectUser(u)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.6rem 0.8rem',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.02)',
                    border: isSelected ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid rgba(255,255,255,0.04)',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                  }}
                  onMouseOut={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                  }}
                >
                  {u.avatar_url ? (
                    <img src={u.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)' }} />
                  ) : (
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#475569' }} />
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {u.roblox_display_name || u.roblox_username}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      @{u.roblox_username}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* COLUMN 2: Conversations List */}
      <div style={{
        flex: '0 0 300px',
        background: 'rgba(30, 41, 59, 0.4)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '0.75rem',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        backdropFilter: 'blur(10px)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 0.75rem 0', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            💬 Daftar Obrolan
          </h3>
          {selectedUser && (
            <button
              onClick={handleFullSync}
              disabled={isSyncingAll}
              style={{
                background: isSyncingAll ? 'rgba(255,255,255,0.05)' : 'rgba(59, 130, 246, 0.15)',
                border: '1px solid rgba(59, 130, 246, 0.35)',
                color: '#fff',
                padding: '0.25rem 0.5rem',
                borderRadius: '0.375rem',
                fontSize: '0.7rem',
                cursor: isSyncingAll ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
              onMouseOver={e => { if(!isSyncingAll) e.currentTarget.style.background = 'rgba(59, 130, 246, 0.25)' }}
              onMouseOut={e => { if(!isSyncingAll) e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)' }}
            >
              🔄 {isSyncingAll ? 'Syncing...' : 'Sync Penuh'}
            </button>
          )}
        </div>
        
        {selectedUser ? (
          <>
            <input
              type="text"
              placeholder="Cari obrolan..."
              value={searchConvQuery}
              onChange={(e) => setSearchConvQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.4rem 0.75rem',
                marginBottom: '0.75rem',
                borderRadius: '0.375rem',
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#fff',
                fontSize: '0.8rem',
                boxSizing: 'border-box'
              }}
            />

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {isLoadingConvs ? (
                <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)' }}>Memuat obrolan...</div>
              ) : filteredConversations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Tidak ada obrolan ditemukan.
                </div>
              ) : (
                filteredConversations.map((c, index) => {
                  const isSelected = selectedConv && (
                    (selectedConv.id && selectedConv.id === c.id) ||
                    (!selectedConv.id && !c.id && selectedConv.name === c.name)
                  );
                  const title = getConvTitle(c);
                  const type = c.type || c.conversationType || 'one_to_one';
                  const isGroup = type === 'group' || type === 'MultiUser';
                  const lastUpdated = c.updated_at || c.lastUpdated || c.LastUpdated;

                  return (
                    <div
                      key={c.id || `null-id-${c.name || index}`}
                      onClick={() => handleSelectConv(c)}
                      style={{
                        padding: '0.6rem 0.8rem',
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.01)',
                        border: isSelected ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid rgba(255,255,255,0.03)',
                        transition: 'all 0.2s',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.15rem'
                      }}
                      onMouseOver={(e) => {
                        if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                      }}
                      onMouseOut={(e) => {
                        if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.01)';
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: isGroup ? '#f472b6' : '#60a5fa' }}>
                          {isGroup ? '👥 ' : '👤 '}{title}
                        </span>
                        {lastUpdated && (
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                            {new Date(lastUpdated).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', textTransform: 'capitalize' }}>
                        Tipe: {isGroup ? 'Grup Party' : 'Pesan Langsung'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>
            Pilih pengguna di kolom kiri untuk melihat daftar obrolan.
          </div>
        )}
      </div>

      {/* COLUMN 3: Messages stream */}
      <div style={{
        flex: 1,
        background: 'rgba(15, 23, 42, 0.35)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '0.75rem',
        display: 'flex',
        flexDirection: 'column',
        backdropFilter: 'blur(10px)',
        overflow: 'hidden'
      }}>
        {selectedConv ? (
          <>
            {/* Header chat */}
            <div style={{
              padding: '0.85rem 1.25rem',
              background: 'rgba(30, 41, 59, 0.5)',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff' }}>
                  {getConvTitle(selectedConv)}
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  ID: {selectedConv.id || 'Lokal (Tanpa ID)'}
                </span>
              </div>
              {selectedConv.id && (
                <button
                  onClick={() => fetchMessages(selectedUser.id, selectedConv.id)}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}
                  onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                  onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                >
                  🔄 Segarkan
                </button>
              )}
            </div>

            {/* Bubble chat stream */}
            <div 
              ref={chatContainerRef}
              onScroll={handleScroll}
              style={{
                flex: 1,
                padding: '1.25rem',
                overflowY: 'auto',
                overflowX: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.85rem'
              }}
            >
              {isLoadingMsgs ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                  Memuat riwayat pesan...
                </div>
              ) : messages.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Belum ada pesan di percakapan ini.
                </div>
              ) : (
                <>
                  {isLoadingMore && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.5rem 0', color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.75rem', gap: '0.5rem', background: 'rgba(0,0,0,0.1)', borderRadius: '0.5rem', margin: '0 0 0.5rem 0' }}>
                      <svg style={{ animation: 'spin 1s linear infinite', width: '14px', height: '14px' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Memuat pesan lama...</span>
                    </div>
                  )}
                  {messages.map((m, index) => {
                    const isSystem = m.type === 'system' || m.sender_user_id === null || m.senderUserId === null;
                    const senderID = m.sender_user_id || m.senderUserId;
                    const isOwn = String(senderID) === String(selectedUser.roblox_user_id);

                    // Date header divider logic
                    const prevMsg = index > 0 ? messages[index - 1] : null;
                    const prevDate = prevMsg ? new Date(prevMsg.created_at || prevMsg.createdAt) : null;
                    const currDate = new Date(m.created_at || m.createdAt);
                    const isNewDay = !prevDate || prevDate.toDateString() !== currDate.toDateString();

                    const dateHeader = isNewDay ? (
                      <div
                        style={{
                          alignSelf: 'center',
                          background: 'rgba(255, 255, 255, 0.08)',
                          padding: '0.25rem 0.75rem',
                          borderRadius: '1rem',
                          fontSize: '0.7rem',
                          color: 'rgba(255, 255, 255, 0.6)',
                          margin: '1rem 0 0.5rem 0',
                          fontWeight: 600,
                          textAlign: 'center',
                          userSelect: 'none'
                        }}
                      >
                        📅 {currDate.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      </div>
                    ) : null;

                    return (
                      <React.Fragment key={m.id}>
                        {dateHeader}
                        {isSystem ? (
                          <div
                            style={{
                              alignSelf: 'center',
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid rgba(255, 255, 255, 0.03)',
                              padding: '0.4rem 0.85rem',
                              borderRadius: '0.5rem',
                              fontSize: '0.75rem',
                              color: 'rgba(255, 255, 255, 0.5)',
                              textAlign: 'center',
                              maxWidth: '85%'
                            }}
                          >
                            📢 {m.content}
                          </div>
                        ) : (
                          <div
                            style={{
                              alignSelf: isOwn ? 'flex-end' : 'flex-start',
                              maxWidth: '70%',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.15rem'
                            }}
                          >
                            {/* Sender tag if other */}
                            {!isOwn && (() => {
                              const userData = selectedConv?.user_data || selectedConv?.userData || {};
                              const sender = userData[senderID];
                              const displayName = sender ? (sender.display_name || sender.displayName || sender.combined_name || sender.name) : `ID: ${senderID}`;
                              const username = sender ? (sender.name || sender.username) : '';
                              return (
                                <span style={{ fontSize: '0.7rem', color: '#c084fc', marginLeft: '0.25rem' }}>
                                  {displayName} {username && `(@${username})`}
                                </span>
                              );
                            })()}
                            {/* Bubble */}
                            <div style={{
                              background: isOwn ? 'rgba(59, 130, 246, 0.25)' : 'rgba(30, 41, 59, 0.85)',
                              border: isOwn ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid rgba(255, 255, 255, 0.05)',
                              padding: '0.65rem 0.85rem',
                              borderRadius: '0.75rem',
                              color: '#fff',
                              fontSize: '0.85rem',
                              lineHeight: 1.4,
                              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                              wordBreak: 'break-word',
                              whiteSpace: 'pre-wrap',
                              overflowWrap: 'anywhere'
                            }}>
                              {m.content}
                            </div>
                            {/* Timestamp */}
                            <span
                              title={currDate.toLocaleString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              style={{
                                alignSelf: isOwn ? 'flex-end' : 'flex-start',
                                fontSize: '0.65rem',
                                color: 'rgba(255, 255, 255, 0.3)',
                                margin: '0.1rem 0.25rem 0 0.25rem',
                                cursor: 'help'
                              }}
                            >
                              {currDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </>
              )}
              <div ref={chatEndRef} />
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '0.5rem', color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
            <span style={{ fontSize: '2.5rem' }}>💬</span>
            <span style={{ fontSize: '0.85rem' }}>Pilih obrolan dari kolom tengah untuk menampilkan riwayat pesan.</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default RobloxChatViewer;
