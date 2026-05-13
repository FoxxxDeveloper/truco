/**
 * PrivateChat — real-time DM with a friend over Socket.IO.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, Send } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getSocket } from '../../services/socket';
import { socialApi } from '../../services/api';

export default function PrivateChat({ friend, onClose, onMarkRead }) {
  const { user } = useAuth();
  const socket = getSocket();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const typingTimer = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!friend?.id) return;
    socialApi
      .getMessages(friend.id)
      .then((res) => {
        if (res.data?.messages) setMessages(res.data.messages);
        onMarkRead?.(friend.id);
      })
      .catch(() => {});
  }, [friend.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!socket) return;

    const onReceived = (msg) => {
      if (msg.from?.id === friend.id || msg.senderId === friend.id) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        socialApi.markMessagesRead(friend.id).catch(() => {});
        onMarkRead?.(friend.id);
      }
    };
    const onSent = (msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      className="chat-shell chat-shell--floating chat-shell--private"
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
    >
      <header className="chat-floating-private-header">
        <div>
          <div className="chat-floating-private-name">{friend.username}</div>
          {isTyping && <div className="chat-subheader-typing">escribiendo…</div>}
        </div>
        <button type="button" className="btn btn-ghost btn-sm chat-floating-private-close" onClick={onClose} aria-label="Cerrar">
          <X size={18} aria-hidden />
        </button>
      </header>

      <div className="chat-message-list chat-message-list--private-float">
        {messages.map((msg, i) => {
          const mine = msg.from?.id === user?.id || msg.senderId === user?.id;
          const text = msg.text || msg.content || '';
          return (
            <div key={msg.id || i} className={`chat-message-row chat-message-row--private-float${mine ? ' chat-message-row--mine' : ''}`.trim()}>
              <div className={`chat-message-bubble${mine ? ' chat-message-bubble--mine' : ' chat-message-bubble--other'}`.trim()}>
                {text}
                <div className={`chat-message-time${mine ? ' chat-message-time--mine' : ''}`.trim()}>
                  {new Date(msg.createdAt || msg.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-bar chat-input-bar--floating">
        <input
          className="chat-input"
          value={input}
          onChange={(e) => handleTyping(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          placeholder="Escribí un mensaje…"
        />
        <button type="button" className="btn btn-primary chat-send-btn" onClick={sendMessage} aria-label="Enviar">
          <Send size={16} aria-hidden />
        </button>
      </div>
    </motion.div>
  );
}
