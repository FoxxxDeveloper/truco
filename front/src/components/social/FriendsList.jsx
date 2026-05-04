/**
 * FriendsList — panel showing friends, pending requests, and send-request UI.
 *
 * Uses:
 *   GET  /api/social/friends
 *   GET  /api/social/friends/requests
 *   POST /api/social/friends/:userId/request
 *   PUT  /api/social/friends/:userId/accept
 *   DEL  /api/social/friends/:userId
 */
import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function FriendsList({ onClose, onStartChat }) {
  const { token } = useAuth();

  const [friends, setFriends]   = useState([]);
  const [requests, setRequests] = useState([]);
  const [tab, setTab]           = useState('friends'); // 'friends' | 'requests' | 'add'
  const [search, setSearch]     = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching] = useState(false);

  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const load = useCallback(async () => {
    try {
      const [fRes, rRes] = await Promise.all([
        fetch(`${API}/api/social/friends`, { headers: h }),
        fetch(`${API}/api/social/friends/requests`, { headers: h }),
      ]);
      if (fRes.ok) setFriends((await fRes.json()).friends || []);
      if (rRes.ok) setRequests((await rRes.json()).requests || []);
    } catch {}
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const searchUser = async () => {
    if (!search.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`${API}/api/profile/${encodeURIComponent(search.trim())}`, { headers: h });
      if (res.ok) {
        setSearchResult(await res.json());
      } else {
        setSearchResult(null);
        toast.error('Usuario no encontrado');
      }
    } catch {
      toast.error('Error al buscar');
    } finally {
      setSearching(false);
    }
  };

  const sendRequest = async (userId) => {
    const res = await fetch(`${API}/api/social/friends/${userId}/request`, { method: 'POST', headers: h });
    const data = await res.json();
    if (res.ok) toast.success('Solicitud enviada');
    else toast.error(data.error || 'Error');
  };

  const acceptRequest = async (userId) => {
    const res = await fetch(`${API}/api/social/friends/${userId}/accept`, { method: 'PUT', headers: h });
    if (res.ok) { toast.success('¡Ahora son amigos!'); load(); }
    else toast.error('Error al aceptar');
  };

  const removeFriend = async (userId) => {
    const res = await fetch(`${API}/api/social/friends/${userId}`, { method: 'DELETE', headers: h });
    if (res.ok) { toast.success('Amigo eliminado'); load(); }
    else toast.error('Error al eliminar');
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
      style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', zIndex: 100 }}
      onClick={onClose}
    >
      <motion.div
        style={{ background: '#1e2a3a', borderRadius: 16, padding: 24, width: 380, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, color: '#fff' }}>👥 Amigos</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#ccc', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[['friends', `Amigos (${friends.length})`], ['requests', `Solicitudes (${requests.length})`], ['add', 'Agregar']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: tab === id ? '#3b82f6' : '#243447', color: '#fff', fontWeight: 600, fontSize: 12,
            }}>{label}</button>
          ))}
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {/* Friends list */}
          {tab === 'friends' && (
            friends.length === 0
              ? <p style={{ color: '#9ca3af', textAlign: 'center' }}>Sin amigos todavía</p>
              : friends.map(f => (
                <div key={f.id} style={{
                  background: '#243447', borderRadius: 10, padding: '10px 14px', marginBottom: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', background: '#374151',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                    }}>
                      {f.avatar ? <img src={f.avatar} alt="" style={{ width: '100%', borderRadius: '50%' }} /> : '🎴'}
                    </div>
                    <div>
                      <div style={{ color: '#fff', fontWeight: 600 }}>{f.username}</div>
                      <div style={{ color: '#9ca3af', fontSize: 11 }}>ELO {f.elo || '—'}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {onStartChat && (
                      <button onClick={() => onStartChat(f)} style={{
                        background: '#1d4ed8', border: 'none', borderRadius: 6, padding: '5px 10px',
                        color: '#fff', cursor: 'pointer', fontSize: 12,
                      }}>💬</button>
                    )}
                    <button onClick={() => removeFriend(f.id)} style={{
                      background: '#7f1d1d', border: 'none', borderRadius: 6, padding: '5px 10px',
                      color: '#fff', cursor: 'pointer', fontSize: 12,
                    }}>✕</button>
                  </div>
                </div>
              ))
          )}

          {/* Pending requests */}
          {tab === 'requests' && (
            requests.length === 0
              ? <p style={{ color: '#9ca3af', textAlign: 'center' }}>Sin solicitudes pendientes</p>
              : requests.map(r => (
                <div key={r.id} style={{
                  background: '#243447', borderRadius: 10, padding: '10px 14px', marginBottom: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div style={{ color: '#fff', fontWeight: 600 }}>{r.username}</div>
                  <button onClick={() => acceptRequest(r.id)} style={{
                    background: '#16a34a', border: 'none', borderRadius: 6, padding: '6px 12px',
                    color: '#fff', cursor: 'pointer', fontWeight: 600,
                  }}>Aceptar</button>
                </div>
              ))
          )}

          {/* Add friend */}
          {tab === 'add' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  placeholder="Nombre de usuario"
                  value={search} onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchUser()}
                  style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #374151', background: '#243447', color: '#fff' }}
                />
                <button onClick={searchUser} disabled={searching} style={{
                  padding: '10px 16px', borderRadius: 8, border: 'none',
                  background: '#3b82f6', color: '#fff', cursor: 'pointer', fontWeight: 600,
                }}>Buscar</button>
              </div>
              {searchResult && (
                <div style={{ background: '#243447', borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 600 }}>{searchResult.username}</div>
                    <div style={{ color: '#9ca3af', fontSize: 12 }}>ELO {searchResult.elo || '—'}</div>
                  </div>
                  <button onClick={() => sendRequest(searchResult.id)} style={{
                    background: '#1d4ed8', border: 'none', borderRadius: 6, padding: '7px 14px',
                    color: '#fff', cursor: 'pointer', fontWeight: 600,
                  }}>Agregar</button>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
