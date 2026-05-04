/**
 * Flor rules for Argentine Truco
 * Flor = all 3 dealt cards belonging to the same suit.
 *
 * Bet ladder: flor → contraflor → contraflor_al_resto
 */

const { getEnvidoValue } = require('./cardHierarchy');

// ── Detection ────────────────────────────────────────────────────────────────

/**
 * Returns true when all 3 cards share the same suit.
 * Accepts both Card instances (with `.suit`) and plain objects.
 */
function hasFlor(cards) {
  if (!cards || cards.length !== 3) return false;
  return cards[0].suit === cards[1].suit && cards[1].suit === cards[2].suit;
}

/**
 * Flor strength = sum of envido values + 20.
 * Used to resolve ties when both players have flor.
 */
function calculateFlor(cards) {
  return 20 + cards.reduce((sum, c) => sum + getEnvidoValue(c.value), 0);
}

// ── Bet ladder ───────────────────────────────────────────────────────────────

const FLOR_LADDER = ['flor', 'contraflor', 'contraflor_al_resto'];

/**
 * Points the winner earns when flor is accepted or compared.
 * @param {string[]} betStack   Current bet history
 * @param {number}   scoreP1
 * @param {number}   scoreP2
 * @param {number}   pointsToWin
 */
function getFlorStake(betStack, scoreP1, scoreP2, pointsToWin = 30) {
  const last = betStack[betStack.length - 1];
  if (!last) return 0;
  if (last === 'contraflor_al_resto') {
    return Math.max(pointsToWin - Math.max(scoreP1, scoreP2), 1);
  }
  if (last === 'contraflor') return 6;
  if (last === 'flor')       return 3;
  return 0;
}

/**
 * Points the announcer earns when their flor bet is rejected.
 * @param {string[]} betStack
 */
function getFlorRejectionStake(betStack) {
  const last = betStack[betStack.length - 1];
  if (!last) return 0;
  if (last === 'contraflor_al_resto') return 6;
  if (last === 'contraflor')          return 3;
  if (last === 'flor')                return 2;
  return 0;
}

module.exports = { hasFlor, calculateFlor, getFlorStake, getFlorRejectionStake, FLOR_LADDER };
