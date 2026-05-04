/**
 * Card component with suit symbols and value display.
 * Supports face-down mode for opponent's hand.
 */
import { motion } from 'framer-motion';

const SUIT_SYMBOLS = {
  espada: '⚔️',
  basto:  '🌿',
  oro:    '🪙',
  copa:   '🏆',
};

const SUIT_COLORS = {
  espada: '#1a1a2e',
  basto:  '#2d5016',
  oro:    '#b8860b',
  copa:   '#8b0000',
};

export default function Card({ card, faceDown = false, onClick, disabled = false, played = false, small = false }) {
  if (faceDown) {
    return (
      <motion.div
        className={`card card-back ${small ? 'card-small' : ''}`}
        initial={{ scale: 0, rotateY: 180 }}
        animate={{ scale: 1, rotateY: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      >
        <div className="card-back-pattern">🃏</div>
      </motion.div>
    );
  }

  return (
    <motion.button
      className={`card card-face suit-${card.suit} ${played ? 'card-played' : ''} ${small ? 'card-small' : ''}`}
      style={{ '--suit-color': SUIT_COLORS[card.suit] }}
      onClick={!disabled ? onClick : undefined}
      disabled={disabled}
      whileHover={!disabled ? { y: -12, scale: 1.05 } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
      initial={{ scale: 0, y: 40 }}
      animate={{ scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      aria-label={`${card.value} de ${card.suit}`}
    >
      <span className="card-value-top">{card.value}</span>
      <span className="card-suit-center">{SUIT_SYMBOLS[card.suit]}</span>
      <span className="card-value-bottom">{card.value}</span>
    </motion.button>
  );
}
