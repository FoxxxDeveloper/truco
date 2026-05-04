/**
 * Truco bet resolution rules.
 *
 * Stake ladder:
 *   truco      → 2 pts (1 if rejected)
 *   retruco    → 3 pts (2 if rejected)
 *   vale4      → 4 pts (3 if rejected)
 *
 * A player can only raise after the opponent's last accepted raise (or initial truco).
 */

const TRUCO_LADDER = ['truco', 'retruco', 'vale4'];

/**
 * Returns the current stake value if the bet is accepted or won normally.
 */
function getTrucoStake(betStack) {
  const last = betStack[betStack.length - 1];
  if (last === 'vale4')   return 4;
  if (last === 'retruco') return 3;
  if (last === 'truco')   return 2;
  return 1; // no bet
}

/**
 * Returns points earned if the opponent REJECTS the current bet.
 */
function getTrucoRejectionStake(betStack) {
  const last = betStack[betStack.length - 1];
  if (last === 'vale4')   return 3;
  if (last === 'retruco') return 2;
  if (last === 'truco')   return 1;
  return 0;
}

/**
 * Returns the next allowed raise in the truco ladder.
 * null if already at vale4.
 */
function getNextTrucoBet(betStack) {
  const last = betStack[betStack.length - 1];
  const idx = TRUCO_LADDER.indexOf(last);
  if (idx === -1 || idx === TRUCO_LADDER.length - 1) return null;
  return TRUCO_LADDER[idx + 1];
}

/**
 * Validates whether a player can make a truco bet.
 * - truco can only be bet once (unless raising)
 * - retruco requires truco was accepted or is being raised
 * - vale4 requires retruco
 */
function canBetTruco(betType, betStack, pendingBetBy, currentPlayer) {
  // No pending bet: can only start with 'truco'
  if (betStack.length === 0) return betType === 'truco';

  const last = betStack[betStack.length - 1];
  const lastIdx = TRUCO_LADDER.indexOf(last);
  const newIdx = TRUCO_LADDER.indexOf(betType);

  // Must raise by exactly one step
  if (newIdx !== lastIdx + 1) return false;

  // Can only raise if there is a pending bet (i.e., you are responding)
  if (!pendingBetBy) return false;
  if (pendingBetBy === currentPlayer) return false; // can't raise own bet

  return true;
}

module.exports = { getTrucoStake, getTrucoRejectionStake, getNextTrucoBet, canBetTruco, TRUCO_LADDER };
