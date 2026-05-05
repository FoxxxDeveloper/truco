/**
 * FriendsList — panel showing friends, pending requests, and send-request UI.
 *
 * Props:
 *   onClose       () => void
 *   onStartChat   (friend) => void
 *   unreadCounts  { [userId]: number }  — unread messages per friend
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { toastErrorOnce } from '../../utils/toastOnce';
import { useAuth } from '../../context/AuthContext';
import { getSocket } from '../../services/socket';
import { socialApi, profileApi } from '../../services/api';

export default function FriendsList({ onClose, onStartChat, unreadCounts = {} }) {
  const { user } = useAuth();

  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [tab, setTab] = useState('friends'); // 'friends' | 'requests' | 'add'
  const [search, setSearch] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);
  // Online presence: userId → { status: 'lobby' | 'in_game' | 'offline' }
  const [presence, setPresence] = useState({});
  const presenceListenerRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const [fRes, rRes] = await Promise.all([
        socialApi.getFriends(),
        socialApi.getFriendRequests(),
      ]);

      const loadedFriends = fRes.data.friends || [];
      setFriends(loadedFriends);
      setRequests(rRes.data.requests || []);

      // Query presence for all friends
      const socket = getSocket();
      if (socket?.connected && loadedFriends.length > 0) {
        socket.emit('presence:get', { userIds: loadedFriends.map(f => f.id) });
      }
    } catch (err) {
      console.error(err);
      toastErrorOnce('Error al cargar amigos');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Set up presence:update socket listener once
  useEffect(() => {
    const socket = getSocket();
    if (!socket || presenceListenerRef.current) return;
    presenceListenerRef.current = true;

    const handlePresence = (data) => {
      setPresence(prev => ({ ...prev, ...data }));
    };

    socket.on('presence:update', handlePresence);
    return () => {
      socket.off('presence:update', handlePresence);
      presenceListenerRef.current = false;
    };
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const searchUser = async () => {
    if (!search.trim()) return;
    setSearching(true);
    setSearchResult(null);
    try {
      const res = await profileApi.getUser(search.trim());
      setSearchResult(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Usuario no encontrado');
    } finally {
      setSearching(false);
    }
  };

  const sendRequest = async (userId) => {
    if (!userId) { toast.error('Usuario inválido'); return; }
    setLoadingAction(true);
    try {
      await socialApi.sendFriendRequest(userId);
      toast.success('Solicitud enviada');
      setSearch('');
      setSearchResult(null);
      setTab('friends');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al enviar solicitud');
    } finally {
      setLoadingAction(false);
    }
  };

  const acceptRequest = async (userId) => {
    setLoadingAction(true);
    try {
      await socialApi.acceptFriend(userId);
      toast.success('¡Ahora son amigos!');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al aceptar');
    } finally {
      setLoadingAction(false);
    }
  };

  const removeFriend = async (userId) => {
    setLoadingAction(true);
    try {
      await socialApi.removeFriend(userId);
      toast.success('Amigo eliminado');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al eliminar');
    } finally {
      setLoadingAction(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)',
        zIndex: 100,
        padding: 16,
      }}
      onClick={onClose}
    >
      <motion.div
        style={{
          background: 'var(--panel, #5b2f16)',
          border: '1px solid var(--border-gold, rgba(246,196,83,.42))',
          borderRadius: 22,
          padding: 24,
          width: 400,
          maxWidth: '100%',
          maxHeight: '80vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-lg, 0 28px 72px rgba(0,0,0,.62))',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <h2 style={{ margin: 0, color: 'var(--gold-light, #ffe39b)' }}>
            Amigos
          </h2>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,246,221,.08)',
              border: '1px solid var(--border, rgba(255, 226, 166, .14))',
              borderRadius: 12,
              color: 'var(--text-soft, #efd2a0)',
              fontSize: 18,
              cursor: 'pointer',
              width: 36,
              height: 36,
            }}
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[
            ['friends', `Amigos (${friends.length})`],
            ['requests', `Solicitudes (${requests.length})`],
            ['add', 'Agregar'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                flex: 1,
                padding: '8px 0',
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer',
                background:
                  tab === id
                    ? 'linear-gradient(180deg, #ffe39b 0%, #f6c453 48%, #c98216 100%)'
                    : 'rgba(255,246,221,.08)',
                color: tab === id ? '#271306' : 'var(--text, #fff6dd)',
                fontWeight: 800,
                fontSize: 12,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
          {/* Friends list */}
          {tab === 'friends' &&
            (friends.length === 0 ? (
              <p
                style={{
                  color: 'var(--text-muted, #b98a56)',
                  textAlign: 'center',
                  padding: '24px 0',
                }}
              >
                Sin amigos todavía
              </p>
            ) : (
              friends.map((f) => (
                <div
                  key={f.id}
                  style={{
                    background: 'rgba(255,246,221,.07)',
                    border: '1px solid rgba(255,246,221,.10)',
                    borderRadius: 14,
                    padding: '10px 14px',
                    marginBottom: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 38, height: 38, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #e7a92f, #ef7f1a)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 16, overflow: 'hidden', position: 'relative', flexShrink: 0,
                      }}
                    >
                      {f.avatar ? (
                        <img src={f.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                      ) : (
                        <span style={{ color: '#3a1800', fontWeight: 800, fontSize: 15 }}>
                          {(f.username || '?').slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      {/* Presence dot */}
                      {(() => {
                        const p = presence[f.id]?.status;
                        const dotColor = p === 'lobby' ? '#4ade80' : p === 'in_game' ? '#facc15' : '#6b7280';
                        return (
                          <span style={{
                            position: 'absolute', bottom: 0, right: 0,
                            width: 11, height: 11, borderRadius: '50%',
                            background: dotColor, border: '2px solid #2a1306',
                          }} title={p === 'lobby' ? 'En línea' : p === 'in_game' ? 'En partida' : 'Desconectado'} />
                        );
                      })()}
                    </div>

                    <div>
                      <div style={{ color: '#fff', fontWeight: 800 }}>
                        {f.username}
                      </div>
                      <div style={{ color: 'var(--text-muted, #b98a56)', fontSize: 11 }}>
                        {presence[f.id]?.status === 'lobby' && <span style={{ color: '#4ade80' }}>● En línea </span>}
                        {presence[f.id]?.status === 'in_game' && <span style={{ color: '#facc15' }}>● En partida </span>}
                        {(!presence[f.id] || presence[f.id]?.status === 'offline' || presence[f.id]?.status === 'disconnected') && <span style={{ color: '#6b7280' }}>● Desconectado </span>}
                        · ELO {f.elo || '—'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {onStartChat && (
                      <button
                        onClick={() => onStartChat(f)}
                        disabled={loadingAction}
                        style={{
                          background: '#1d4ed8',
                          border: 'none',
                          borderRadius: 8,
                          padding: '6px 10px',
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: 12,
                          position: 'relative',
                        }}
                      >
                        💬
                        {unreadCounts[f.id] > 0 && (
                          <span style={{
                            position: 'absolute', top: -5, right: -5,
                            background: '#ef4444', color: '#fff',
                            borderRadius: '50%', width: 16, height: 16,
                            fontSize: 9, fontWeight: 700,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {unreadCounts[f.id] > 9 ? '9+' : unreadCounts[f.id]}
                          </span>
                        )}
                      </button>
                    )}

                    <button
                      onClick={() => removeFriend(f.id)}
                      disabled={loadingAction}
                      style={{
                        background: '#7f1d1d',
                        border: 'none',
                        borderRadius: 8,
                        padding: '6px 10px',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))
            ))}

          {/* Pending requests */}
          {tab === 'requests' &&
            (requests.length === 0 ? (
              <p
                style={{
                  color: 'var(--text-muted, #b98a56)',
                  textAlign: 'center',
                  padding: '24px 0',
                }}
              >
                Sin solicitudes pendientes
              </p>
            ) : (
              requests.map((r) => (
                <div
                  key={r.id}
                  style={{
                    background: 'rgba(255,246,221,.07)',
                    border: '1px solid rgba(255,246,221,.10)',
                    borderRadius: 14,
                    padding: '10px 14px',
                    marginBottom: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ color: '#fff', fontWeight: 800 }}>
                      {r.username}
                    </div>
                    <div
                      style={{
                        color: 'var(--text-muted, #b98a56)',
                        fontSize: 11,
                      }}
                    >
                      Quiere agregarte
                    </div>
                  </div>

                  <button
                    onClick={() => acceptRequest(r.id)}
                    disabled={loadingAction}
                    style={{
                      background: '#16a34a',
                      border: 'none',
                      borderRadius: 8,
                      padding: '7px 12px',
                      color: '#fff',
                      cursor: 'pointer',
                      fontWeight: 800,
                    }}
                  >
                    Aceptar
                  </button>
                </div>
              ))
            ))}

          {/* Add friend */}
          {tab === 'add' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  placeholder="Nombre de usuario"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchUser()}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(255,246,221,.16)',
                    background: 'rgba(31,13,4,.62)',
                    color: '#fff',
                    outline: 'none',
                  }}
                />

                <button
                  onClick={searchUser}
                  disabled={searching}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 10,
                    border: 'none',
                    background:
                      'linear-gradient(180deg, #ffe39b 0%, #f6c453 48%, #c98216 100%)',
                    color: '#271306',
                    cursor: 'pointer',
                    fontWeight: 900,
                  }}
                >
                  {searching ? '...' : 'Buscar'}
                </button>
              </div>

              {searchResult && (
                <div
                  style={{
                    background: 'rgba(255,246,221,.07)',
                    border: '1px solid rgba(255,246,221,.10)',
                    borderRadius: 14,
                    padding: '12px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ color: '#fff', fontWeight: 800 }}>
                      {searchResult.username}
                    </div>
                    <div
                      style={{
                        color: 'var(--text-muted, #b98a56)',
                        fontSize: 12,
                      }}
                    >
                      ELO {searchResult.elo || '—'}
                    </div>
                  </div>

                  <button
                    onClick={() => sendRequest(searchResult.id)}
                    disabled={loadingAction}
                    style={{
                      background: '#1d4ed8',
                      border: 'none',
                      borderRadius: 8,
                      padding: '8px 14px',
                      color: '#fff',
                      cursor: 'pointer',
                      fontWeight: 800,
                    }}
                  >
                    Agregar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}