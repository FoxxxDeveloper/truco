/**
 * ChatCenter — unified chat panel (General + Private threads).
 *
 * Socket listeners for general + private messages stay registered while this
 * component is mounted (Lobby keeps it mounted), so unread + history stay in
 * sync even when the panel is closed.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Send, ArrowLeft, UserRound, RefreshCw, Swords } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getSocket } from '../../services/socket';
import { socialApi } from '../../services/api';
import TrucoAvatar from '../avatar/TrucoAvatar';

function AvatarBubble({ username, avatar, size = 28, className = '' }) {
  return (
    <TrucoAvatar
      username={username}
      avatar={avatar}
      size={size}
      className={`chat-avatar chat-avatar-img ${className}`.trim()}
    />
  );
}

function MsgBubble({ msg, mine, showName = false }) {
  const text = msg.text || msg.content || '';
  const time = new Date(msg.createdAt || msg.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className={`chat-message-row${mine ? ' chat-message-row--mine' : ''}`.trim()}>
      {!mine && <AvatarBubble username={msg.from?.username} avatar={msg.from?.avatar} size={24} />}
      <div className={`chat-message-block${mine ? ' chat-message-block--mine' : ''}`.trim()}>
        {showName && !mine && <div className="chat-message-author">{msg.from?.username}</div>}
        <div className={`chat-message-bubble${mine ? ' chat-message-bubble--mine' : ' chat-message-bubble--other'}`.trim()}>{text}</div>
        <div className={`chat-message-time${mine ? ' chat-message-time--mine' : ''}`.trim()}>{time}</div>
      </div>
    </div>
  );
}

function GeneralTab({ messages, user, socket, onRefresh }) {
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(() => {
    const t = input.trim();
    if (!t || !socket) return;
    socket.emit('general:message', { text: t });
    setInput('');
    inputRef.current?.focus();
  }, [input, socket]);

  return (
    <div className="chat-tab">
      <div className="chat-message-list">
        {messages.length === 0 && (
          <div className="chat-empty-state">
            <MessageSquare className="chat-empty-state-icon" size={36} aria-hidden />
            <p className="chat-empty-state-title">Todavía no hay mensajes</p>
            <p className="chat-empty-state-text">Saludá a la mesa: el chat general es para toda la sala.</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <MsgBubble key={msg.id ?? `g-${i}`} msg={msg} mine={Number(msg.from?.id) === Number(user?.id)} showName />
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input-bar">
        <input
          ref={inputRef}
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Escribí un mensaje…"
          maxLength={500}
        />
        <button type="button" className="btn btn-ghost btn-sm chat-sync-btn" onClick={onRefresh} title="Actualizar historial" aria-label="Actualizar historial">
          <RefreshCw size={16} aria-hidden />
        </button>
        <button type="button" className="btn btn-primary chat-send-btn" onClick={send} aria-label="Enviar">
          <Send size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function PrivateConvTab({ friend, socket, user, onBack, onMarkRead, initialOpenChallenge, onChallengeIntentConsumed }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showChallenge, setShowChallenge] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimer = useRef(null);

  useEffect(() => {
    if (!initialOpenChallenge) return;
    setShowChallenge(true);
    onChallengeIntentConsumed?.();
  }, [friend.id, initialOpenChallenge, onChallengeIntentConsumed]);

  const loadThread = useCallback(() => {
    const fid = Number(friend.id);
    socialApi
      .getMessages(fid)
      .then((res) => {
        const body = res?.data;
        const list = Array.isArray(body?.messages) ? body.messages : [];
        setMessages(list);
        onMarkRead?.(friend.id);
      })
      .catch(() => {});
  }, [friend.id, onMarkRead]);

  useEffect(() => {
    loadThread();
  }, [loadThread]);

  useEffect(() => {
    if (!socket) return;
    const onRecv = (msg) => {
      const fromId = msg.from?.id ?? msg.senderId;
      if (fromId !== friend.id) return;
      setMessages((prev) => appendMessageDeduped(prev, msg));
      socialApi.markMessagesRead(friend.id).catch(() => {});
      onMarkRead?.(friend.id);
    };
    const onSent = (msg) => {
      const toId = msg.to?.id;
      if (toId == null || Number(toId) !== Number(friend.id)) return;
      setMessages((prev) => appendMessageDeduped(prev, msg));
    };
    const onTyping = ({ fromUserId, isTyping: t }) => {
      if (fromUserId === friend.id) setIsTyping(t);
    };
    socket.on('private:message:received', onRecv);
    socket.on('private:message:sent', onSent);
    socket.on('private:typing:received', onTyping);
    return () => {
      socket.off('private:message:received', onRecv);
      socket.off('private:message:sent', onSent);
      socket.off('private:typing:received', onTyping);
    };
  }, [socket, friend.id, onMarkRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
    <>
      <div className="chat-tab">
        <div className="chat-subheader">
          <button type="button" className="btn btn-ghost btn-sm chat-back-btn" onClick={onBack} aria-label="Volver a la lista">
            <ArrowLeft size={18} aria-hidden />
          </button>
          <AvatarBubble username={friend.username} avatar={friend.avatar} size={28} />
          <div className="chat-subheader-text">
            <span className="chat-subheader-name">{friend.username}</span>
            {isTyping && <span className="chat-subheader-typing">escribiendo…</span>}
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm chat-challenge-btn"
            onClick={() => setShowChallenge(true)}
            title="Retar a partida"
          >
            <Swords size={16} aria-hidden />
            <span className="chat-challenge-btn-label">Retar</span>
          </button>
        </div>
        <div className="chat-message-list chat-message-list--private">
        {messages.length === 0 && (
          <div className="chat-empty-state">
            <UserRound className="chat-empty-state-icon" size={36} aria-hidden />
            <p className="chat-empty-state-title">Sin mensajes aún</p>
            <p className="chat-empty-state-text">Iniciá la conversación con {friend.username}.</p>
          </div>
        )}
        {messages.map((msg, i) => {
          const mine =
            Number(msg.from?.id) === Number(user?.id) || Number(msg.senderId) === Number(user?.id);
          return <MsgBubble key={msg.id ?? `p-${i}`} msg={msg} mine={mine} />;
        })}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input-bar">
        <input
          ref={inputRef}
          className="chat-input"
          value={input}
          onChange={(e) => handleInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder={`Mensaje a ${friend.username}…`}
          maxLength={500}
        />
        <button type="button" className="btn btn-primary chat-send-btn" onClick={send} aria-label="Enviar">
          <Send size={16} aria-hidden />
        </button>
      </div>
      </div>
      <AnimatePresence>
        {showChallenge && (
          <FriendChallengeModal friend={friend} onClose={() => setShowChallenge(false)} />
        )}
      </AnimatePresence>
    </>
  );
}

function FriendsListTab({ onOpenConv, unreadCounts }) {
  const [friends, setFriends] = useState([]);

  useEffect(() => {
    socialApi
      .getFriends()
      .then((res) => setFriends(res.data.friends || []))
      .catch(() => {});
  }, []);

  return (
    <div className="chat-sidebar-list">
      {friends.length === 0 && (
        <div className="chat-empty-state chat-empty-state--compact">
          <p className="chat-empty-state-text">No tenés amigos en la lista. Agregá jugadores desde el lobby.</p>
        </div>
      )}
      {friends.map((f) => {
        const unread = unreadCounts[f.id] || 0;
        return (
          <button
            key={f.id}
            type="button"
            className="chat-friend-row"
            onClick={() => onOpenConv(f)}
          >
            <AvatarBubble username={f.username} avatar={f.avatar} size={32} />
            <span className="chat-friend-name">{f.username}</span>
            {unread > 0 && <span className="unread-badge unread-badge--gold">{unread > 9 ? '9+' : unread}</span>}
          </button>
        );
      })}
    </div>
  );
}

export default function ChatCenter({ unreadCounts = {}, onClearUnread, openPrivateFriend, onConsumedOpenPrivate }) {
  const { user } = useAuth();
  const socket = getSocket();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('general');
  const [activeConv, setActiveConv] = useState(null);

  const [generalMessages, setGeneralMessages] = useState([]);
  const [generalUnread, setGeneralUnread] = useState(0);
  const [pendingChallengeFriendId, setPendingChallengeFriendId] = useState(null);

  const openRef = useRef(open);
  const tabRef = useRef(tab);
  const activeConvRef = useRef(activeConv);
  openRef.current = open;
  tabRef.current = tab;
  activeConvRef.current = activeConv;

  const loadGeneralMessages = useCallback(async () => {
    try {
      const res = await socialApi.getGeneralMessages(60);
      const body = res?.data;
      const list = Array.isArray(body?.messages) ? body.messages : [];
      setGeneralMessages(list);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!openPrivateFriend?.id) return;
    const wantChallenge = Boolean(openPrivateFriend.openChallengeModal);
    const friend = { ...openPrivateFriend };
    delete friend.openChallengeModal;
    setOpen(true);
    setTab('privados');
    setActiveConv(friend);
    setPendingChallengeFriendId(wantChallenge ? Number(friend.id) : null);
    onClearUnread?.(friend.id);
    onConsumedOpenPrivate?.();
  }, [openPrivateFriend, onClearUnread, onConsumedOpenPrivate]);

  useEffect(() => {
    loadGeneralMessages();
  }, [loadGeneralMessages]);

  useEffect(() => {
    if (!open) return;
    loadGeneralMessages();
  }, [open, loadGeneralMessages]);

  useEffect(() => {
    if (open && tab === 'general' && !activeConv) {
      setGeneralUnread(0);
    }
  }, [open, tab, activeConv]);

  useEffect(() => {
    const s = getSocket();
    if (!s || !user?.id) return;

    const onGeneral = (msg) => {
      setGeneralMessages((prev) => appendMessageDeduped(prev, msg));
      const viewing =
        openRef.current && tabRef.current === 'general' && !activeConvRef.current;
      const mine = Number(msg.from?.id) === Number(user.id);
      if (!mine && !viewing) {
        setGeneralUnread((n) => n + 1);
      }
    };
    const onGeneralErr = ({ error }) => console.warn('general:error', error);

    s.on('general:message', onGeneral);
    s.on('general:error', onGeneralErr);
    return () => {
      s.off('general:message', onGeneral);
      s.off('general:error', onGeneralErr);
    };
  }, [user?.id]);

  const privateTotal = Object.values(unreadCounts).reduce((s, n) => s + n, 0);
  const fabTotal = privateTotal + generalUnread;

  const handleMarkRead = useCallback(
    (userId) => {
      onClearUnread?.(userId);
    },
    [onClearUnread]
  );

  return (
    <>
      <button
        type="button"
        className="chat-fab chat-center-toggle"
        onClick={() => setOpen((o) => !o)}
        title="Chat"
        aria-expanded={open}
      >
        <MessageSquare size={22} aria-hidden />
        {fabTotal > 0 && <span className="unread-badge unread-badge--fab">{fabTotal > 99 ? '99+' : fabTotal}</span>}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="chat-panel"
            className="chat-shell chat-panel"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.18 }}
          >
            <header className="chat-header">
              <div className="chat-header-brand">
                <BrandNavLockup size="sm" showSubtitle={false} className="chat-header-lockup" />
              </div>
              {!activeConv ? (
                <div className="chat-header-tabs" role="tablist">
                  {[
                    ['general', 'General'],
                    ['privados', 'Privados'],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={tab === id}
                      className={`chat-header-tab${tab === id ? ' chat-header-tab--active' : ''}`.trim()}
                      onClick={() => setTab(id)}
                    >
                      {label}
                      {id === 'general' && generalUnread > 0 && (
                        <span className="unread-badge unread-badge--tab">{generalUnread > 9 ? '9+' : generalUnread}</span>
                      )}
                      {id === 'privados' && privateTotal > 0 && (
                        <span className="unread-badge unread-badge--tab">{privateTotal > 9 ? '9+' : privateTotal}</span>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="chat-header-active-label">Privado</div>
              )}
              <button type="button" className="btn btn-ghost btn-sm chat-header-close" onClick={() => setOpen(false)} aria-label="Cerrar chat">
                <X size={18} aria-hidden />
              </button>
            </header>

            <div className="chat-main">
              {!activeConv && (
                <div className="chat-main-title">
                  <h2 className="chat-main-heading">{tab === 'general' ? 'Chat general' : 'Mensajes privados'}</h2>
                  {tab === 'general' && (
                    <p className="chat-main-sub">Mesa social de TrucoFX — visible para quienes están en el lobby.</p>
                  )}
                  {tab === 'privados' && <p className="chat-main-sub">Elegí un amigo para abrir la conversación.</p>}
                </div>
              )}

              <div className="chat-main-body">
                {tab === 'general' && !activeConv && (
                  <GeneralTab
                    messages={generalMessages}
                    user={user}
                    socket={socket}
                    onRefresh={loadGeneralMessages}
                  />
                )}
                {tab === 'privados' && !activeConv && (
                  <FriendsListTab
                    onOpenConv={(f) => {
                      setActiveConv(f);
                      onClearUnread?.(f.id);
                    }}
                    unreadCounts={unreadCounts}
                  />
                )}
                {activeConv && (
                  <PrivateConvTab
                    key={activeConv.id}
                    friend={activeConv}
                    socket={socket}
                    user={user}
                    onBack={() => setActiveConv(null)}
                    onMarkRead={handleMarkRead}
                    initialOpenChallenge={
                      pendingChallengeFriendId != null && pendingChallengeFriendId === Number(activeConv.id)
                    }
                    onChallengeIntentConsumed={() => setPendingChallengeFriendId(null)}
                  />
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
