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
import { motion, AnimatePresence } from 'framer-motion';

export default function ReconnectOverlay({ type, graceSecs = 60, onAbandon }) {
  const [remaining, setRemaining] = useState(graceSecs);

  useEffect(() => {
    if (remaining <= 0) return;
    const t = setInterval(() => setRemaining(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const progress = remaining / graceSecs; // 1 → 0

  if (type === 'self') {
    return (
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{
          position: 'fixed', inset: 0, zIndex: 500,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 20,
        }}
      >
        <div style={{ fontSize: 48 }}>🔄</div>
        <h2 style={{ color: '#fff', margin: 0 }}>Reconectando a tu partida…</h2>
        <p style={{ color: '#9ca3af', textAlign: 'center' }}>
          No cierres esta ventana.<br />Tu partida sigue activa.
        </p>
        <div style={{ width: 200, height: 6, background: '#374151', borderRadius: 3 }}>
          <motion.div
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 1, ease: 'linear' }}
            style={{ height: '100%', background: '#3b82f6', borderRadius: 3 }}
          />
        </div>
        <div style={{ color: '#6b7280', fontSize: 13 }}>
          {remaining > 0 ? `${remaining}s para que cuente como abandono` : 'Tiempo agotado'}
        </div>
      </motion.div>
    );
  }

  // type === 'opponent'
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 400,
        background: 'rgba(239,68,68,0.95)',
        padding: '14px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      }}
    >
      <div>
        <div style={{ color: '#fff', fontWeight: 700 }}>⚡ Tu rival se desconectó</div>
        <div style={{ color: '#fecaca', fontSize: 13 }}>
          Si no vuelve en {remaining}s, ganás la partida automáticamente
        </div>
      </div>
      {/* Progress bar */}
      <div style={{ width: 120, height: 6, background: 'rgba(255,255,255,0.3)', borderRadius: 3, flexShrink: 0 }}>
        <motion.div
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: 1, ease: 'linear' }}
          style={{ height: '100%', background: '#fff', borderRadius: 3 }}
        />
      </div>
    </motion.div>
  );
}
