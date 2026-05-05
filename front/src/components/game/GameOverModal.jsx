import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../../context/GameContext';
import { TrophyIcon } from '../Icons';

export default function GameOverModal({ gameOver, myId }) {
  const navigate = useNavigate();
  const { clearGame } = useGame();
  if (!gameOver) return null;

  const won = gameOver.winner === myId;
  const delta = gameOver.eloDelta?.[myId];

  const handleLobby = () => {
    clearGame();
    navigate('/lobby');
  };

  return (
    <AnimatePresence>
      <motion.div
        className="modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{ zIndex: 300 }}
      >
        <motion.div
          className="overlay-card"
          initial={{ scale: 0.5, y: -80, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.5, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          style={{ textAlign: 'center' }}
        >
          <div className="overlay-icon" style={{ color: won ? 'var(--gold)' : 'var(--text-muted)' }}>
            <TrophyIcon size={52} />
          </div>
          <h2
            className="overlay-title"
            style={{ color: won ? 'var(--gold)' : 'var(--text-secondary)' }}
          >
            {won ? '¡Ganaste!' : '¡Perdiste!'}
          </h2>

          {gameOver.reason === 'abandon' && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 8, marginTop: -4 }}>
              {gameOver.abandonedBy !== myId ? 'Tu rival abandonó la partida.' : 'Abandonaste la partida.'}
            </p>
          )}

          {delta !== undefined && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: delta >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${delta >= 0 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                borderRadius: '999px',
                padding: '4px 16px',
                marginBottom: 24,
                color: delta >= 0 ? 'var(--green)' : 'var(--red)',
                fontWeight: 700,
              }}
            >
              ELO: {delta >= 0 ? '+' : ''}{delta}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn btn-gold btn-lg"
              onClick={handleLobby}
            >
              Volver al Lobby
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
