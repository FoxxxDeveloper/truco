/**
 * GeneralChat — global lobby chat visible to all logged-in users.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, ChevronDown, ChevronUp, Send } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getSocket } from '../../services/socket';
import { socialApi } from '../../services/api';
import TrucoAvatar from '../avatar/TrucoAvatar';

export default function GeneralChat({ onClose }) {
  const { user } = useAuth();
  const socket = getSocket();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(true);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    socialApi
      .getGeneralMessages(50)
      .then((res) => {
        if (res.data?.messages) setMessages(res.data.messages);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onMessage = (msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };
    const onError = ({ error }) => console.warn('general:error', error);
    socket.on('general:message', onMessage);
    socket.on('general:error', onError);
    return () => {
      socket.off('general:message', onMessage);
      socket.off('general:error', onError);
    };
  }, [socket]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const send = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || !socket) return;
    socket.emit('general:message', { text: trimmed });
    setInput('');
    inputRef.current?.focus();
  }, [input, socket]);

  return (
    <motion.div
      className={`chat-shell chat-shell--floating chat-shell--general${open ? ' chat-shell--open' : ' chat-shell--collapsed'}`.trim()}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
    >
      <button type="button" className="chat-floating-header" onClick={() => setOpen((o) => !o)}>
        <span className="chat-floating-title">Chat general</span>
        <span className="chat-floating-header-actions">
          {open ? <ChevronDown size={16} aria-hidden /> : <ChevronUp size={16} aria-hidden />}
          <button
            type="button"
            className="btn btn-ghost btn-sm chat-floating-close"
            onClick={(e) => {
              e.stopPropagation();
              onClose?.();
            }}
            aria-label="Cerrar"
          >
            <X size={16} aria-hidden />
          </button>
        </span>
      </button>

      {open && (
        <>
          <div className="chat-message-list chat-message-list--floating">
            {messages.length === 0 && (
              <div className="chat-empty-state chat-empty-state--compact">
                <p className="chat-empty-state-text">Sé el primero en escribir en la mesa.</p>
              </div>
            )}
            {messages.map((msg, i) => {
              const mine = msg.from?.id === user?.id;
              const text = msg.text || msg.content || '';
              return (
                <div key={msg.id || i} className={`chat-message-row chat-message-row--compact${mine ? ' chat-message-row--mine' : ''}`.trim()}>
                  <div className="chat-avatar-cell">
                    <TrucoAvatar
                      username={msg.from?.username}
                      avatar={msg.from?.avatar}
                      size={24}
                      className="chat-avatar chat-avatar-img"
                    />
                  </div>
                  <div className={`chat-message-block${mine ? ' chat-message-block--mine' : ''}`.trim()}>
                    <div className="chat-message-inline-meta">
                      <span className="chat-message-author">{mine ? 'Vos' : msg.from?.username}</span>
                      <span className="chat-message-time chat-message-time--inline">
                        {new Date(msg.createdAt || msg.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className={`chat-message-bubble chat-message-bubble--compact${mine ? ' chat-message-bubble--mine' : ' chat-message-bubble--other'}`.trim()}>{text}</div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          <div className="chat-input-bar chat-input-bar--floating">
            <input
              ref={inputRef}
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Escribí…"
              maxLength={500}
            />
            <button type="button" className="btn btn-primary chat-send-btn" onClick={send} aria-label="Enviar">
              <Send size={16} aria-hidden />
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
}
