/**
 * PrivateChat — real-time DM with a friend over Socket.IO.
 *
 * Socket events:
 *   send:   private:message  { toUserId, text }
 *   recv:   private:message:received { from: { id, username }, text, createdAt, ... }
 *           private:message:sent     { ... }
 *           private:typing:received  { fromUserId, isTyping }
 *
 * REST:
 *   GET  /api/social/messages/:userId         — load history
 *   POST /api/social/messages/:userId/read    — mark as read
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { getSocket } from '../../services/socket';
import { socialApi } from '../../services/api';

export default function PrivateChat({ friend, onClose, onMarkRead }) {
  const { user }  = useAuth();
  const socket           = getSocket();
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const typingTimer             = useRef(null);
  const bottomRef               = useRef(null);

  // Load history + mark as read on open
  useEffect(() => {
    if (!friend?.id) return;
    socialApi.getMessages(friend.id)
      .then(res => {
        if (res.data?.messages) setMessages(res.data.messages);
        // getMessages auto-marks as read server-side; notify parent to clear badge
        onMarkRead?.(friend.id);
      })
      .catch(() => {});
  }, [friend.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Socket listeners
  useEffect(() => {
    if (!socket) return;

    const onReceived = (msg) => {
      if (msg.from?.id === friend.id || msg.senderId === friend.id) {
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        // Mark as read immediately since chat is open
        socialApi.markMessagesRead(friend.id).catch(() => {});
        onMarkRead?.(friend.id);
      }
    };
    const onSent = (msg) => {
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };
    const onTyping = ({ fromUserId, isTyping: typing }) => {
      if (fromUserId === friend.id) setIsTyping(typing);
    };
    const onError = ({ error }) => {
      console.error('private:error', error);
    };

    socket.on('private:message:received', onReceived);
    socket.on('private:message:sent', onSent);
    socket.on('private:typing:received', onTyping);
    socket.on('private:error', onError);
    return () => {
      socket.off('private:message:received', onReceived);
      socket.off('private:message:sent', onSent);
      socket.off('private:typing:received', onTyping);
      socket.off('private:error', onError);
    };
  }, [socket, friend.id, onMarkRead]);

  // Auto scroll
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendMessage = useCallback(() => {
    if (!input.trim() || !socket) return;
    socket.emit('private:message', { toUserId: friend.id, text: input.trim() });
    setInput('');
  }, [input, socket, friend.id]);

  const handleTyping = (val) => {
    setInput(val);
    socket?.emit('private:typing', { toUserId: friend.id, isTyping: true });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket?.emit('private:typing', { toUserId: friend.id, isTyping: false });
    }, 1500);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 100 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 100 }}
      style={{
        position: 'fixed', bottom: 20, right: 20, width: 320, height: 460,
        background: '#1e2a3a', borderRadius: 16, display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)', zIndex: 150, overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '12px 16px', background: '#243447', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid #374151',
      }}>
        <div>
          <div style={{ color: '#fff', fontWeight: 700 }}>{friend.username}</div>
          {isTyping && <div style={{ color: '#9ca3af', fontSize: 11 }}>escribiendo…</div>}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#ccc', fontSize: 18, cursor: 'pointer' }}>✕</button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {messages.map((msg, i) => {
          // Normalized format from API/socket: msg.from.id or msg.senderId
          const mine = msg.from?.id === user?.id || msg.senderId === user?.id;
          const text = msg.text || msg.content || '';
          return (
            <div key={msg.id || i} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '75%', padding: '7px 12px', borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: mine ? '#1d4ed8' : '#374151', color: '#fff', fontSize: 13, wordBreak: 'break-word',
              }}>
                {text}
                <div style={{ color: mine ? '#93c5fd' : '#9ca3af', fontSize: 10, marginTop: 3, textAlign: 'right' }}>
                  {new Date(msg.createdAt || msg.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid #374151', display: 'flex', gap: 8 }}>
        <input
          value={input} onChange={e => handleTyping(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          placeholder="Escribí un mensaje…"
          style={{
            flex: 1, padding: '8px 12px', borderRadius: 20, border: '1px solid #374151',
            background: '#243447', color: '#fff', fontSize: 13,
          }}
        />
        <button onClick={sendMessage} style={{
          background: '#1d4ed8', border: 'none', borderRadius: 20, padding: '8px 14px',
          color: '#fff', cursor: 'pointer', fontWeight: 700,
        }}>➤</button>
      </div>
    </motion.div>
  );
}
