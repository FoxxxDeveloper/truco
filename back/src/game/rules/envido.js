const { getEnvidoValue } = require('./cardHierarchy');
const logger = require('../../config/logger');

/**
 * Calculates envido points for a hand of 3 cards.
 * Rules:
 *   - Two cards of same suit: 20 + sum of envido values
 *   - Three of same suit: take highest two + 20
 *   - No pair of same suit: highest single card value
 */
function calculateEnvido(cards) {
  const bySuit = {};
  for (const card of cards) {
    if (!bySuit[card.suit]) bySuit[card.suit] = [];
    bySuit[card.suit].push(getEnvidoValue(card.value));
  }

  let best = 0;
  for (const suit of Object.keys(bySuit)) {
    const vals = bySuit[suit].sort((a, b) => b - a);
    let points;
    if (vals.length >= 2) {
      points = 20 + vals[0] + vals[1];
    } else {
      points = vals[0];
    }
    if (points > best) best = points;
  }

  if (best > 33) {
    logger.warn('calculateEnvido: envido > 33 (invalid hand or duplicate cards in deck)', {
      best,
      cardIds: cards.map(c => (c && c.id) || `${c?.value}_${c?.suit}`),
    });
  }

  return best;
}

/**
 * Cartas mínimas que justifican el tanto de envido (para proof al irse al mazo).
 * - 2+ del mismo palo: las 2 de mayor valor de envido de ese palo (no las 3).
 * - Sin palo repetido: solo la carta de mayor valor de envido.
 */
function getEnvidoProofCards(cards) {
  if (!cards || cards.length === 0) return [];

  const bySuit = {};
  for (const card of cards) {
    const suit = card.suit;
    if (!bySuit[suit]) bySuit[suit] = [];
    bySuit[suit].push({ card, val: getEnvidoValue(card.value) });
  }

  let bestPair = null;
  let bestSingle = null;

  for (const suit of Object.keys(bySuit)) {
    const entries = bySuit[suit].sort((a, b) => b.val - a.val);
    if (entries.length >= 2) {
      const pts = 20 + entries[0].val + entries[1].val;
      if (!bestPair || pts > bestPair.pts) {
        bestPair = { pts, entries: entries.slice(0, 2) };
      }
    }
    const top = entries[0];
    if (top && (!bestSingle || top.val > bestSingle.val)) {
      bestSingle = top;
    }
  }

  if (bestPair) {
    return bestPair.entries.map(e => e.card);
  }
  return bestSingle ? [bestSingle.card] : [];
}

/**
 * Returns true if `newBet` is a valid raise given the current `stack`.
 *
 * Valid chains (any subset of this progression):
 *   envido → envido → real_envido → falta_envido
 *   envido → falta_envido
 *   real_envido → falta_envido
 *   falta_envido  (terminal — no further raises)
 *
 * Rules:
 *  - falta_envido is always valid unless already in stack (terminal)
 *  - real_envido is valid only if stack contains only 'envido' entries (no real/falta)
 *  - envido is valid only if stack has ≤ 1 'envido' entry and nothing else
 *    (first envido starts the chain; second envido repeats once after the first)
 */
function canRaiseEnvido(stack, newBet) {
  if (stack.includes('falta_envido')) return false; // terminal

  if (newBet === 'falta_envido') return true; // always valid before terminal

  if (newBet === 'real_envido') {
    if (stack.includes('real_envido')) return false;   // can't repeat
    return stack.every(b => b === 'envido');            // only after 0..N envido entries
  }

  if (newBet === 'envido') {
    if (stack.includes('real_envido')) return false;   // can't go back
    // Allow first envido (empty stack) or second envido (stack = ['envido'])
    return stack.length <= 1 && stack.every(b => b === 'envido');
  }

  return false;
}

/**
 * Falta Envido (aceptada): puntos que le faltan al oponente del ganador para llegar al objetivo.
 * No usar max(scoreP1, scoreP2).
 */
function getFaltaEnvidoPointsForWinner(winnerId, player1Id, player2Id, scoreP1, scoreP2, pointsToWin = 30) {
  const opponentScore = String(winnerId) === String(player1Id) ? Number(scoreP2) : Number(scoreP1);
  return Math.max(Number(pointsToWin) - opponentScore, 1);
}

/**
 * Resolves envido bet value when the bet is ACCEPTED (except Falta Envido: usar getFaltaEnvidoPointsForWinner tras conocer ganador).
 *
 * Accepted stakes by chain:
 *  ["envido"]                             → 2
 *  ["real_envido"]                        → 3
 *  ["envido","envido"]                    → 4  (2 × 2)
 *  ["envido","real_envido"]               → 5  (2 + 3)
 *  ["envido","envido","real_envido"]      → 7  (4 + 3)
 *  any chain ending in "falta_envido"     → null (calcular con getFaltaEnvidoPointsForWinner)
 */
function getEnvidoStake(betStack, scoreP1, scoreP2, pointsToWin = 30) {
  const last = betStack[betStack.length - 1];

  if (last === 'falta_envido') {
    return null;
  }

  // Count how many 'envido' entries precede the real_envido (or are the entire stack)
  const nEnvido = betStack.filter(b => b === 'envido').length;

  if (last === 'real_envido') return nEnvido * 2 + 3; // e.g. 2*2+3=7 for envido+envido+real
  if (last === 'envido')      return nEnvido * 2;      // e.g. 2*2=4 for envido+envido

  return 1;
}

module.exports = {
  calculateEnvido,
  canRaiseEnvido,
  getEnvidoStake,
  getFaltaEnvidoPointsForWinner,
  getEnvidoProofCards,
};
