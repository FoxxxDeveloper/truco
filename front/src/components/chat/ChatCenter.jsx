/**
 * ChatCenter — unified chat panel (General + Private threads).
 *
 * Usage:
 *   <ChatCenter
 *     unreadCounts={{ [userId]: number }}
 *     onClearUnread={(userId) => void}
 *   />
 *
 * The component manages its own open/close state.
 * It always listens to Socket.IO events, even when minimised.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, ChevronDown, ChevronUp, Send, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getSocket } from '../../services/socket';
import { socialApi } from '../../services/api';

// ── Avatar bubble ─────────────────────────────────────────────────────────────
function AvatarBubble({ username, avatar, size = 28 }) {
  const [err, setErr] = useState(false);
  const initials = (username || '?').slice(0, 2).toUpperCase();
  const hue = [...(username || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  if (avatar && !err) {
    return (
      <img
        src={avatar}
        alt={username}
        onError={() => setErr(true)}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `hsl(${hue},48%,32%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 800, color: '#fff',
    }}>
      {initials}
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MsgBubble({ msg, mine, showName = false }) {
  const text = msg.text || msg.content || '';
  const time = new Date(msg.createdAt || msg.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexDirection: mine ? 'row-reverse' : 'row' }}>
      {!mine && (
        <AvatarBubble username={msg.from?.username} avatar={msg.from?.avatar} size={24} />
      )}
      <div style={{ maxWidth: '78%' }}>
        {showName && !mine && (
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold)', marginBottom: 2 }}>
            {msg.from?.username}
          </div>
        )}
        <div style={{
          background: mine
            ? 'linear-gradient(135deg, var(--gold-3), var(--gold-2))'
            : 'rgba(255,255,255,0.07)',
          color: mine ? '#2a1000' : 'var(--text-soft)',
          padding: '6px 10px',
          borderRadius: mine ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
          fontSize: 12.5,
          lineHeight: 1.45,
          wordBreak: 'break-word',
        }}>
          {text}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, textAlign: mine ? 'right' : 'left' }}>
          {time}
        </div>
      </div>
    </div>
  );
}

// ── General chat tab ──────────────────────────────────────────────────────────
function GeneralTab({ socket, user }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const bottomRef               = useRef(null);
  const inputRef                = useRef(null);
  const [loaded, setLoaded]     = useState(false);

  useEffect(() => {
    if (loaded) return;
    socialApi.getGeneralMessages(60)
      .then(res => { if (res.data?.messages) setMessages(res.data.messages); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [loaded]);

  useEffect(() => {
    if (!socket) return;
    const onMsg = (msg) => setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
    const onErr = ({ error }) => console.warn('general:error', error);
    socket.on('general:message', onMsg);
    socket.on('general:error', onErr);
    return () => { socket.off('general:message', onMsg); socket.off('general:error', onErr); };
  }, [socket]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = useCallback(() => {
    const t = input.trim();
    if (!t || !socket) return;
    socket.emit('general:message', { text: t });
    setInput('');
    inputRef.current?.focus();
  }, [input, socket]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {messages.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>
            Sé el primero en escribir…
          </p>
        )}
        {messages.map((msg, i) => (
          <MsgBubble key={msg.id || i} msg={msg} mine={msg.from?.id === user?.id} showName />
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: '7px 8px', borderTop: '1px solid rgba(246,196,83,0.15)', display: 'flex', gap: 6, flexShrink: 0 }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Escribí…"
          maxLength={500}
          style={{
            flex: 1, padding: '7px 11px', borderRadius: 999,
            border: '1px solid rgba(246,196,83,0.2)',
            background: 'rgba(0,0,0,0.22)', color: 'var(--text)',
            fontSize: 12.5, outline: 'none',
          }}
        />
        <button
          onClick={send}
          style={{
            background: 'linear-gradient(135deg, var(--gold-2), var(--gold-3))',
            border: 'none', borderRadius: '50%', width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#2a1000', cursor: 'pointer', flexShrink: 0,
          }}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Private conversation tab ──────────────────────────────────────────────────
function PrivateConvTab({ friend, socket, user, onBack, onMarkRead }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef               = useRef(null);
  const inputRef                = useRef(null);
  const typingTimer             = useRef(null);

  useEffect(() => {
    socialApi.getMessages(friend.id)
      .then(res => { if (res.data?.messages) setMessages(res.data.messages); onMarkRead?.(friend.id); })
      .catch(() => {});
  }, [friend.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!socket) return;
    const onRecv = (msg) => {
      if (msg.from?.id === friend.id || msg.senderId === friend.id) {
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        socialApi.markMessagesRead(friend.id).catch(() => {});
        onMarkRead?.(friend.id);
      }
    };
    const onSent = (msg) => setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
    const onTyping = ({ fromUserId, isTyping: t }) => { if (fromUserId === friend.id) setIsTyping(t); };
    socket.on('private:message:received', onRecv);
    socket.on('private:message:sent', onSent);
    socket.on('private:typing:received', onTyping);
    return () => {
      socket.off('private:message:received', onRecv);
      socket.off('private:message:sent', onSent);
      socket.off('private:typing:received', onTyping);
    };
  }, [socket, friend.id, onMarkRead]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = useCallback(() => {
    const t = input.trim();
    if (!t || !socket) return;
    socket.emit('private:message', { toUserId: friend.id, text: t });
    setInput('');
    inputRef.current?.focus();
  }, [input, socket, friend.id]);

  const handleInput = (val) => {
    setInput(val);
    socket?.emit('private:typing', { toUserId: friend.id, isTyping: true });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket?.emit('private:typing', { toUserId: friend.id, isTyping: false });
    }, 1500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Sub-header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 10px', borderBottom: '1px solid rgba(246,196,83,0.15)',
        flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2 }}
        >
          <ArrowLeft size={15} />
        </button>
        <AvatarBubble username={friend.username} avatar={friend.avatar} size={24} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>{friend.username}</div>
          {isTyping && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>escribiendo…</div>}
        </div>
      </div>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {messages.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>
            Sin mensajes aún. ¡Empezá la conversación!
          </p>
        )}
        {messages.map((msg, i) => {
          const mine = msg.from?.id === user?.id || msg.senderId === user?.id;
          return <MsgBubble key={msg.id || i} msg={msg} mine={mine} />;
        })}
        <div ref={bottomRef} />
      </div>
      {/* Input */}
      <div style={{ padding: '7px 8px', borderTop: '1px solid rgba(246,196,83,0.15)', display: 'flex', gap: 6, flexShrink: 0 }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => handleInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder={`Mensaje a ${friend.username}…`}
          maxLength={500}
          style={{
            flex: 1, padding: '7px 11px', borderRadius: 999,
            border: '1px solid rgba(246,196,83,0.2)',
            background: 'rgba(0,0,0,0.22)', color: 'var(--text)',
            fontSize: 12.5, outline: 'none',
          }}
        />
        <button
          onClick={send}
          style={{
            background: 'linear-gradient(135deg, var(--gold-2), var(--gold-3))',
            border: 'none', borderRadius: '50%', width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#2a1000', cursor: 'pointer', flexShrink: 0,
          }}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Friends list tab ──────────────────────────────────────────────────────────
function FriendsListTab({ onOpenConv, unreadCounts }) {
  const [friends, setFriends] = useState([]);

  useEffect(() => {
    socialApi.getFriends()
      .then(res => setFriends(res.data.friends || []))
      .catch(() => {});
  }, []);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
      {friends.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>
          Sin amigos aún.
        </p>
      )}
      {friends.map(f => {
        const unread = unreadCounts[f.id] || 0;
        return (
          <button
            key={f.id}
            onClick={() => onOpenConv(f)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 9,
              padding: '8px 12px', background: 'none', border: 'none',
              cursor: 'pointer', textAlign: 'left',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(246,196,83,0.07)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <AvatarBubble username={f.username} avatar={f.avatar} size={32} />
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-soft)' }}>
              {f.username}
            </span>
            {unread > 0 && (
              <span style={{
                background: 'var(--gold)', color: '#2a1000',
                borderRadius: 999, fontSize: 10, fontWeight: 800,
                padding: '2px 6px', minWidth: 18, textAlign: 'center',
              }}>
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Main ChatCenter ───────────────────────────────────────────────────────────
export default function ChatCenter({ unreadCounts = {}, onClearUnread }) {
  const { user }      = useAuth();
  const socket        = getSocket();
  const [open, setOpen]     = useState(false);
  const [tab, setTab]       = useState('general'); // 'general' | 'privados'
  const [activeConv, setActiveConv] = useState(null); // friend object or null

  // Total unread badge on the toggle button
  const totalUnread = Object.values(unreadCounts).reduce((s, n) => s + n, 0);

  const openConv = useCallback((friend) => {
    setActiveConv(friend);
    setTab('privados');
    setOpen(true);
  }, []);

  const handleMarkRead = useCallback((userId) => {
    onClearUnread?.(userId);
  }, [onClearUnread]);

  return (
    <>
      {/* Toggle button */}
      <button
        className="chat-center-toggle"
        onClick={() => setOpen(o => !o)}
        title="Chat"
        style={{
          position: 'fixed', bottom: 20, right: 20,
          width: 48, height: 48, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--gold-2), var(--gold-3))',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          zIndex: 139,
          color: '#2a1000',
        }}
      >
        <MessageSquare size={22} />
        {totalUnread > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            background: '#ef4444', color: '#fff',
            borderRadius: 999, fontSize: 10, fontWeight: 800,
            padding: '2px 5px', minWidth: 18, textAlign: 'center',
            lineHeight: 1.4,
          }}>
            {totalUnread > 9 ? '9+' : totalUnread}
          </span>
        )}
      </button>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="chat-panel"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.18 }}
            style={{
              position: 'fixed', bottom: 76, right: 20,
              width: 320, height: 460,
              background: 'linear-gradient(180deg, rgba(42,19,6,0.98), rgba(20,8,2,0.99))',
              border: '1px solid rgba(246,196,83,0.28)',
              borderRadius: 18,
              boxShadow: '0 12px 40px rgba(0,0,0,0.75)',
              zIndex: 140,
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '10px 12px', background: 'rgba(0,0,0,0.25)',
              borderBottom: '1px solid rgba(246,196,83,0.18)',
              display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
            }}>
              {/* Tabs */}
              {!activeConv && (
                <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                  {[['general', 'General'], ['privados', 'Privados']].map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setTab(id)}
                      style={{
                        flex: 1, padding: '5px 8px', borderRadius: 8, border: 'none',
                        cursor: 'pointer', fontSize: 12, fontWeight: 700,
                        background: tab === id ? 'rgba(246,196,83,0.2)' : 'transparent',
                        color: tab === id ? 'var(--gold)' : 'var(--text-muted)',
                        position: 'relative',
                      }}
                    >
                      {label}
                      {id === 'privados' && totalUnread > 0 && (
                        <span style={{
                          position: 'absolute', top: 2, right: 2,
                          background: '#ef4444', color: '#fff',
                          borderRadius: 999, fontSize: 9, fontWeight: 800,
                          padding: '1px 4px',
                        }}>
                          {totalUnread > 9 ? '9+' : totalUnread}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {activeConv && (
                <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>
                  {activeConv.username}
                </div>
              )}
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            {tab === 'general' && !activeConv && (
              <GeneralTab socket={socket} user={user} />
            )}
            {tab === 'privados' && !activeConv && (
              <FriendsListTab
                onOpenConv={(f) => { setActiveConv(f); onClearUnread?.(f.id); }}
                unreadCounts={unreadCounts}
              />
            )}
            {activeConv && (
              <PrivateConvTab
                friend={activeConv}
                socket={socket}
                user={user}
                onBack={() => setActiveConv(null)}
                onMarkRead={handleMarkRead}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
