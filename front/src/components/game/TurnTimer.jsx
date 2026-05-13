/**
 * TurnTimer — visual countdown bar shown during a player's turn.
 *
 * Receives:
 *   playerId   - who must act
 *   seconds    - total seconds for this turn
 *   myId       - the local player's id
 */
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function TurnTimer({ playerId, seconds, myId }) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    setRemaining(seconds);
  }, [playerId, seconds]);

  useEffect(() => {
    if (remaining <= 0) return;
    const t = setInterval(() => setRemaining(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [remaining]);

  const progress = remaining / seconds;
  const isMe = playerId === myId;
  const phase = remaining > 15 ? 'ok' : remaining > 8 ? 'warn' : 'danger';

  if (remaining <= 0) return null;

  return (
    <div className={`game-turn-timer game-turn-timer--${phase}`}>
      <div className="game-turn-timer-track">
        <motion.div
          className="game-turn-timer-fill"
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: 1, ease: 'linear' }}
        />
      </div>
      <div className={`game-turn-timer-label ${remaining < 8 ? 'is-urgent' : ''}`}>
        {isMe
          ? `Tu turno — ${remaining}s`
          : `Turno del rival — ${remaining}s`}
      </div>
    </div>
  );
}
