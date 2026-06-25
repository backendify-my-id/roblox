import React, { useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '../utils/api';

const NetworkGraph3D = ({ showToast }) => {
  const containerRef = useRef(null);
  const graphInstance = useRef(null);
  const [loading, setLoading] = useState(true);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [stats, setStats] = useState({ totalNodes: 0, totalLinks: 0, avgConnections: 0 });
  const [highlightNodes, setHighlightNodes] = useState(new Set());
  const [highlightLinks, setHighlightLinks] = useState(new Set());
  const [hoverNode, setHoverNode] = useState(null);
  
  // Mobile responsive layout states
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 1. Dynamic Script Loader for THREE.js and 3d-force-graph CDN
  useEffect(() => {
    if (window.ForceGraph3D) {
      setScriptLoaded(true);
      return;
    }
    
    // Load THREE.js first to enable custom lighting elements in scene
    const threeScript = document.createElement('script');
    threeScript.src = 'https://unpkg.com/three@0.137.5/build/three.min.js';
    threeScript.async = false;
    threeScript.onload = () => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/3d-force-graph@1.73.0/dist/3d-force-graph.min.js';
      script.async = false;
      script.onload = () => {
        setScriptLoaded(true);
      };
      script.onerror = () => {
        showToast('Gagal memuat visualisasi 3D dari CDN', 'error');
      };
      document.body.appendChild(script);
    };
    document.body.appendChild(threeScript);

    return () => {
      // Clean up scripts on unmount if needed
    };
  }, [showToast]);

  // 2. Fetch Graph Data
  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await fetchWithAuth('/api/admin/network-graph');
        if (!res.ok) throw new Error('Gagal memuat data jaringan');
        const data = await res.json();

        // Calculate node degree (number of connections) to determine node sizing
        const connections = {};
        data.links.forEach(l => {
          connections[l.source] = (connections[l.source] || 0) + 1;
          connections[l.target] = (connections[l.target] || 0) + 1;
        });

        const updatedNodes = data.nodes.map(n => ({
          ...n,
          val: Math.max(4, (connections[n.id] || 0) * 2.5) // larger node size scale
        }));

        setGraphData({ nodes: updatedNodes, links: data.links });

        // Calculate stats
        const nodeCount = updatedNodes.length;
        const linkCount = data.links.length;
        const avg = nodeCount > 0 ? (linkCount * 2 / nodeCount).toFixed(1) : 0;
        setStats({ totalNodes: nodeCount, totalLinks: linkCount, avgConnections: avg });

      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [showToast]);

  // 3. Render and Update 3D Graph
  useEffect(() => {
    if (!scriptLoaded || loading || !containerRef.current || graphData.nodes.length === 0) return;

    // Initialize 3D Force Graph
    if (!graphInstance.current) {
      graphInstance.current = window.ForceGraph3D()(containerRef.current);

      // Enhance lighting to make 3D spheres pop and look shiny
      const scene = graphInstance.current.scene();
      if (window.THREE) {
        // Bright ambient light
        const extraAmbient = new window.THREE.AmbientLight(0xffffff, 0.9);
        scene.add(extraAmbient);

        // Highlight directional light to catch specular highlights on spheres
        const dirLight = new window.THREE.DirectionalLight(0xffffff, 1.5);
        dirLight.position.set(100, 200, 150);
        scene.add(dirLight);

        // Mid point light for soft color tone
        const pointLight = new window.THREE.PointLight(0x818cf8, 1.8, 400);
        pointLight.position.set(0, 0, 50);
        scene.add(pointLight);
      }
    }

    const g = graphInstance.current;

    // Set graph settings
    g.graphData(graphData)
      .backgroundColor('#0f172a') // Slate 900 matching dashboard
      .showNavInfo(false)
      .nodeLabel(node => {
        return `
          <div style="background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.1); padding: 0.75rem; border-radius: 0.75rem; color: #fff; font-family: system-ui, -apple-system, sans-serif; min-width: 180px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5);">
            <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
              <img src="${node.avatar_url || 'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-58FED92CCBD75B6861F80102D995CCCE-Png/150/150/AvatarHeadshot/Png/noFilter'}" style="width: 36px; height: 36px; border-radius: 50%; border: 2px solid ${node.presence === 'In-Game' ? '#a78bfa' : node.presence === 'Online' ? '#22c55e' : '#94a3b8'}"/>
              <div>
                <div style="font-weight: 700; font-size: 0.85rem; color: #f8fafc;">${node.display_name}</div>
                <div style="font-size: 0.75rem; color: #94a3b8;">@${node.username}</div>
              </div>
            </div>
            <div style="font-size: 0.75rem; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 0.4rem; display: flex; flex-direction: column; gap: 0.2rem;">
              <div><strong>Peran:</strong> <span style="color: #60a5fa">${node.role}</span></div>
              <div><strong>Status:</strong> <span style="color: ${node.presence === 'In-Game' ? '#a78bfa' : node.presence === 'Online' ? '#22c55e' : '#94a3b8'}">${node.presence}</span></div>
              ${node.game_name && node.game_name !== '-' ? `<div style="color: #c084fc; font-weight: 600; margin-top: 0.1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;">🎮 ${node.game_name}</div>` : ''}
            </div>
          </div>
        `;
      })
      .nodeVal(node => node.val)
      .nodeColor(node => {
        if (highlightNodes.size > 0 && !highlightNodes.has(node.id)) {
          return 'rgba(255, 255, 255, 0.15)'; // dim node
        }
        switch (node.presence) {
          case 'Online': return '#4ade80'; // Neon Green
          case 'In-Game': return '#c084fc'; // Neon Purple
          case 'In-Studio': return '#60a5fa'; // Neon Blue
          default: return '#e2e8f0'; // Shiny Slate-White for Offline
        }
      })
      .nodeRelSize(4)
      .linkColor(link => {
        if (highlightLinks.size > 0 && !highlightLinks.has(link)) {
          return 'rgba(255, 255, 255, 0.02)'; // dim line
        }
        return 'rgba(99, 102, 241, 0.65)'; // Bright Indigo semi-transparent neon line
      })
      .linkWidth(link => (highlightLinks.has(link) ? 4 : 1.8))
      .linkDirectionalParticles(link => {
        // Find if target node is In-Game or active
        const targetNode = typeof link.target === 'object' ? link.target : graphData.nodes.find(n => n.id === link.target);
        return targetNode && targetNode.presence === 'In-Game' ? 2 : 0;
      })
      .linkDirectionalParticleWidth(link => (highlightLinks.has(link) ? 3 : 1.5))
      .linkDirectionalParticleSpeed(0.005)
      .linkDirectionalParticleColor(() => '#a855f7') // purple pulses for In-Game
      .onNodeClick(node => {
        // Highlight logic
        const clickedNode = node;
        const newHighlightNodes = new Set();
        const newHighlightLinks = new Set();

        // Add self
        newHighlightNodes.add(clickedNode.id);

        // Find connected friends
        graphData.links.forEach(link => {
          const s = typeof link.source === 'object' ? link.source.id : link.source;
          const t = typeof link.target === 'object' ? link.target.id : link.target;
          if (s === clickedNode.id) {
            newHighlightNodes.add(t);
            newHighlightLinks.add(link);
          } else if (t === clickedNode.id) {
            newHighlightNodes.add(s);
            newHighlightLinks.add(link);
          }
        });

        // Toggle state or reset if clicked same node twice
        if (highlightNodes.has(clickedNode.id) && highlightNodes.size === 1) {
          setHighlightNodes(new Set());
          setHighlightLinks(new Set());
        } else {
          setHighlightNodes(newHighlightNodes);
          setHighlightLinks(newHighlightLinks);
        }

        // Aim camera at clicked node
        const distance = 80;
        const distRatio = 1 + distance / Math.hypot(clickedNode.x, clickedNode.y, clickedNode.z);
        g.cameraPosition(
          { x: clickedNode.x * distRatio, y: clickedNode.y * distRatio, z: clickedNode.z * distRatio }, // new pos
          clickedNode, // lookAt
          2000  // ms transition
        );
      });

    // Clean up graph instance on unmount
    return () => {
      // Keep instance alive, but cleanup when unmounting component
    };
  }, [scriptLoaded, loading, graphData, highlightNodes, highlightLinks]);

  // Handle highlights reactivity
  useEffect(() => {
    if (graphInstance.current && graphData.nodes.length > 0) {
      graphInstance.current.nodeColor(graphInstance.current.nodeColor());
      graphInstance.current.linkColor(graphInstance.current.linkColor());
      graphInstance.current.linkWidth(graphInstance.current.linkWidth());
    }
  }, [highlightNodes, highlightLinks]);

  // 4. Handle Search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const q = searchQuery.toLowerCase();
    const filtered = graphData.nodes.filter(
      n => n.username.toLowerCase().includes(q) || n.display_name.toLowerCase().includes(q)
    );
    setSearchResults(filtered.slice(0, 5));
  }, [searchQuery, graphData]);

  const focusOnUser = (userNode) => {
    if (!graphInstance.current) return;
    const nodeObj = graphData.nodes.find(n => n.id === userNode.id);
    if (nodeObj && nodeObj.x !== undefined) {
      const g = graphInstance.current;
      const distance = 80;
      const distRatio = 1 + distance / Math.hypot(nodeObj.x, nodeObj.y, nodeObj.z);
      g.cameraPosition(
        { x: nodeObj.x * distRatio, y: nodeObj.y * distRatio, z: nodeObj.z * distRatio },
        nodeObj,
        2000
      );

      // Trigger highlighing
      const newHighlightNodes = new Set();
      const newHighlightLinks = new Set();
      newHighlightNodes.add(nodeObj.id);
      graphData.links.forEach(link => {
        const s = typeof link.source === 'object' ? link.source.id : link.source;
        const t = typeof link.target === 'object' ? link.target.id : link.target;
        if (s === nodeObj.id) {
          newHighlightNodes.add(t);
          newHighlightLinks.add(link);
        } else if (t === nodeObj.id) {
          newHighlightNodes.add(s);
          newHighlightLinks.add(link);
        }
      });
      setHighlightNodes(newHighlightNodes);
      setHighlightLinks(newHighlightLinks);
    } else {
      showToast('Kamera belum dapat membidik simpul, tunggu simulasi stabil.', 'info');
    }
    setSearchQuery('');
  };

  const resetHighlight = () => {
    setHighlightNodes(new Set());
    setHighlightLinks(new Set());
    if (graphInstance.current) {
      graphInstance.current.cameraPosition({ x: 0, y: 0, z: 250 }, { x: 0, y: 0, z: 0 }, 1500);
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: isMobile ? '500px' : 'calc(100vh - 180px)', minHeight: isMobile ? '400px' : '600px', borderRadius: '1rem', overflow: 'hidden', background: '#0f172a', border: '1px solid var(--border)' }}>
      {/* 3D Render Canvas Container */}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Loading Overlay */}
      {(loading || !scriptLoaded) && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', gap: '1rem', zIndex: 10 }}>
          <span style={{ fontSize: '2rem', animation: 'spin 1.5s linear infinite' }}>⏳</span>
          <div style={{ fontWeight: 600 }}>Memuat Visualisasi 3D WebGL...</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Mempersiapkan data grafik relasi pertemanan</div>
        </div>
      )}

      {/* Mobile Menu Toggle Button */}
      {isMobile && !panelOpen && (
        <button
          onClick={() => setPanelOpen(true)}
          style={{
            position: 'absolute',
            top: '1rem',
            left: '1rem',
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '0.5rem',
            padding: '0.6rem 1rem',
            color: '#fff',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            zIndex: 5,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}
        >
          ⚙️ Menu & Filter
        </button>
      )}

      {/* Floating Control UI Panel (Left Side - Collapsible on Mobile) */}
      {(!isMobile || panelOpen) && (
        <div style={{
          position: 'absolute',
          top: '1rem',
          left: '1rem',
          width: isMobile ? 'calc(100% - 2rem)' : '280px',
          maxHeight: 'calc(100% - 2rem)',
          overflowY: 'auto',
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '0.75rem',
          padding: '1.25rem',
          color: '#fff',
          zIndex: 6,
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', fontWeight: 700 }}>🕸️ Jaringan Pertemanan 3D</h3>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Representasi visual relasi pelacakan antar akun</p>
            </div>
            {isMobile && (
              <button
                onClick={() => setPanelOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: 0,
                  lineHeight: 1
                }}
              >
                &times;
              </button>
            )}
          </div>

        {/* Stats Section */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '0.5rem', padding: '0.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8rem' }}>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Total Akun</div>
            <strong style={{ fontSize: '1.1rem', color: '#60a5fa' }}>{stats.totalNodes}</strong>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Total Hubungan</div>
            <strong style={{ fontSize: '1.1rem', color: '#818cf8' }}>{stats.totalLinks}</strong>
          </div>
          <div style={{ gridColumn: 'span 2', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.4rem', marginTop: '0.2rem' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'inline' }}>Rata-rata Teman: </div>
            <strong style={{ color: '#34d399' }}>{stats.avgConnections}</strong>
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.8rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.8rem' }}>
          <div style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Legenda Status</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#a855f7', boxShadow: '0 0 6px #a855f7' }} />
            <span>Sedang Bermain (In-Game)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
            <span>Online</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6', boxShadow: '0 0 6px #3b82f6' }} />
            <span>In-Studio (Roblox Studio)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#64748b' }} />
            <span>Offline</span>
          </div>
        </div>

        {/* Search Box */}
        <div style={{ position: 'relative', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.8rem' }}>
          <div style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Fokus Pengguna</div>
          <div className="search-container" style={{ margin: 0 }}>
            <span className="search-icon" style={{ fontSize: '0.8rem' }}>🔍</span>
            <input
              type="text"
              placeholder="Cari username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.45rem 1rem 0.45rem 2.2rem',
                borderRadius: '0.35rem',
                border: '1px solid var(--border)',
                background: 'var(--bg-card)',
                color: '#fff',
                fontSize: '0.85rem'
              }}
            />
          </div>

          {/* Autocomplete Dropdown */}
          {searchResults.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              width: '100%',
              background: '#1e293b',
              border: '1px solid var(--border)',
              borderRadius: '0.35rem',
              marginTop: '0.25rem',
              overflow: 'hidden',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
              zIndex: 10
            }}>
              {searchResults.map(user => (
                <div
                  key={user.id}
                  onClick={() => focusOnUser(user)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 0.75rem',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <img src={user.avatar_url || 'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-58FED92CCBD75B6861F80102D995CCCE-Png/150/150/AvatarHeadshot/Png/noFilter'} style={{ width: '20px', height: '20px', borderRadius: '50%' }} alt=""/>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <strong>{user.display_name}</strong> (@{user.username})
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.8rem' }}>
          {highlightNodes.size > 0 && (
            <button
              onClick={resetHighlight}
              style={{
                flex: 1,
                background: '#334155',
                color: '#fff',
                border: 'none',
                padding: '0.45rem 0',
                borderRadius: '0.35rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#475569'}
              onMouseLeave={e => e.currentTarget.style.background = '#334155'}
            >
              🔄 Reset Fokus
            </button>
          )}
        </div>
      </div>
      )}

      {/* Graph Tips/Instructions Overlay (Bottom Center) */}
      <div style={{
        position: 'absolute',
        bottom: '1rem',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '2rem',
        padding: '0.5rem 1.25rem',
        fontSize: '0.75rem',
        color: 'var(--text-muted)',
        zIndex: 5,
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        pointerEvents: 'none',
        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)'
      }}>
        💡 <span>Drag mouse untuk memutar · Scroll zoom · Klik simpul untuk fokus pertemanan</span>
      </div>
    </div>
  );
};

export default NetworkGraph3D;
