/**
 * ChatCenter — unified chat panel (General + Private threads).
 *
 * Socket listeners for general + private messages stay registered while this
 * component is mounted (Lobby keeps it mounted), so unread + history stay in
 * sync even when the panel is closed.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Send, ArrowLeft, UserRound, RefreshCw, Swords, Trophy } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getSocket } from '../../services/socket';
import { socialApi, challengeApi, tournamentChatApi } from '../../services/api';
import { appendMessageDeduped } from '../../utils/mergeMessagesById';
import TrucoAvatar from '../avatar/TrucoAvatar';
import BrandNavLockup from '../brand/BrandNavLockup';
import FriendChallengeModal from './FriendChallengeModal';
import FriendChallengeRespondModal from './FriendChallengeRespondModal';
import PublicProfileModal from '../profile/PublicProfileModal';

function AvatarBubble({ username, avatar, size = 30, className = '' }) {
  const displayName = username?.trim() || 'Jugador';
  return (
    <TrucoAvatar
      username={displayName}
      avatar={avatar}
      size={size}
      className={`chat-avatar chat-avatar-img chat-message-avatar ${className}`.trim()}
    />
  );
}

function resolveMessageAuthor(msg, mine, user, peer) {
  const fallback = 'Jugador';
  if (mine) {
    return {
      id: user?.id != null ? Number(user.id) : null,
      username: user?.username?.trim() || fallback,
      avatar: user?.avatar ?? null,
    };
  }
  const from = msg.from;
  if (from && (from.username != null || from.id != null)) {
    return {
      id: from.id != null ? Number(from.id) : null,
      username: from.username?.trim() || fallback,
      avatar: from.avatar ?? null,
    };
  }
  if (peer) {
    return {
      id: peer.id != null ? Number(peer.id) : null,
      username: peer.username?.trim() || fallback,
      avatar: peer.avatar ?? null,
    };
  }
  return { id: null, username: fallback, avatar: null };
}

function MsgBubble({ msg, mine, showName = false, user, peer = null, onAuthorClick = null }) {
  const text = msg.text || msg.content || '';
  const time = new Date(msg.createdAt || msg.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const author = resolveMessageAuthor(msg, mine, user, peer);
  const canOpenProfile =
    typeof onAuthorClick === 'function' &&
    author.id != null &&
    !mine &&
    Number(author.id) !== Number(user?.id);

  const authorLabel = showName && !mine && (
    canOpenProfile ? (
      <button
        type="button"
        className="chat-message-author chat-message-author--btn"
        onClick={() => onAuthorClick(author.id)}
      >
        {author.username}
      </button>
    ) : (
      <div className="chat-message-author">{author.username}</div>
    )
  );

  const avatarSide = !mine && (
    canOpenProfile ? (
      <button
        type="button"
        className="chat-message-avatar-wrap chat-message-avatar-btn"
        onClick={() => onAuthorClick(author.id)}
        aria-label={`Perfil de ${author.username}`}
      >
        <AvatarBubble username={author.username} avatar={author.avatar} size={30} />
      </button>
    ) : (
      <div className="chat-message-avatar-wrap" aria-hidden>
        <AvatarBubble username={author.username} avatar={author.avatar} size={30} />
      </div>
    )
  );

  return (
    <div className={`chat-message-row${mine ? ' chat-message-row--mine' : ' chat-message-row--other'}`.trim()}>
      {avatarSide}
      <div className={`chat-message-block${mine ? ' chat-message-block--mine' : ''}`.trim()}>
        {authorLabel}
        <div className={`chat-message-bubble${mine ? ' chat-message-bubble--mine' : ' chat-message-bubble--other'}`.trim()}>{text}</div>
        <div className={`chat-message-time${mine ? ' chat-message-time--mine' : ''}`.trim()}>{time}</div>
      </div>
      {mine && (
        <div className="chat-message-avatar-wrap chat-message-avatar-wrap--mine" aria-hidden>
          <AvatarBubble username={author.username} avatar={author.avatar} size={30} />
        </div>
      )}
    </div>
  );
}

function parseChGc(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function minsToExpire(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const m = Math.ceil((t - Date.now()) / 60000);
  if (m <= 0) return null;
  return m;
}

function ChatChallengeEventCard({ challenge, user, friend, onView }) {
  const uid = Number(user?.id);
  const isCreator = uid === Number(challenge.creator_id);
  const gc = parseChGc(challenge.game_config);
  const amt = parseFloat(challenge.amount) || 0;
  const comp = amt > 0;
  const st = (challenge.status || '').toLowerCase();
  const mins = st === 'open' ? minsToExpire(challenge.expires_at) : null;
  const creatorName = challenge.creator_username || friend?.username || 'Jugador';

  let title;
  if (isCreator) title = 'Reto enviado';
  else title = `${creatorName} te retó`;

  const statusLine =
    st === 'open'
      ? 'Pendiente'
      : st === 'accepted'
        ? 'Aceptado'
        : st === 'rejected'
          ? 'Rechazado'
          : st === 'expired'
            ? 'Expirado'
            : st === 'cancelled'
              ? 'Cancelado'
              : st === 'finished'
                ? 'Finalizado'
                : challenge.status;

  return (
    <div className="chat-challenge-card fx-card" role="group" aria-label="Reto">
      <div className="chat-challenge-card-top">
        <p className="chat-challenge-title">{title}</p>
        <span className={`fx-badge${comp ? ' fx-badge--gold' : ' fx-badge--muted'}`.trim()}>
          {comp ? 'Competitivo' : 'Clásico'}
        </span>
      </div>
      {!isCreator && <p className="chat-challenge-sub">{comp ? 'Partida competitiva' : 'Partida amistosa'}</p>}
      <ul className="chat-challenge-meta">
        <li>{gc.puntosMaximos ?? 30} puntos</li>
        <li>{gc.florHabilitada ? 'Con flor' : 'Sin flor'}</li>
        {comp && <li>{amt.toLocaleString('es-AR')} créditos</li>}
        {mins != null && <li>Vence en ~{mins} min</li>}
      </ul>
      <div className="chat-challenge-foot">
        <span className="chat-challenge-status">{statusLine}</span>
        <button type="button" className="btn btn-primary btn-sm chat-challenge-view-btn" onClick={() => onView(challenge)}>
          Ver reto
        </button>
      </div>
    </div>
  );
}

function GeneralTab({ messages, user, socket, onRefresh, onOpenUserProfile }) {
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
          <MsgBubble
            key={msg.id ?? `g-${i}`}
            msg={msg}
            mine={Number(msg.from?.id) === Number(user?.id)}
            showName
            user={user}
            onAuthorClick={onOpenUserProfile}
          />
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

function PrivateConvTab({
  friend,
  socket,
  user,
  onBack,
  onMarkRead,
  initialOpenChallenge,
  onChallengeIntentConsumed,
  onChallengesUpdated,
}) {
  const [messages, setMessages] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showChallenge, setShowChallenge] = useState(false);
  const [respondChallenge, setRespondChallenge] = useState(null);
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

  const loadChallenges = useCallback(() => {
    const fid = Number(friend.id);
    challengeApi
      .getFriendConversation(fid)
      .then((res) => {
        const list = Array.isArray(res.data?.challenges) ? res.data.challenges : [];
        setChallenges(list);
        onChallengesUpdated?.();
      })
      .catch(() => {});
  }, [friend.id, onChallengesUpdated]);

  useEffect(() => {
    loadThread();
    loadChallenges();
  }, [loadThread, loadChallenges]);

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
    const bumpChallenges = () => loadChallenges();
    socket.on('private:message:received', onRecv);
    socket.on('private:message:sent', onSent);
    socket.on('private:typing:received', onTyping);
    socket.on('friend_challenge:received', bumpChallenges);
    socket.on('friend_challenge:updated', bumpChallenges);
    return () => {
      socket.off('private:message:received', onRecv);
      socket.off('private:message:sent', onSent);
      socket.off('private:typing:received', onTyping);
      socket.off('friend_challenge:received', bumpChallenges);
      socket.off('friend_challenge:updated', bumpChallenges);
    };
  }, [socket, friend.id, onMarkRead, loadChallenges]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, challenges]);

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

  const sortedChallenges = [...challenges].sort((a, b) => {
    const pri = (x) => ((x.status || '').toLowerCase() === 'open' ? 0 : 1);
    const d = pri(a) - pri(b);
    if (d !== 0) return d;
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });

  const hasMessages = messages.length > 0;
  const hasChallenges = sortedChallenges.length > 0;

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
          {hasChallenges && (
            <div className="chat-challenge-stack">
              {sortedChallenges.map((ch) => (
                <ChatChallengeEventCard
                  key={ch.id}
                  challenge={ch}
                  user={user}
                  friend={friend}
                  onView={(c) => setRespondChallenge(c)}
                />
              ))}
            </div>
          )}
          {!hasMessages && !hasChallenges && (
            <div className="chat-empty-state">
              <UserRound className="chat-empty-state-icon" size={36} aria-hidden />
              <p className="chat-empty-state-title">Sin mensajes aún</p>
              <p className="chat-empty-state-text">Iniciá la conversación con {friend.username}.</p>
            </div>
          )}
          {messages.map((msg, i) => {
            const mine =
              Number(msg.from?.id) === Number(user?.id) || Number(msg.senderId) === Number(user?.id);
            return <MsgBubble key={msg.id ?? `p-${i}`} msg={msg} mine={mine} user={user} peer={friend} />;
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
          <FriendChallengeModal
            friend={friend}
            onClose={() => {
              setShowChallenge(false);
              loadChallenges();
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {respondChallenge && (
          <FriendChallengeRespondModal
            challenge={respondChallenge}
            peer={friend}
            user={user}
            onClose={() => setRespondChallenge(null)}
            onUpdated={() => {
              loadChallenges();
              onChallengesUpdated?.();
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function FriendsListTab({ onOpenConv, unreadCounts, pendingChallengeFrom }) {
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
        const chHint = pendingChallengeFrom?.[f.id] || 0;
        return (
          <button
            key={f.id}
            type="button"
            className="chat-friend-row"
            onClick={() => onOpenConv(f)}
          >
            <AvatarBubble username={f.username} avatar={f.avatar} size={32} />
            <span className="chat-friend-name">{f.username}</span>
            {chHint > 0 && <span className="unread-badge unread-badge--challenge" title="Reto pendiente">!</span>}
            {unread > 0 && <span className="unread-badge unread-badge--gold">{unread > 9 ? '9+' : unread}</span>}
          </button>
        );
      })}
    </div>
  );
}

export default function ChatCenter({
  unreadCounts = {},
  onClearUnread,
  openPrivateFriend,
  onConsumedOpenPrivate,
  onStartPrivateChat,
  onChallengeFriend,
}) {
  const { user } = useAuth();
  const socket = getSocket();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('general');
  const [activeConv, setActiveConv] = useState(null);

  const [generalMessages, setGeneralMessages] = useState([]);
  const [generalUnread, setGeneralUnread] = useState(0);
  const [pendingChallengeFriendId, setPendingChallengeFriendId] = useState(null);
  const [profileUserId, setProfileUserId] = useState(null);
  const [inboundChallengeByFriend, setInboundChallengeByFriend] = useState({});

  const [tournamentList, setTournamentList] = useState([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState(null);
  const [tournamentMessages, setTournamentMessages] = useState([]);
  const [tournamentLoading, setTournamentLoading] = useState(false);
  const [tournamentUnreadById, setTournamentUnreadById] = useState({});
  const [tournamentInput, setTournamentInput] = useState('');

  const refreshPendingChallenges = useCallback(() => {
    if (!user?.id) return;
    challengeApi
      .getFriendPending()
      .then((res) => {
        const map = {};
        for (const c of res.data?.challenges || []) {
          const from = Number(c.creator_id);
          if (from !== Number(user.id)) map[from] = (map[from] || 0) + 1;
        }
        setInboundChallengeByFriend(map);
      })
      .catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    refreshPendingChallenges();
  }, [refreshPendingChallenges, open, activeConv]);

  useEffect(() => {
    const s = getSocket();
    if (!s || !user?.id) return;
    const bump = () => refreshPendingChallenges();
    s.on('friend_challenge:received', bump);
    s.on('friend_challenge:updated', bump);
    return () => {
      s.off('friend_challenge:received', bump);
      s.off('friend_challenge:updated', bump);
    };
  }, [user?.id, refreshPendingChallenges]);

  const openRef = useRef(open);
  const tabRef = useRef(tab);
  const activeConvRef = useRef(activeConv);
  const tourneyIdRef = useRef(selectedTournamentId);
  openRef.current = open;
  tabRef.current = tab;
  activeConvRef.current = activeConv;
  tourneyIdRef.current = selectedTournamentId;

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
    const onGeneralErr = ({ error }) => {
      if (import.meta.env.DEV) console.warn('general:error', error);
    };

    s.on('general:message', onGeneral);
    s.on('general:error', onGeneralErr);
    return () => {
      s.off('general:message', onGeneral);
      s.off('general:error', onGeneralErr);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!open || !user?.id) return;
    tournamentChatApi
      .getAvailable()
      .then((res) => {
        const list = res.data?.tournaments || [];
        setTournamentList(list);
        setSelectedTournamentId((cur) => {
          if (cur && list.some((t) => Number(t.id) === Number(cur))) return cur;
          return list[0]?.id ?? null;
        });
      })
      .catch(() => {
        setTournamentList([]);
      });
  }, [open, user?.id]);

  useEffect(() => {
    if (tab === 'torneo' && tournamentList.length === 0) setTab('general');
  }, [tab, tournamentList.length]);

  useEffect(() => {
    if (open && tab === 'torneo' && selectedTournamentId) {
      setTournamentUnreadById((u) => {
        if (!u[selectedTournamentId]) return u;
        const next = { ...u };
        delete next[selectedTournamentId];
        return next;
      });
    }
  }, [open, tab, selectedTournamentId]);

  useEffect(() => {
    if (!socket || !user?.id) return;
    const onTm = (msg) => {
      const tid = Number(msg.tournamentId);
      if (!tid) return;
      const sel = tourneyIdRef.current;
      const viewing =
        openRef.current &&
        tabRef.current === 'torneo' &&
        Number(sel) === tid &&
        !activeConvRef.current;
      const mine = Number(msg.from?.id) === Number(user.id);
      if (viewing) {
        setTournamentMessages((prev) => appendMessageDeduped(prev, msg));
        return;
      }
      if (!mine) {
        setTournamentUnreadById((u) => ({ ...u, [tid]: (u[tid] || 0) + 1 }));
      }
    };
    socket.on('tournament:chat:message', onTm);
    return () => socket.off('tournament:chat:message', onTm);
  }, [socket, user?.id]);

  useEffect(() => {
    if (!open || tab !== 'torneo' || !selectedTournamentId || !socket) return undefined;
    const tid = Number(selectedTournamentId);
    socket.emit('tournament:chat:join', { tournamentId: tid });
    return () => {
      socket.emit('tournament:chat:leave', { tournamentId: tid });
    };
  }, [open, tab, selectedTournamentId, socket]);

  useEffect(() => {
    if (!open || tab !== 'torneo' || !selectedTournamentId) return undefined;
    let cancelled = false;
    setTournamentLoading(true);
    tournamentChatApi
      .getMessages(selectedTournamentId, { limit: 50 })
      .then((res) => {
        if (!cancelled) {
          setTournamentMessages(Array.isArray(res.data?.messages) ? res.data.messages : []);
        }
      })
      .catch(() => {
        if (!cancelled) setTournamentMessages([]);
      })
      .finally(() => {
        if (!cancelled) setTournamentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tab, selectedTournamentId]);

  const privateTotal = Object.values(unreadCounts).reduce((s, n) => s + n, 0);
  const tournamentUnreadTotal = Object.values(tournamentUnreadById).reduce(
    (s, n) => s + (Number(n) || 0),
    0
  );
  const fabTotal = privateTotal + generalUnread + tournamentUnreadTotal;

  const selectedTournamentName =
    tournamentList.find((t) => Number(t.id) === Number(selectedTournamentId))?.name || '';

  const sendTournamentMessage = useCallback(async () => {
    const t = tournamentInput.trim();
    if (!t || !selectedTournamentId) return;
    try {
      const res = await tournamentChatApi.sendMessage(selectedTournamentId, t);
      const m = res.data?.message;
      if (m) {
        setTournamentMessages((prev) =>
          appendMessageDeduped(prev, { ...m, tournamentId: Number(selectedTournamentId) })
        );
      }
      setTournamentInput('');
    } catch {
      /* ignore */
    }
  }, [tournamentInput, selectedTournamentId]);

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
              <div className="chat-header-main">
                <div className="chat-header-brand">
                  <BrandNavLockup size="sm" showSubtitle={false} className="chat-header-lockup" />
                </div>
                {!activeConv ? (
                  <div className="chat-header-tabs" role="tablist">
                    {[
                      ['general', 'General'],
                      ['privados', 'Privados'],
                      ...(tournamentList.length ? [['torneo', 'Torneo']] : []),
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
                        {id === 'torneo' && tournamentUnreadTotal > 0 && (
                          <span className="unread-badge unread-badge--tab">
                            {tournamentUnreadTotal > 9 ? '9+' : tournamentUnreadTotal}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="chat-header-active-label">Privado</div>
                )}
              </div>
              <button
                type="button"
                className="chat-close-btn"
                onClick={() => setOpen(false)}
                aria-label="Cerrar chat"
              >
                <X size={18} aria-hidden />
              </button>
            </header>

            <div className="chat-main">
              {!activeConv && (
                <div className="chat-main-title">
                  <h2 className="chat-main-heading">
                    {tab === 'general' && 'Chat general'}
                    {tab === 'privados' && 'Mensajes privados'}
                    {tab === 'torneo' && 'Chat de torneo'}
                  </h2>
                  {tab === 'general' && (
                    <p className="chat-main-sub">Mesa social de TrucoFX — visible para quienes están conectados.</p>
                  )}
                  {tab === 'privados' && <p className="chat-main-sub">Elegí un amigo para abrir la conversación.</p>}
                  {tab === 'torneo' && (
                    <p className="chat-main-sub">
                      Solo participantes del torneo. Disponible hasta 24 h después de finalizar.
                    </p>
                  )}
                  {tab === 'torneo' && tournamentList.length > 1 && (
                    <label className="chat-tournament-picker form-field">
                      <span className="form-label">Torneo</span>
                      <select
                        className="form-select form-control"
                        value={selectedTournamentId ?? ''}
                        onChange={(e) => setSelectedTournamentId(Number(e.target.value) || null)}
                      >
                        {tournamentList.map((tr) => (
                          <option key={tr.id} value={tr.id}>
                            {tr.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              )}

              <div className="chat-main-body">
                {tab === 'torneo' && !activeConv && (
                  <div className="chat-tab">
                    {tournamentList.length === 1 && (
                      <div className="chat-tournament-toolbar">
                        <span className="fx-badge fx-badge--muted">{selectedTournamentName}</span>
                      </div>
                    )}
                    <div className="chat-message-list">
                      {tournamentLoading && <p className="chat-empty-state-text">Cargando…</p>}
                      {!tournamentLoading && tournamentMessages.length === 0 && (
                        <div className="chat-empty-state">
                          <Trophy className="chat-empty-state-icon" size={36} aria-hidden />
                          <p className="chat-empty-state-title">Todavía no hay mensajes</p>
                          <p className="chat-empty-state-text">Saludá a los participantes del torneo.</p>
                        </div>
                      )}
                      {!tournamentLoading &&
                        tournamentMessages.map((msg, i) => (
                          <MsgBubble
                            key={msg.id ?? `t-${i}`}
                            msg={msg}
                            mine={Number(msg.from?.id) === Number(user?.id)}
                            showName
                            user={user}
                            onAuthorClick={(uid) => setProfileUserId(uid)}
                          />
                        ))}
                    </div>
                    <div className="chat-input-bar">
                      <input
                        className="chat-input"
                        value={tournamentInput}
                        onChange={(e) => setTournamentInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendTournamentMessage()}
                        placeholder="Mensaje al torneo…"
                        maxLength={500}
                        disabled={!selectedTournamentId}
                      />
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm chat-sync-btn"
                        onClick={() => {
                          if (!selectedTournamentId) return;
                          setTournamentLoading(true);
                          tournamentChatApi
                            .getMessages(selectedTournamentId, { limit: 50 })
                            .then((res) => {
                              setTournamentMessages(
                                Array.isArray(res.data?.messages) ? res.data.messages : []
                              );
                            })
                            .catch(() => {})
                            .finally(() => setTournamentLoading(false));
                        }}
                        title="Actualizar"
                        aria-label="Actualizar"
                      >
                        <RefreshCw size={16} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary chat-send-btn"
                        onClick={sendTournamentMessage}
                        aria-label="Enviar"
                        disabled={!selectedTournamentId}
                      >
                        <Send size={16} aria-hidden />
                      </button>
                    </div>
                  </div>
                )}
                {tab === 'general' && !activeConv && (
                  <GeneralTab
                    messages={generalMessages}
                    user={user}
                    socket={socket}
                    onRefresh={loadGeneralMessages}
                    onOpenUserProfile={(uid) => setProfileUserId(uid)}
                  />
                )}
                {tab === 'privados' && !activeConv && (
                  <FriendsListTab
                    onOpenConv={(f) => {
                      setActiveConv(f);
                      onClearUnread?.(f.id);
                    }}
                    unreadCounts={unreadCounts}
                    pendingChallengeFrom={inboundChallengeByFriend}
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
                    onChallengesUpdated={refreshPendingChallenges}
                  />
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {profileUserId != null && (
        <PublicProfileModal
          userId={profileUserId}
          onClose={() => setProfileUserId(null)}
          onStartChat={(peer) => {
            setProfileUserId(null);
            if (onStartPrivateChat) onStartPrivateChat(peer);
            else {
              setOpen(true);
              setTab('privados');
              setActiveConv(peer);
            }
          }}
          onChallengeFriend={
            onChallengeFriend
              ? (peer) => {
                  setProfileUserId(null);
                  onChallengeFriend(peer);
                }
              : undefined
          }
        />
      )}
    </>
  );
}
