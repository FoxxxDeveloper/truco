/**
 * NotificationBell — unread count + dropdown; aceptar solicitudes de amistad.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { getSocket } from '../../services/socket';
import { socialApi } from '../../services/api';
import { BellIcon, GameIcon, CoinIcon, UsersIcon, SwordsIcon } from '../Icons';

const TYPE_LABEL = {
  game_result: 'Partida',
  deposit: 'Depósito',
  withdrawal: 'Retiro',
  friend_request: 'Amigos',
  friend_accepted: 'Amigos',
  challenge: 'Desafío',
};

const TYPE_ICON = {
  game_result: <GameIcon size={16} />,
  deposit: <CoinIcon size={16} />,
  withdrawal: <CoinIcon size={16} />,
  friend_request: <UsersIcon size={16} />,
  friend_accepted: <UsersIcon size={16} />,
  challenge: <SwordsIcon size={16} />,
};

function parseMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export default function NotificationBell() {
  const { user } = useAuth();
  const socket = getSocket();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [actionId, setActionId] = useState(null);
  const ref = useRef(null);

  const fetchNotifs = useCallback(async () => {
    try {
      const res = await socialApi.getNotifications();
      setNotifications(res.data.notifications || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    fetchNotifs();
  }, [user?.id, fetchNotifs]);

  useEffect(() => {
    if (!socket) return;
    const handler = (notif) => {
      setNotifications((prev) => [notif, ...prev]);
    };
    socket.on('notification:new', handler);
    return () => socket.off('notification:new', handler);
  }, [socket]);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const markAllRead = async () => {
    await socialApi.markAllRead().catch(() => {});
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })),
    );
  };

  const markOneRead = async (id) => {
    await socialApi.markRead(id).catch(() => {});
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)),
    );
  };

  const acceptFriendFromNotif = async (notif) => {
    const meta = parseMetadata(notif.metadata);
    const fromId = meta.fromId ?? meta.userId;
    if (!fromId) {
      toast.error('Solicitud inválida');
      return;
    }
    setActionId(notif.id);
    try {
      await socialApi.acceptFriend(fromId);
      toast.success('¡Amistad aceptada!');
      await markOneRead(notif.id);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notif.id
            ? { ...n, read_at: new Date().toISOString(), type: 'friend_accepted', title: 'Solicitud aceptada' }
            : n,
        ),
      );
    } catch (err) {
      const msg = err.response?.data?.error || 'No se pudo aceptar';
      if (/ya son amigos|already/i.test(msg)) {
        await markOneRead(notif.id);
        toast.success('Ya son amigos');
      } else {
        toast.error(msg);
      }
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="notif-bell-wrap" ref={ref}>
      <button
        type="button"
        className="notif-bell-btn"
        onClick={() => {
          setOpen((o) => !o);
          if (!open && unreadCount > 0) setTimeout(markAllRead, 2000);
        }}
        aria-expanded={open}
        aria-label="Notificaciones"
      >
        <BellIcon size={18} />
        {unreadCount > 0 && (
          <span className="notif-bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="notif-dropdown"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            role="dialog"
            aria-label="Lista de notificaciones"
          >
            <div className="notif-dropdown-head">
              <span className="notif-dropdown-title">Notificaciones</span>
              {unreadCount > 0 && (
                <button type="button" className="notif-mark-all" onClick={markAllRead}>
                  Marcar todo leído
                </button>
              )}
            </div>

            <div className="notif-dropdown-list">
              {notifications.length === 0 ? (
                <p className="notif-empty">Sin notificaciones</p>
              ) : (
                notifications.slice(0, 20).map((n) => {
                  const meta = parseMetadata(n.metadata);
                  const isFriendReq = n.type === 'friend_request' && !n.read_at;
                  return (
                    <div
                      key={n.id}
                      className={`notif-item${n.read_at ? '' : ' notif-item--unread'}`}
                      onClick={() => !n.read_at && markOneRead(n.id)}
                      onKeyDown={() => {}}
                      role="button"
                      tabIndex={0}
                    >
                      <span className="notif-item-icon">{TYPE_ICON[n.type] || <BellIcon size={16} />}</span>
                      <div className="notif-item-body">
                        <div className="notif-item-title">{n.title}</div>
                        {n.body && <div className="notif-item-text">{n.body}</div>}
                        <div className="notif-item-time">
                          {new Date(n.created_at).toLocaleString('es-AR')}
                        </div>
                        {isFriendReq && (
                          <div className="notif-item-actions">
                            <button
                              type="button"
                              className="friend-action-btn friend-action-btn--primary notif-action-btn"
                              disabled={actionId === n.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                acceptFriendFromNotif(n);
                              }}
                            >
                              Aceptar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
