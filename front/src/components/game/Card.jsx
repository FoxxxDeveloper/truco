/**
 * Card component — uses real naipe español SVG files from /cartas/.
 */
import { motion } from 'framer-motion';

const SUIT_FILE = {
  espada: 'swords',
  basto:  'clubs',
  oro:    'coins',
  copa:   'cups',
};

function cardUrl(suit, value) {
  const s = SUIT_FILE[suit] || suit;
  const n = String(value).padStart(2, '0');
  return `/cartas/card_${s}_${n}.svg`;
}

const BACK_URL = '/cartas/card_back.svg';

export default function Card({ card, faceDown = false, onClick, disabled = false, played = false, small = false }) {
  if (faceDown) {
    return (
      <motion.div
        className={`card playing-card ${small ? 'card-small' : ''}`}
        initial={{ scale: 0, rotateY: 180 }}
        animate={{ scale: 1, rotateY: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      >
        <img src={BACK_URL} alt="Carta boca abajo" className="card-img" draggable={false} />
      </motion.div>
    );
  }

  return (
    <motion.button
      className={`card playing-card card-face ${played ? 'card-played' : ''} ${small ? 'card-small' : ''}`}
      onClick={!disabled ? onClick : undefined}
      disabled={disabled}
      whileHover={!disabled ? { y: -10, scale: 1.04 } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
      initial={{ scale: 0, y: 40 }}
      animate={{ scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      aria-label={`${card.value} de ${card.suit}`}
    >
      <img
        src={cardUrl(card.suit, card.value)}
        alt={`${card.value} de ${card.suit}`}
        className="card-img"
        draggable={false}
      />
    </motion.button>
  );
}
