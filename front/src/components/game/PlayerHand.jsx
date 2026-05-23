import { memo } from 'react';
import { motion } from 'framer-motion';
import Card from './Card';

import { useIsMobileLite } from '../../hooks/useIsMobileLite';
import { useRenderCount } from '../../hooks/useRenderCount';

function PlayerHandInner({ cards, onPlayCard, isMyTurn, disabled }) {
  useRenderCount('PlayerHand');
  const mobileLite = useIsMobileLite();
  const Wrapper = mobileLite ? 'div' : motion.div;
  const wrapProps = mobileLite
    ? { className: 'player-hand my-hand game-hand-zone', 'aria-label': 'Tu mano' }
    : {
        className: 'player-hand my-hand game-hand-zone',
        'aria-label': 'Tu mano',
        initial: { y: 100, opacity: 0 },
        animate: { y: 0, opacity: 1 },
        transition: { delay: 0.3 },
      };

  return (
    <Wrapper {...wrapProps}>
      <div className="cards-row">
        {cards.map((card, i) =>
          mobileLite ? (
            <div key={card.id}>
              <Card
                card={card}
                onClick={() => onPlayCard(card.id)}
                disabled={disabled || !isMyTurn}
              />
            </div>
          ) : (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Card
                card={card}
                onClick={() => onPlayCard(card.id)}
                disabled={disabled || !isMyTurn}
              />
            </motion.div>
          ),
        )}
      </div>
    </Wrapper>
  );
}

export default memo(PlayerHandInner);
