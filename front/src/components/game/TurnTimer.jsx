/**
 * TurnTimer — visual countdown bar shown during a player's turn.
 *
 * Receives:
 *   playerId   - who must act
 *   seconds    - total seconds for this turn
 *   myId       - the local player's id
 *
 * Shows different colors:
 *   > 15s: green
 *   8–15s: yellow
 *   < 8s:  red (pulses)
 */
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function TurnTimer({ playerId, seconds, myId }) {
  const [remaining, setRemaining] = useState(seconds);

  // Reset when a new timer starts
  useEffect(() => {
    setRemaining(seconds);
  }, [playerId, seconds]);

  useEffect(() => {
    if (remaining <= 0) return;
    const t = setInterval(() => setRemaining(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [remaining]);

  const progress = remaining / seconds; // 1 → 0
  const isMe = playerId === myId;

  const barColor = remaining > 15 ? '#4ade80'
                 : remaining > 8  ? '#facc15'
                 :                   '#ef4444';

  if (remaining <= 0) return null;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Bar */}
      <div style={{ width: '100%', height: 4, background: '#1f2937', borderRadius: 2 }}>
        <motion.div
          animate={{ width: `${progress * 100}%`, backgroundColor: barColor }}
          transition={{ duration: 1, ease: 'linear' }}
          style={{ height: '100%', borderRadius: 2 }}
        />
      </div>
      {/* Label */}
      <div style={{
        textAlign: 'center', fontSize: 11, color: barColor,
        marginTop: 2, fontWeight: remaining < 8 ? 700 : 400,
      }}>
        {isMe
          ? `Tu turno — ${remaining}s`
          : `Turno del rival — ${remaining}s`}
      </div>
    </div>
  );
}
