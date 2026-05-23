/**
 * EnvidoResultModal
 *
 * Muestra el resultado del envido como modal.
 * Aplica las reglas argentinas de revelación:
 *   - El jugador PIE (no mano) siempre declara sus puntos.
 *   - El jugador MANO solo declara si ganó; si perdió dice "son buenas".
 */
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';

const BET_LABELS = {
  envido:       'Envido',
  real_envido:  'Real Envido',
  falta_envido: 'Falta Envido',
};

function buildBetLabel(betStack = []) {
  return betStack.map(b => BET_LABELS[b] || b).join(' + ') || 'Envido';
}

export default function EnvidoResultModal({ event, onClose }) {
  const { user } = useAuth();
  if (!event) return null;

  const myId    = Number(user.id);
  const {
    event: evType,
    winner,
    points,
    betStack = [],
    envidoReveal,
  } = event;

  const iWon    = Number(winner) === myId;
  const rejected =
    evType === 'ENVIDO_REJECTED' ||
    event.accepted === false ||
    event.reason === 'rejected' ||
    event.response === 'reject';

  if (rejected) return null;

  const betLabel = buildBetLabel(betStack);

  // ── Point reveal logic (only for accepted envido) ─────────────────
  let myPoints          = null;
  let rivalPoints       = null;
  let iSaidSonBuenas    = false;
  let rivalSaidSonBuenas = false;

  if (!rejected && envidoReveal) {
    const { shownPoints = {} } = envidoReveal;

    // JSON keys are always strings; compare as strings
    const myKey    = String(myId);
    const rivalKey = Object.keys(shownPoints).find(k => k !== myKey);

    myPoints    = shownPoints[myKey]    ?? null;
    rivalPoints = rivalKey != null ? (shownPoints[rivalKey] ?? null) : null;

    // A null entry means that player said "son buenas" (mano lost)
    iSaidSonBuenas    = myPoints    === null;
    rivalSaidSonBuenas = rivalPoints === null;
  }

  return (
    <div className="envido-overlay" onClick={onClose}>
      <motion.div
        className="envido-modal fx-card game-modal"
        initial={{ scale: 0.7, opacity: 0, y: -40 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.85, opacity: 0, y: 20 }}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Title */}
        <div className="envido-modal-title">{betLabel}</div>

        {/* Win/lose */}
        <div className={`envido-modal-verdict ${iWon ? 'won' : 'lost'}`}>
          {iWon ? '¡Ganaste!' : 'Perdiste'}
        </div>

        {/* Point rows */}
        <div className="envido-modal-rows">
          <div className={`envido-row ${iWon ? 'winner' : 'loser'}`}>
            <span className="envido-row-label">Vos</span>
            <span className="envido-row-pts">
              {iSaidSonBuenas ? <em>son buenas</em> : myPoints}
            </span>
          </div>
          <div className={`envido-row ${!iWon ? 'winner' : 'loser'}`}>
            <span className="envido-row-label">Rival</span>
            <span className="envido-row-pts">
              {rivalSaidSonBuenas ? <em>son buenas</em> : rivalPoints}
            </span>
          </div>
        </div>

        {/* Prize */}
        <div className="envido-modal-prize">+{points} pt{points !== 1 ? 's' : ''}</div>

        <button className="envido-modal-btn" onClick={onClose}>
          Aceptar
        </button>
      </motion.div>
    </div>
  );
}
