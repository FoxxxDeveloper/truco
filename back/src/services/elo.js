/**
 * ELO rating system
 * K-factor default: 32
 * Initial rating: 1000
 */

const K = parseInt(process.env.ELO_K_FACTOR) || 32;

/**
 * Expected score for playerA against playerB.
 */
function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Calculate new ratings after a match.
 * @param {number} ratingWinner
 * @param {number} ratingLoser
 * @returns {{ newWinner: number, newLoser: number, delta: number }}
 */
function calculateNewRatings(ratingWinner, ratingLoser) {
  const expW = expectedScore(ratingWinner, ratingLoser);
  const expL = expectedScore(ratingLoser, ratingWinner);

  const newWinner = Math.round(ratingWinner + K * (1 - expW));
  const newLoser  = Math.round(ratingLoser  + K * (0 - expL));
  const delta = newWinner - ratingWinner;

  return { newWinner, newLoser, delta };
}

module.exports = { calculateNewRatings, expectedScore };
