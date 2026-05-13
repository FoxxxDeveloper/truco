import { motion } from 'framer-motion';
import Card from './Card';

export default function PlayerHand({ cards, onPlayCard, isMyTurn, disabled }) {
  return (
    <motion.div
      className="player-hand my-hand game-hand-zone"
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.3 }}
    >
      <div className="hand-label">Tu mano</div>
      <div className="cards-row">
        {cards.map((card, i) => (
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
        ))}
        {cards.length === 0 && <span className="no-cards">Sin cartas</span>}
      </div>
    </motion.div>
  );
}
