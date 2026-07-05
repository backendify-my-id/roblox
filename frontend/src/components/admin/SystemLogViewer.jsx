import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../../utils/api';

/**
 * SystemLogViewer Component
 * Handles log file directory fetching, log categorizations (cron, database, http, startup, websocket),
 * live websocket streaming for terminal console logs, text searching, and level filtering (INFO, WARNING, ERROR).
 * 
 * @param {Object} props
 * @param {Function} props.showToast - Function to trigger dynamic toasts
 */
const SystemLogViewer = ({ showToast }) => {
  const [logFiles, setLogFiles] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('cron');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedFile, setSelectedFile] = useState('');
  const [logContent, setLogContent] = useState('');
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState('ALL');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const terminalEndRef = React.useRef(null);

  const CATEGORIES = [
    { value: 'cron', label: 'Cron Jobs ⏰' },
    { value: 'database', label: 'Database (GORM) 🗄️' },
    { value: 'http', label: 'HTTP / API Access 🌐' },
    { value: 'startup', label: 'Startup & System 🚀' },
    { value: 'websocket', label: 'WebSocket Live 🔌' }
  ];

  const getDatesForCategory = (category, files) => {
    return files
      .filter(file => file.startsWith(category + '/'))
      .map(file => file.split('/')[1]?.replace('.log', ''))
      .filter(Boolean);
  };

  const handleCategoryChange = (newCat) => {
    setSelectedCategory(newCat);
    const dates = getDatesForCategory(newCat, logFiles);
    if (dates.length > 0) {
      setSelectedDate(dates[0]);
      setSelectedFile(`${newCat}/${dates[0]}.log`);
    } else {
      setSelectedDate('');
      setSelectedFile('');
      setLogContent('');
    }
  };

  const handleDateChange = (newDate) => {
    setSelectedDate(newDate);
    setSelectedFile(`${selectedCategory}/${newDate}.log`);
  };

  const fetchLogFiles = async () => {
    setIsLoadingFiles(true);
    try {
      const res = await fetchWithAuth('/api/admin/logs/files');
      if (!res.ok) throw new Error('Gagal memuat daftar file log');
      const data = await res.json();
      setLogFiles(Array.isArray(data) ? data : []);
      
      if (data.length > 0) {
        const cronDates = getDatesForCategory('cron', data);
        if (cronDates.length > 0) {
          setSelectedCategory('cron');
          setSelectedDate(cronDates[0]);
          setSelectedFile(`cron/${cronDates[0]}.log`);
        } else {
          const parts = data[0].split('/');
          const cat = parts[0];
          const date = parts[1]?.replace('.log', '');
          setSelectedCategory(cat);
          setSelectedDate(date);
          setSelectedFile(data[0]);
        }
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const fetchLogContent = async (file) => {
    if (!file) return;
    setIsLoadingContent(true);
    try {
      const res = await fetchWithAuth(`/api/admin/logs/files/${file}`);
      if (!res.ok) throw new Error('Gagal memuat isi log');
      const content = await res.text();
      setLogContent(content);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsLoadingContent(false);
    }
  };

  useEffect(() => {
    fetchLogFiles();
  }, []);

  useEffect(() => {
    fetchLogContent(selectedFile);
  }, [selectedFile]);

  // Auto-refresh hook
  useEffect(() => {
    if (!autoRefresh) return;
    const handleWSMessage = (e) => {
      const { type, payload } = e.detail;
      if (type === 'log_stream') {
        const { category, message } = payload;
        if (category === selectedCategory) {
          const today = (() => {
            const d = new Date();
            const offset = d.getTimezoneOffset();
            const local = new Date(d.getTime() - (offset * 60 * 1000));
            return local.toISOString().substring(0, 10);
          })();
          if (selectedDate === today) {
            setLogContent(prev => prev + message);
          }
        }
      }
    };
    window.addEventListener('ws-message', handleWSMessage);
    return () => window.removeEventListener('ws-message', handleWSMessage);
  }, [autoRefresh, selectedCategory, selectedDate]);

  useEffect(() => {
    scrollToBottom();
  }, [logContent]);

  // Filter logs line by line
  const filteredLines = logContent
    .split('\n')
    .filter(line => {
      if (!line.trim()) return false;
      const matchSearch = line.toLowerCase().includes(searchQuery.toLowerCase());
      if (levelFilter === 'ALL') return matchSearch;
      return line.includes(`[${levelFilter}]`) && matchSearch;
    });

  const scrollToBottom = () => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1.5rem', marginTop: '1rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#fff' }}>🖥️ Log Cron Sistem Harian</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.25rem 0 0 0' }}>Pantau seluruh log aktivitas, keberhasilan, dan eror cronjob real-time.</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <button
            onClick={() => fetchLogContent(selectedFile)}
            style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
          >
            🔄 Refresh Manual
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fff', fontSize: '0.85rem', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Live Stream (WS) ⚡
          </label>
        </div>
      </div>

      {/* Select Box and Filter bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Pilih Kategori:</label>
          <select
            value={selectedCategory}
            onChange={(e) => handleCategoryChange(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', background: '#1e293b', border: '1px solid var(--border)', color: '#fff', fontSize: '0.85rem' }}
          >
            {CATEGORIES.map(cat => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Pilih Tanggal:</label>
          <select
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', background: '#1e293b', border: '1px solid var(--border)', color: '#fff', fontSize: '0.85rem' }}
            disabled={isLoadingFiles || getDatesForCategory(selectedCategory, logFiles).length === 0}
          >
            {isLoadingFiles ? (
              <option>Memuat tanggal...</option>
            ) : getDatesForCategory(selectedCategory, logFiles).length === 0 ? (
              <option>Tidak ada tanggal ditemukan</option>
            ) : (
              getDatesForCategory(selectedCategory, logFiles).map(date => (
                <option key={date} value={date}>{date}</option>
              ))
            )}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Cari Teks / Keyword:</label>
          <input
            type="text"
            placeholder="Cari log..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', background: '#1e293b', border: '1px solid var(--border)', color: '#fff', fontSize: '0.85rem' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Filter Level Log:</label>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            {['ALL', 'INFO', 'WARNING', 'ERROR'].map(lvl => (
              <button
                key={lvl}
                onClick={() => setLevelFilter(lvl)}
                style={{
                  flex: 1,
                  padding: '0.4rem 0',
                  borderRadius: '0.35rem',
                  border: 'none',
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  background: levelFilter === lvl
                    ? (lvl === 'INFO' ? 'rgba(34,197,94,0.2)' : lvl === 'WARNING' ? 'rgba(245,158,11,0.2)' : lvl === 'ERROR' ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)')
                    : 'rgba(255,255,255,0.05)',
                  color: levelFilter === lvl
                    ? (lvl === 'INFO' ? '#4ade80' : lvl === 'WARNING' ? '#fbbf24' : lvl === 'ERROR' ? '#f87171' : '#60a5fa')
                    : 'var(--text-muted)'
                }}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Terminal Board */}
      <div
        style={{
          background: '#090d16',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: '0.75rem',
          padding: '1.25rem',
          fontFamily: 'monospace',
          fontSize: '0.85rem',
          lineHeight: '1.6',
          maxHeight: '500px',
          overflowY: 'auto',
          boxShadow: 'inset 0 0 15px rgba(0,0,0,0.8)'
        }}
      >
        {isLoadingContent ? (
          <div style={{ color: '#94a3b8', textAlign: 'center', padding: '3rem 0' }}>Memuat isi log...</div>
        ) : filteredLines.length === 0 ? (
          <div style={{ color: '#64748b', textAlign: 'center', padding: '3rem 0' }}>Tidak ada baris log yang cocok dengan filter.</div>
        ) : (
          filteredLines.map((line, idx) => {
            let color = '#e2e8f0';
            if (line.includes('[INFO]')) color = '#a7f3d0';
            else if (line.includes('[WARNING]')) color = '#fde68a';
            else if (line.includes('[ERROR]')) color = '#fca5a5';

            return (
              <div key={idx} style={{ color, whiteSpace: 'pre-wrap', borderBottom: '1px solid rgba(255,255,255,0.02)', padding: '0.2rem 0' }}>
                {line}
              </div>
            );
          })
        )}
        <div ref={terminalEndRef} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', gap: '0.5rem' }}>
        <button
          onClick={scrollToBottom}
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: '#fff', padding: '0.4rem 0.8rem', borderRadius: '0.35rem', cursor: 'pointer', fontSize: '0.8rem' }}
        >
          ⬇️ Scroll ke Bawah
        </button>
      </div>
    </div>
  );
};

export default SystemLogViewer;
