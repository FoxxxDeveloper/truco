import { motion } from 'framer-motion';
import Card from './Card';

export default function OpponentHand({ cardCount }) {
  const cards = Array.from({ length: cardCount });
  return (
    <motion.div
      className="opponent-hand"
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.2 }}
    >
      <div className="hand-label">Oponente</div>
      <div className="cards-row">
        {cards.map((_, i) => (
          <Card key={i} faceDown />
        ))}
        {cardCount === 0 && <span className="no-cards">Sin cartas</span>}
      </div>
    </motion.div>
  );
}
