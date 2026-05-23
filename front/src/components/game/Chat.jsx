import { memo, useState, useRef, useEffect } from 'react';
import { MessageSquare } from 'lucide-react';

const REACTIONS = ['👍', '👎', '😂', '😤', '🃏', '🔥', '👏', '🤔'];

function Chat({ messages, onSend, onReaction, myId, variant = 'floating' }) {
  const [text, setText]     = useState('');
  const [open, setOpen]     = useState(false);
  const bottomRef           = useRef(null);
  /** Cantidad de mensajes considerados leídos (hasta la última vez que el panel estuvo abierto) */
  const [readUpTo, setReadUpTo] = useState(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) {
      setReadUpTo(messages.length);
    }
  }, [open, messages.length]);

  useEffect(() => {
    if (messages.length === 0) setReadUpTo(0);
  }, [messages.length]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text);
    setText('');
  };

  const panelClass =
    variant === 'header'
      ? `chat-panel chat-panel--header ${open ? 'chat-open' : ''}`
      : `chat-panel game-chat-panel chat-panel--floating ${open ? 'chat-open' : ''}`;

  const unreadWhileClosed = open ? 0 : Math.max(0, messages.length - readUpTo);

  const toggle = () => setOpen((o) => !o);

  return (
    <div className={panelClass}>
      <button
        type="button"
        className="chat-toggle"
        onClick={toggle}
        aria-expanded={open}
        aria-label={open ? 'Cerrar chat de partida' : 'Abrir chat de partida'}
      >
        <span className="chat-toggle-inner">
          <MessageSquare className="chat-toggle-icon" size={18} strokeWidth={2.25} aria-hidden />
          <span className="chat-toggle-label">Chat</span>
          {unreadWhileClosed > 0 && (
            <span className="badge" aria-live="polite">
              {unreadWhileClosed > 99 ? '99+' : unreadWhileClosed}
            </span>
          )}
        </span>
      </button>

      {open && (
        <div className="chat-body">
          <div className="chat-messages">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`chat-msg ${msg.from.id === myId ? 'mine' : 'theirs'} ${msg.isReaction ? 'reaction' : ''}`}
              >
                <span className="msg-user">{msg.from.username}</span>
                <span className="msg-text">{msg.text || msg.reaction}</span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="reactions-row">
            {REACTIONS.map(r => (
              <button key={r} className="reaction-btn" onClick={() => onReaction(r)}>
                {r}
              </button>
            ))}
          </div>

          <form onSubmit={handleSend} className="chat-form">
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Escribí algo..."
              maxLength={200}
            />
            <button type="submit" className="btn btn-send">Enviar</button>
          </form>
        </div>
      )}
    </div>
  );
}

export default memo(Chat);
