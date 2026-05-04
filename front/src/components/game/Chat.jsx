import { useState, useRef, useEffect } from 'react';

const REACTIONS = ['👍', '👎', '😂', '😤', '🃏', '🔥', '👏', '🤔'];

export default function Chat({ messages, onSend, onReaction, myId }) {
  const [text, setText]     = useState('');
  const [open, setOpen]     = useState(false);
  const bottomRef           = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text);
    setText('');
  };

  return (
    <div className={`chat-panel ${open ? 'chat-open' : ''}`}>
      <button className="chat-toggle" onClick={() => setOpen(o => !o)}>
        💬 Chat {messages.length > 0 && <span className="badge">{messages.length}</span>}
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
