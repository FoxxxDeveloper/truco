import { memo } from 'react';
import { motion } from 'framer-motion';
import Card from './Card';

import { useIsMobileLite } from '../../hooks/useIsMobileLite';
import { useRenderCount } from '../../hooks/useRenderCount';

function OpponentHandInner({ cardCount }) {
  useRenderCount('OpponentHand');
  const mobileLite = useIsMobileLite();
  const cards = Array.from({ length: cardCount });
  const Wrapper = mobileLite ? 'div' : motion.div;
  const wrapProps = mobileLite
    ? { className: 'opponent-hand opponent-zone game-opponent-zone', 'aria-label': 'Cartas del oponente' }
    : {
        className: 'opponent-hand opponent-zone game-opponent-zone',
        'aria-label': 'Cartas del oponente',
        initial: { y: -100, opacity: 0 },
        animate: { y: 0, opacity: 1 },
        transition: { delay: 0.2 },
      };

  return (
    <Wrapper {...wrapProps}>
      <div className="cards-row">
        {cards.map((_, i) => (
          <Card key={i} faceDown />
        ))}
      </div>
    </Wrapper>
  );
}

export default memo(OpponentHandInner);
