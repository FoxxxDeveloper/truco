const { getEnvidoValue } = require('./cardHierarchy');

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

  return best;
}

/**
 * Resolves envido bet value based on announced bets.
 * Returns points at stake.
 *
 * Bet ladder (stacks):
 *  envido           → 2 pts
 *  envido + envido  → 4 pts
 *  real envido      → 3 pts
 *  envido + real    → 5 pts (envido then real)
 *  falta envido     → remaining points to reach 30 (or 1 if target already met)
 *
 * We pass the current accumulated bet value and the new bet type.
 */
const BET_VALUES = {
  envido:       2,
  envido_envido: 4,
  real_envido:  3,
  falta_envido: null, // calculated dynamically
};

function getEnvidoStake(betStack, scoreP1, scoreP2, pointsToWin = 30) {
  const last = betStack[betStack.length - 1];
  const prev = betStack[betStack.length - 2] || null;

  if (last === 'falta_envido') {
    const maxScore = Math.max(scoreP1, scoreP2);
    return Math.max(pointsToWin - maxScore, 1);
  }
  if (last === 'real_envido' && prev === 'envido') return 5;
  if (last === 'real_envido') return 3;
  if (last === 'envido' && prev === 'envido') return 4;
  if (last === 'envido') return 2;

  return 1;
}

module.exports = { calculateEnvido, getEnvidoStake };
