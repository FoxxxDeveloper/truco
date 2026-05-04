/**
 * FriendsList — panel showing friends, pending requests, and send-request UI.
 *
 * Uses:
 *   GET  /api/social/friends
 *   GET  /api/social/friends/requests
 *   GET  /api/profile/:username
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
  const { user } = useAuth();

  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [tab, setTab] = useState('friends'); // 'friends' | 'requests' | 'add'
  const [search, setSearch] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);

  const getHeaders = () => {
    const token = localStorage.getItem('truco_token');

    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  };

  const parseResponse = async (res) => {
    try {
      return await res.json();
    } catch {
      return {};
    }
  };

  const load = useCallback(async () => {
    try {
      const [fRes, rRes] = await Promise.all([
        fetch(`${API}/api/social/friends`, { headers: getHeaders() }),
        fetch(`${API}/api/social/friends/requests`, { headers: getHeaders() }),
      ]);

      const friendsData = await parseResponse(fRes);
      const requestsData = await parseResponse(rRes);

      if (fRes.ok) {
        setFriends(friendsData.friends || []);
      } else {
        toast.error(friendsData.error || 'Error al cargar amigos');
      }

      if (rRes.ok) {
        setRequests(requestsData.requests || []);
      } else {
        toast.error(requestsData.error || 'Error al cargar solicitudes');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error de conexión al cargar amigos');
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const searchUser = async () => {
    if (!search.trim()) return;

    setSearching(true);
    setSearchResult(null);

    try {
      const res = await fetch(
        `${API}/api/profile/${encodeURIComponent(search.trim())}`,
        { headers: getHeaders() }
      );

      const data = await parseResponse(res);

      if (res.ok) {
        setSearchResult(data);
      } else {
        toast.error(data.error || 'Usuario no encontrado');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error al buscar');
    } finally {
      setSearching(false);
    }
  };

  const sendRequest = async (userId) => {
    if (!userId) {
      toast.error('Usuario inválido');
      return;
    }

    setLoadingAction(true);

    try {
      const res = await fetch(`${API}/api/social/friends/${userId}/request`, {
        method: 'POST',
        headers: getHeaders(),
      });

      const data = await parseResponse(res);

      if (res.ok) {
        toast.success('Solicitud enviada');
        setSearch('');
        setSearchResult(null);
        setTab('friends');
        await load();
      } else {
        toast.error(data.error || 'Error al enviar solicitud');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error de conexión');
    } finally {
      setLoadingAction(false);
    }
  };

  const acceptRequest = async (userId) => {
    setLoadingAction(true);

    try {
      const res = await fetch(`${API}/api/social/friends/${userId}/accept`, {
        method: 'PUT',
        headers: getHeaders(),
      });

      const data = await parseResponse(res);

      if (res.ok) {
        toast.success('¡Ahora son amigos!');
        await load();
      } else {
        toast.error(data.error || 'Error al aceptar');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error de conexión');
    } finally {
      setLoadingAction(false);
    }
  };

  const removeFriend = async (userId) => {
    setLoadingAction(true);

    try {
      const res = await fetch(`${API}/api/social/friends/${userId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });

      const data = await parseResponse(res);

      if (res.ok) {
        toast.success('Amigo eliminado');
        await load();
      } else {
        toast.error(data.error || 'Error al eliminar');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error de conexión');
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
            👥 Amigos
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
                        width: 38,
                        height: 38,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #e7a92f, #ef7f1a)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 16,
                        overflow: 'hidden',
                      }}
                    >
                      {f.avatar ? (
                        <img
                          src={f.avatar}
                          alt=""
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            borderRadius: '50%',
                          }}
                        />
                      ) : (
                        '🧉'
                      )}
                    </div>

                    <div>
                      <div style={{ color: '#fff', fontWeight: 800 }}>
                        {f.username}
                      </div>
                      <div
                        style={{
                          color: 'var(--text-muted, #b98a56)',
                          fontSize: 11,
                        }}
                      >
                        ELO {f.elo || '—'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6 }}>
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
                        }}
                      >
                        💬
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