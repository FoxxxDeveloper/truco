/**
 * FriendsList — amigos, solicitudes recibidas/enviadas, búsqueda con friendshipStatus.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { toastErrorOnce } from '../../utils/toastOnce';
import { useAuth } from '../../context/AuthContext';
import { isAdminUser } from '../../utils/adminPlayer';
import { getSocket } from '../../services/socket';
import { socialApi, profileApi } from '../../services/api';
import {
  X,
  MessageCircle,
  Trash2,
  Search,
  UserPlus,
  Circle,
  Gamepad2,
  Wifi,
  UserRound,
  Swords,
  Loader2,
} from 'lucide-react';
import BrandNavLockup from '../brand/BrandNavLockup';
import PublicProfileModal from '../profile/PublicProfileModal';
import TrucoAvatar from '../avatar/TrucoAvatar';

function FriendAvatar({ username, avatar, className = '' }) {
  return (
    <div className={`friend-avatar ${className}`.trim()}>
      <TrucoAvatar avatar={avatar} username={username} size={44} />
    </div>
  );
}

function requestDisplayName(row) {
  return row?.username || row?.to_username || (row?.to_user_id ? `Usuario #${row.to_user_id}` : 'Usuario');
}

function presenceLabel(status) {
  if (status === 'lobby') return 'En línea';
  if (status === 'in_game') return 'En partida';
  return 'Desconectado';
}

export default function FriendsList({ onClose, onStartChat, onChallengeFriend, unreadCounts = {} }) {
  const { user } = useAuth();
  const isAdmin = isAdminUser(user);

  const [friends, setFriends] = useState([]);
  const [requestsReceived, setRequestsReceived] = useState([]);
  const [requestsSent, setRequestsSent] = useState([]);
  const [tab, setTab] = useState('friends');
  const [reqSubTab, setReqSubTab] = useState('received');
  const [search, setSearch] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);
  const [presence, setPresence] = useState({});
  const presenceListenerRef = useRef(false);
  const [profileUserId, setProfileUserId] = useState(null);

  const reqTotal = requestsReceived.length + requestsSent.length;

  const load = useCallback(async () => {
    try {
      const [fRes, rRes] = await Promise.all([socialApi.getFriends(), socialApi.getFriendRequests()]);

      const loadedFriends = fRes.data.friends || [];
      setFriends(loadedFriends);

      const rec = rRes.data.received ?? rRes.data.requests ?? [];
      const sent = rRes.data.sent ?? [];
      setRequestsReceived(Array.isArray(rec) ? rec : []);
      setRequestsSent(Array.isArray(sent) ? sent : []);

      const socket = getSocket();
      if (socket?.connected && loadedFriends.length > 0) {
        socket.emit('presence:get', { userIds: loadedFriends.map((f) => f.id) });
      }
    } catch (err) {
      console.error(err);
      toastErrorOnce('Error al cargar amigos');
    }
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || presenceListenerRef.current) return;
    presenceListenerRef.current = true;

    const handlePresence = (data) => {
      setPresence((prev) => ({ ...prev, ...data }));
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
    if (!userId) {
      toast.error('Usuario inválido');
      return;
    }
    setLoadingAction(true);
    try {
      const res = await socialApi.sendFriendRequest(userId);
      toast.success('Solicitud enviada');
      const nextStatus = res.data?.friendshipStatus || 'request_sent';
      setSearchResult((prev) => (prev && prev.id === userId ? { ...prev, friendshipStatus: nextStatus } : prev));
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
      setSearchResult((prev) => (prev && prev.id === userId ? { ...prev, friendshipStatus: 'friends' } : prev));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al aceptar');
    } finally {
      setLoadingAction(false);
    }
  };

  const rejectOrCancel = async (userId) => {
    setLoadingAction(true);
    try {
      await socialApi.removeFriend(userId);
      toast.success('Listo');
      await load();
      setSearchResult((prev) => (prev && prev.id === userId ? { ...prev, friendshipStatus: 'none' } : prev));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
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

  const presenceBadge = (friendId) => {
    const p = presence[friendId]?.status;
    if (p === 'lobby')
      return (
        <span className="fx-badge friend-presence friend-presence--online friend-status" title={presenceLabel(p)}>
          <Wifi size={10} aria-hidden />
          En línea
        </span>
      );
    if (p === 'in_game')
      return (
        <span className="fx-badge friend-presence friend-presence--busy friend-status" title={presenceLabel(p)}>
          <Gamepad2 size={10} aria-hidden />
          En partida
        </span>
      );
    return (
      <span className="fx-badge friend-presence friend-presence--offline friend-status" title={presenceLabel(p)}>
        <Circle size={10} aria-hidden />
        Offline
      </span>
    );
  };

  const renderSearchActions = () => {
    if (!searchResult) return null;
    const st = searchResult.friendshipStatus;
    const sid = searchResult.id;
    if (sid === user?.id) {
      return <span className="friend-search-note">Sos vos</span>;
    }
    if (st === 'friends') {
      return (
        <div className="friend-search-actions">
          <span className="fx-badge friend-search-badge">Ya son amigos</span>
          <button type="button" className="friend-action-btn friend-action-btn--secondary" onClick={() => setProfileUserId(sid)} disabled={loadingAction}>
            <UserRound size={14} aria-hidden /> Perfil
          </button>
          {onStartChat && (
            <button type="button" className="friend-action-btn friend-action-btn--primary" onClick={() => onStartChat(searchResult)} disabled={loadingAction}>
              <MessageCircle size={14} aria-hidden /> Chat
            </button>
          )}
        </div>
      );
    }
    if (st === 'request_sent') {
      return (
        <div className="friend-search-actions">
          <button type="button" className="friend-action-btn friend-action-btn--muted" disabled>
            Solicitud enviada
          </button>
        </div>
      );
    }
    if (st === 'request_received') {
      return (
        <div className="friend-search-actions friend-search-actions--stack">
          <span className="fx-badge friend-search-badge">Solicitud recibida</span>
          <div className="friend-search-inline">
            <button type="button" className="friend-action-btn friend-action-btn--primary" onClick={() => acceptRequest(sid)} disabled={loadingAction}>
              Aceptar
            </button>
            <button type="button" className="friend-action-btn friend-action-btn--danger" onClick={() => rejectOrCancel(sid)} disabled={loadingAction}>
              Rechazar
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="friend-search-actions">
        <button
          type="button"
          className="friend-action-btn friend-action-btn--primary"
          onClick={() => sendRequest(sid)}
          disabled={loadingAction}
        >
          {loadingAction ? <Loader2 size={14} className="spin" aria-hidden /> : <UserPlus size={14} aria-hidden />}
          Enviar solicitud
        </button>
      </div>
    );
  };

  return (
    <motion.div
      className="social-friends-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="social-friends-panel fx-card"
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="friends-panel-title"
      >
        <div className="social-friends-head">
          <div className="social-friends-head-text">
            <BrandNavLockup className="social-friends-brand" size="sm" showSubtitle={false} />
            <h2 id="friends-panel-title" className="social-friends-title">
              Amigos
            </h2>
            <p className="social-friends-sub">Jugadores, mensajes y retos</p>
          </div>
          <button type="button" className="btn-close social-friends-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="social-friends-tabs" role="tablist">
          {[
            ['friends', `Amigos (${friends.length})`],
            ['requests', `Solicitudes (${reqTotal})`],
            ['add', 'Agregar'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`social-friends-tab${tab === id ? ' social-friends-tab--active' : ''}`.trim()}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="social-friends-body">
          {tab === 'friends' &&
            (friends.length === 0 ? (
              <div className="social-friends-empty fx-card">
                <UserRound className="social-friends-empty-icon" size={40} aria-hidden />
                <p>Aún no tenés amigos agregados.</p>
                <p className="social-friends-empty-hint">Buscá jugadores en la pestaña Agregar.</p>
              </div>
            ) : (
              <div className="social-friends-list-scroll">
                <ul className="social-friends-list social-friends-list--rows">
                  {friends.map((f) => (
                    <li key={f.id} className="friend-row">
                      <div className="friend-main friend-row__left">
                        <div className="friend-avatar-wrap">
                          <FriendAvatar username={f.username} avatar={f.avatar} className="friend-avatar--row" />
                          <span
                            className={`friend-presence-dot friend-presence-dot--${presence[f.id]?.status === 'lobby' ? 'on' : presence[f.id]?.status === 'in_game' ? 'busy' : 'off'}`}
                            title={presenceLabel(presence[f.id]?.status)}
                          />
                        </div>
                        <div className="friend-meta friend-row__info">
                          <div className="friend-row__title">
                            <span className="friend-row__username">{f.username}</span>
                            <span className="friend-row__elo">ELO {f.elo ?? '—'}</span>
                          </div>
                          <div className="friend-row__badges">{presenceBadge(f.id)}</div>
                        </div>
                      </div>
                      <div className="friend-actions friend-row__actions">
                        <button
                          type="button"
                          className="friend-action-btn friend-action-btn--secondary"
                          onClick={() => setProfileUserId(f.id)}
                          disabled={loadingAction}
                          title="Perfil"
                        >
                          <UserRound size={14} aria-hidden />
                          <span className="friend-action-label">Perfil</span>
                        </button>
                        {onStartChat && (
                          <button
                            type="button"
                            className="friend-action-btn friend-action-btn--primary"
                            onClick={() => onStartChat(f)}
                            disabled={loadingAction}
                            title="Chat"
                          >
                            <span className="friend-action-inner">
                              <MessageCircle size={14} aria-hidden />
                              <span className="friend-action-label">Chat</span>
                              {unreadCounts[f.id] > 0 && (
                                <span className="unread-badge unread-badge--gold">{unreadCounts[f.id] > 9 ? '9+' : unreadCounts[f.id]}</span>
                              )}
                            </span>
                          </button>
                        )}
                        {typeof onChallengeFriend === 'function' && !isAdmin && (
                          <button
                            type="button"
                            className="friend-action-btn friend-action-btn--outline-challenge"
                            onClick={() => onChallengeFriend(f)}
                            disabled={loadingAction}
                            title="Retar"
                          >
                            <Swords size={14} aria-hidden />
                            <span className="friend-action-label">Retar</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="friend-action-btn friend-action-btn--danger-outline"
                          onClick={() => removeFriend(f.id)}
                          disabled={loadingAction}
                          title="Quitar"
                        >
                          <Trash2 size={14} aria-hidden />
                          <span className="friend-action-label">Quitar</span>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

          {tab === 'requests' && (
            <div className="social-friends-requests-wrap">
              <div className="social-friends-subtabs" role="tablist">
                <button
                  type="button"
                  className={`social-friends-subtab${reqSubTab === 'received' ? ' social-friends-subtab--active' : ''}`.trim()}
                  onClick={() => setReqSubTab('received')}
                >
                  Recibidas ({requestsReceived.length})
                </button>
                <button
                  type="button"
                  className={`social-friends-subtab${reqSubTab === 'sent' ? ' social-friends-subtab--active' : ''}`.trim()}
                  onClick={() => setReqSubTab('sent')}
                >
                  Enviadas ({requestsSent.length})
                </button>
              </div>

              {reqSubTab === 'received' &&
                (requestsReceived.length === 0 ? (
                  <div className="social-friends-empty fx-card social-friends-empty--compact">
                    <p>No tenés solicitudes recibidas.</p>
                  </div>
                ) : (
                  <div className="social-friends-list-scroll">
                    <ul className="social-friends-list social-friends-list--rows">
                      {requestsReceived.map((r) => (
                        <li key={r.id} className="friend-row friend-row--request">
                          <div className="friend-main friend-row__left">
                            <FriendAvatar username={r.username} avatar={r.avatar} className="friend-avatar--row" />
                            <div className="friend-meta friend-row__info">
                              <div className="friend-row__title">
                                <span className="friend-row__username">{r.username}</span>
                              </div>
                              <span className="friend-row__request-hint">Quiere agregarte</span>
                            </div>
                          </div>
                          <div className="friend-actions friend-row__actions friend-row__actions--narrow">
                            <button
                              type="button"
                              className="friend-action-btn friend-action-btn--primary"
                              onClick={() => acceptRequest(r.id)}
                              disabled={loadingAction}
                            >
                              Aceptar
                            </button>
                            <button
                              type="button"
                              className="friend-action-btn friend-action-btn--danger"
                              onClick={() => rejectOrCancel(r.id)}
                              disabled={loadingAction}
                            >
                              Rechazar
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}

              {reqSubTab === 'sent' &&
                (requestsSent.length === 0 ? (
                  <div className="social-friends-empty fx-card social-friends-empty--compact">
                    <p>No enviaste solicitudes pendientes.</p>
                  </div>
                ) : (
                  <div className="social-friends-list-scroll">
                    <ul className="social-friends-list social-friends-list--rows">
                      {requestsSent.map((r) => (
                        <li key={`sent-${r.id}-${r.created_at}`} className="friend-row friend-row--request">
                          <div className="friend-main friend-row__left">
                            <FriendAvatar username={requestDisplayName(r)} avatar={r.avatar} className="friend-avatar--row" />
                            <div className="friend-meta friend-row__info">
                              <div className="friend-row__title">
                                <span className="friend-row__username">{requestDisplayName(r)}</span>
                              </div>
                              <span className="fx-badge friend-search-badge">Pendiente</span>
                            </div>
                          </div>
                          <div className="friend-actions friend-row__actions friend-row__actions--narrow">
                            <button
                              type="button"
                              className="friend-action-btn friend-action-btn--secondary"
                              onClick={() => rejectOrCancel(r.id)}
                              disabled={loadingAction}
                            >
                              Cancelar
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          )}

          {tab === 'add' && (
            <div className="social-friends-add">
              <div className="social-friends-search-row">
                <input
                  className="form-input social-friends-search-input"
                  placeholder="Nombre de usuario"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchUser()}
                  autoComplete="off"
                />
                <button type="button" className="btn btn-primary btn-sm social-friends-search-btn" onClick={searchUser} disabled={searching}>
                  <Search size={16} aria-hidden />
                  {searching ? '…' : 'Buscar'}
                </button>
              </div>

              {searchResult && (
                <div className="friend-row friend-row--add-result friend-search-result">
                  <div className="friend-main friend-row__left">
                    <FriendAvatar username={searchResult.username} avatar={searchResult.avatar} className="friend-avatar--row" />
                    <div className="friend-meta friend-row__info">
                      <div className="friend-row__title">
                        <span className="friend-row__username">{searchResult.username}</span>
                        <span className="friend-row__elo">ELO {searchResult.elo ?? '—'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="friend-search-actions-wrap">{renderSearchActions()}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {profileUserId && (
          <PublicProfileModal
            userId={profileUserId}
            onClose={() => setProfileUserId(null)}
            onStartChat={onStartChat}
            onChallengeFriend={onChallengeFriend}
            onFriendshipChange={load}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
