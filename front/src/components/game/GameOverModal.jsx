import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

export default function GameOverModal({ gameOver, myId, onNextRound, onLobby }) {
  const navigate = useNavigate();
  if (!gameOver) return null;

  const won = gameOver.winner === myId;

  return (
    <AnimatePresence>
      <motion.div
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="modal-card"
          initial={{ scale: 0.5, y: -100 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.5 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        >
          <div className={`result-icon ${won ? 'win' : 'loss'}`}>
            {won ? '🏆' : '😔'}
          </div>
          <h2>{won ? '¡Ganaste!' : '¡Perdiste!'}</h2>
          {gameOver.eloDelta && (
            <div className="elo-change">
              ELO: {gameOver.eloDelta[myId] > 0 ? '+' : ''}{gameOver.eloDelta[myId]}
            </div>
          )}
          <div className="modal-actions">
            <button className="btn btn-primary" onClick={() => navigate('/lobby')}>
              Volver al Lobby
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
