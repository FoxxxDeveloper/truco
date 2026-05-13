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
        className="modal-backdrop game-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className={`fx-card game-modal game-over-modal ${won ? 'game-over-modal--won' : 'game-over-modal--lost'}`}
          initial={{ scale: 0.5, y: -80, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.5, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        >
          <div className={`game-over-icon ${won ? 'game-over-icon--won' : 'game-over-icon--lost'}`}>
            <TrophyIcon size={52} />
          </div>
          <h2 className="game-over-title">
            {won ? '¡Ganaste!' : '¡Perdiste!'}
          </h2>

          {gameOver.reason === 'abandon' && (
            <p className="game-over-abandon-note">
              {gameOver.abandonedBy !== myId ? 'Tu rival abandonó la partida.' : 'Abandonaste la partida.'}
            </p>
          )}

          {delta !== undefined && (
            <div className={`game-over-elo ${delta >= 0 ? 'game-over-elo--up' : 'game-over-elo--down'}`}>
              ELO: {delta >= 0 ? '+' : ''}{delta}
            </div>
          )}

          <div className="game-modal-actions game-over-actions">
            <button
              type="button"
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
