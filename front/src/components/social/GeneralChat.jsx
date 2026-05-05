/**
 * GeneralChat -- global lobby chat visible to all logged-in users.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { getSocket } from '../../services/socket';
import { socialApi } from '../../services/api';

export default function GeneralChat({ onClose }) {
  const { user }   = useAuth();
  const socket     = getSocket();
  const [messages, setMessages] = useState([]);
  const [input,    setInput]    = useState('');
  const [open,     setOpen]     = useState(true);
  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);

  useEffect(() => {
    socialApi.getGeneralMessages(50)
      .then(res => { if (res.data?.messages) setMessages(res.data.messages); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onMessage = (msg) => {
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };
    const onError = ({ error }) => console.warn('general:error', error);
    socket.on('general:message', onMessage);
    socket.on('general:error',   onError);
    return () => {
      socket.off('general:message', onMessage);
      socket.off('general:error',   onError);
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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      style={{
        position: 'fixed', bottom: 20, left: 20,
        width: 300,
        background: 'linear-gradient(180deg, rgba(52, 24, 9, 0.98), rgba(30, 12, 4, 0.99))',
        border: '1px solid rgba(246, 196, 83, 0.32)',
        borderRadius: 18,
        boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
        zIndex: 140,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: open ? 420 : 48,
        transition: 'max-height 0.25s ease',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '11px 14px',
          background: 'rgba(0,0,0,0.22)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderBottom: open ? '1px solid rgba(246, 196, 83, 0.2)' : 'none',
          cursor: 'pointer', userSelect: 'none', flexShrink: 0,
        }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ color: 'var(--gold)', fontWeight: 700, fontSize: 13, letterSpacing: '0.03em' }}>
          Chat General
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{open ? '▾' : '▴'}</span>
          <button
            onClick={e => { e.stopPropagation(); onClose?.(); }}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}
          >×</button>
        </div>
      </div>

      {/* Messages */}
      {open && (
        <>
          <div style={{
            flex: 1, overflowY: 'auto', padding: '10px 12px',
            display: 'flex', flexDirection: 'column', gap: 4,
            minHeight: 0,
          }}>
            {messages.length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>
                Se el primero en escribir
              </p>
            )}
            {messages.map((msg, i) => {
              const mine = msg.from?.id === user?.id;
              return (
                <div key={msg.id || i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg, #e7a92f, #b97817)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, overflow: 'hidden',
                  }}>
                    {msg.from?.avatar
                      ? <img src={msg.from.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ color: '#2a1000', fontWeight: 800 }}>
                          {(msg.from?.username || '?').slice(0, 2).toUpperCase()}
                        </span>
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      color: mine ? 'var(--gold-light)' : 'var(--gold)',
                      marginRight: 4,
                    }}>
                      {mine ? 'Vos' : msg.from?.username}
                    </span>
                    <span style={{ color: 'var(--text-soft)', fontSize: 12, wordBreak: 'break-word' }}>
                      {msg.text}
                    </span>
                    <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 2 }}>
                      {new Date(msg.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '8px 10px',
            borderTop: '1px solid rgba(246, 196, 83, 0.18)',
            display: 'flex', gap: 6, flexShrink: 0,
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Escribi..."
              maxLength={500}
              style={{
                flex: 1, padding: '7px 10px', borderRadius: 999,
                border: '1px solid rgba(246, 196, 83, 0.22)',
                background: 'rgba(0, 0, 0, 0.25)',
                color: 'var(--text)', fontSize: 12, outline: 'none',
              }}
            />
            <button
              onClick={send}
              style={{
                background: 'linear-gradient(135deg, #e7a92f, #b97817)',
                border: 'none', borderRadius: 999,
                padding: '7px 13px', color: '#2a1000',
                cursor: 'pointer', fontSize: 13, fontWeight: 800,
              }}
            >Send</button>
          </div>
        </>
      )}
    </motion.div>
  );
}
