/**
 * The center play area showing played cards for each mano.
 */
import { motion, AnimatePresence } from 'framer-motion';
import Card from './Card';

export default function PlayArea({ playedCards, manoResults, currentMano, myId }) {
  return (
    <div className="play-area">
      {[0, 1, 2].map(manoIdx => {
        const cards = playedCards[manoIdx] || [];
        const result = manoResults[manoIdx];
        const isActive = manoIdx === currentMano;

        return (
          <div key={manoIdx} className={`mano-slot ${isActive ? 'active' : ''} ${result ? 'resolved' : ''}`}>
            <div className="mano-label">Mano {manoIdx + 1}</div>
            <div className="mano-cards">
              {cards.map(({ playerId, card }) => (
                <div key={card.id} className={`played-card-wrap ${playerId === myId ? 'mine' : 'theirs'}`}>
                  <Card card={card} small played disabled />
                  <span className="card-owner">{playerId === myId ? 'Vos' : 'Ellos'}</span>
                </div>
              ))}
            </div>
            <AnimatePresence>
              {result !== undefined && result !== null && (
                <motion.div
                  className={`mano-result ${result === myId ? 'win' : 'loss'}`}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                >
                  {result === myId ? '✓ Ganaste' : '✗ Perdiste'}
                </motion.div>
              )}
              {result === null && manoResults.length > manoIdx && (
                <motion.div className="mano-result tie" initial={{ scale: 0 }} animate={{ scale: 1 }}>
                  Parda
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
