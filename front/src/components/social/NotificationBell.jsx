/**
 * NotificationBell — shows unread notification count + dropdown list.
 *
 * Listens to Socket.IO 'notification:new' events for real-time push.
 * Uses: GET /api/social/notifications
 *        PUT /api/social/notifications/read-all
 *        PUT /api/social/notifications/:id/read
 */
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { getSocket } from '../../services/socket';
import { socialApi } from '../../services/api';

import { BellIcon, GameIcon, CoinIcon, UsersIcon, SwordsIcon } from '../Icons';

const TYPE_LABEL = {
  game_result: 'Partida',
  deposit: 'Depósito',
  withdrawal: 'Retiro',
  friend_request: 'Amigos',
  challenge: 'Desafío',
};

const TYPE_ICON = {
  game_result: <GameIcon size={16} />,
  deposit: <CoinIcon size={16} />,
  withdrawal: <CoinIcon size={16} />,
  friend_request: <UsersIcon size={16} />,
  challenge: <SwordsIcon size={16} />,
};

export default function NotificationBell() {
  const { user }        = useAuth();
  const socket          = getSocket();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const ref             = useRef(null);

  const fetchNotifs = async () => {
    try {
      const res = await socialApi.getNotifications();
      setNotifications(res.data.notifications || []);
    } catch {}
  };

  useEffect(() => {
    if (!user?.id) return;
    fetchNotifs();
  }, [user?.id]);

  useEffect(() => {
    if (!socket) return;
    const handler = (notif) => {
      setNotifications(prev => [notif, ...prev]);
    };
    socket.on('notification:new', handler);
    return () => socket.off('notification:new', handler);
  }, [socket]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const unreadCount = notifications.filter(n => !n.read_at).length;

  const markAllRead = async () => {
    await socialApi.markAllRead().catch(() => {});
    setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
  };

  const markOneRead = async (id) => {
    await socialApi.markRead(id).catch(() => {});
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => { setOpen(o => !o); if (!open && unreadCount > 0) setTimeout(markAllRead, 2000); }}
        style={{
          position: 'relative', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center',
          color: 'var(--clr-cream, #fff4d8)',
        }}
      >
        <BellIcon size={18} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            background: '#ef4444', color: '#fff', borderRadius: '50%',
            width: 16, height: 16, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700,
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            style={{
              position: 'absolute', right: 0, top: 44, width: 320, maxHeight: 400, overflowY: 'auto',
              background: '#1e2a3a', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              zIndex: 200, border: '1px solid #374151',
            }}
          >
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #374151', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#fff', fontWeight: 700 }}>Notificaciones</span>
              {unreadCount > 0 && (
                <button onClick={markAllRead} style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 12 }}>
                  Marcar todo leído
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <p style={{ color: '#9ca3af', textAlign: 'center', padding: 16 }}>Sin notificaciones</p>
            ) : (
              notifications.slice(0, 20).map(n => (
                <div
                  key={n.id}
                  onClick={() => !n.read_at && markOneRead(n.id)}
                  style={{
                    padding: '12px 16px', cursor: 'pointer',
                    background: n.read_at ? 'transparent' : 'rgba(59,130,246,0.1)',
                    borderBottom: '1px solid #243447',
                  }}
                >
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 16, color: '#9ca3af', flexShrink: 0, paddingTop: 1 }}>
                      {TYPE_ICON[n.type] || <BellIcon size={16} />}
                    </span>
                    <div>
                      <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{n.title}</div>
                      <div style={{ color: '#9ca3af', fontSize: 12 }}>{n.body}</div>
                      <div style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>
                        {new Date(n.created_at).toLocaleString('es-AR')}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
