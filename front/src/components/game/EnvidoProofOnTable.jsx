/**
 * Puntos en mesa — cartas del ganador del Envido en la mesa (misma gramática que bazas).
 */
import { memo } from 'react';
import { motion } from 'framer-motion';
import Card from './Card';
import { useIsMobileLite } from '../../hooks/useIsMobileLite';

function EnvidoProofOnTableInner({ proof, myId, opponent }) {
  const mobileLite = useIsMobileLite();

  if (!proof?.cards?.length) return null;

  const side =
    proof.winnerSide === 'self' || proof.winnerSide === 'opponent'
      ? proof.winnerSide
      : Number(proof.winnerId ?? proof.playerId) === Number(myId)
        ? 'self'
        : 'opponent';

  const isSelf = side === 'self';
  const ownerName = isSelf ? 'Vos' : opponent?.username || 'Rival';
  const cardSideClass = isSelf ? 'trick-card--player' : 'trick-card--opponent';
  const slideFrom = isSelf ? 18 : -18;

  const Wrapper = mobileLite ? 'div' : motion.div;
  const motionProps = mobileLite
    ? {}
    : {
        initial: { opacity: 0, y: slideFrom },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: slideFrom * 0.4 },
        transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
      };

  return (
    <Wrapper
      className={`envido-proof-inline envido-proof-inline--${side}`}
      {...motionProps}
      role="status"
      aria-live="polite"
      aria-label={`${proof.label || 'Puntos en mesa'}. ${ownerName}: ${proof.points ?? ''}`}
    >
      <span className="envido-proof-inline__label">{proof.label || 'PUNTOS EN MESA'}</span>

      <div className="envido-proof-duel trick-duel trick-duel--live envido-proof-duel--center">
        {proof.cards.map((card, i) => {
          const posClass = i === 0 ? 'trick-card--lead' : 'trick-card--chase';
          return (
            <div
              key={card.id || `${card.value}_${card.suit}-${i}`}
              className={`played-card-wrap envido-proof-card ${cardSideClass} ${posClass}`}
            >
              <div className="played-card-frame">
                <Card card={card} played disabled />
              </div>
            </div>
          );
        })}
      </div>

      {proof.points != null && (
        <span className="envido-proof-inline__pts">
          {ownerName}: <strong>{proof.points}</strong>
        </span>
      )}
    </Wrapper>
  );
}

const EnvidoProofOnTable = memo(EnvidoProofOnTableInner);
export default EnvidoProofOnTable;
