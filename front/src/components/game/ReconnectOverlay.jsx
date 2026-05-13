/**
 * ReconnectOverlay — shown when the opponent disconnects or
 * when the app itself is reconnecting to the server.
 *
 * Props:
 *   type: 'opponent' | 'self'
 *   graceSecs: number (countdown)
 *   onAbandon: () => void (navigate away if abandoned)
 */
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function ReconnectOverlay({ type, graceSecs = 60, onAbandon }) {
  const [remaining, setRemaining] = useState(graceSecs);

  useEffect(() => {
    if (remaining <= 0) return;
    const t = setInterval(() => setRemaining(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const progress = remaining / graceSecs;

  if (type === 'self') {
    return (
      <motion.div
        className="game-reconnect-overlay game-reconnect-overlay--self"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="game-reconnect-card fx-card game-modal">
            <div className="game-reconnect-icon" aria-hidden>↻</div>
            <h2 className="game-modal-title">Reconectando a tu partida…</h2>
            <p className="game-modal-lead game-reconnect-lead">
              No cierres esta ventana. Tu partida sigue activa.
            </p>
            <div className="game-reconnect-progress">
              <motion.div
                className="game-reconnect-progress-fill game-reconnect-progress-fill--self"
                animate={{ width: `${progress * 100}%` }}
                transition={{ duration: 1, ease: 'linear' }}
              />
            </div>
            <p className="game-reconnect-meta">
              {remaining > 0 ? `${remaining}s para que cuente como abandono` : 'Tiempo agotado'}
            </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="game-reconnect-banner game-reconnect-banner--opponent"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
    >
      <div className="game-reconnect-banner-text">
        <div className="game-reconnect-banner-title">Tu rival se desconectó</div>
        <div className="game-reconnect-banner-sub">
          Si no vuelve en {remaining}s, ganás la partida automáticamente
        </div>
      </div>
      <div className="game-reconnect-progress game-reconnect-progress--inline">
        <motion.div
          className="game-reconnect-progress-fill"
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: 1, ease: 'linear' }}
        />
      </div>
    </motion.div>
  );
}
