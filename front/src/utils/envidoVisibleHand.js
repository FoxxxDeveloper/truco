/**
 * UI: cartas en "Puntos en mesa" no deben duplicarse en la mano visible.
 * No altera el estado del juego — solo el render.
 */

/** @param {{ id?: string, value?: number, suit?: string } | null | undefined} card */
export function cardStableId(card) {
  if (!card) return '';
  if (card.id) return String(card.id);
  const v = card.value ?? '';
  const s = card.suit ?? '';
  return `${v}_${s}`;
}

/** @param {Array<{ id?: string, value?: number, suit?: string }>} cards */
export function envidoProofCardIdSet(cards) {
  const set = new Set();
  if (!cards?.length) return set;
  for (const c of cards) {
    const id = cardStableId(c);
    if (id) set.add(id);
  }
  return set;
}

/**
 * @param {'self' | 'opponent' | undefined} winnerSide
 * @param {string|number|null|undefined} winnerId
 * @param {string|number} myId
 */
export function envidoProofWinnerSide(winnerSide, winnerId, myId) {
  if (winnerSide === 'self' || winnerSide === 'opponent') return winnerSide;
  if (winnerId == null) return null;
  return Number(winnerId) === Number(myId) ? 'self' : 'opponent';
}

/**
 * Mano local visible: excluye cartas mostradas en Puntos en mesa (solo si yo las mostré).
 * @param {Array<{ id?: string, value?: number, suit?: string }>} hand
 * @param {object | null | undefined} proof envidoProofReveal
 * @param {string|number} myId
 */
export function visibleHandExcludingEnvidoProof(hand, proof, myId) {
  const cards = hand || [];
  if (!proof?.cards?.length) return cards;

  const side = envidoProofWinnerSide(
    proof.winnerSide,
    proof.winnerId ?? proof.playerId,
    myId,
  );
  if (side !== 'self') return cards;

  const proofIds = envidoProofCardIdSet(proof.cards);
  if (!proofIds.size) return cards;

  return cards.filter(c => !proofIds.has(cardStableId(c)));
}

/**
 * Conteo de cartas del rival (dorso): resta las mostradas en Puntos en mesa.
 * @param {number} cardCount opponentCardCount del servidor
 * @param {object | null | undefined} proof
 * @param {string|number} myId
 */
export function visibleOpponentCountExcludingEnvidoProof(cardCount, proof, myId) {
  const count = Number(cardCount) || 0;
  if (!proof?.cards?.length) return count;

  const side = envidoProofWinnerSide(
    proof.winnerSide,
    proof.winnerId ?? proof.playerId,
    myId,
  );
  if (side !== 'opponent') return count;

  return Math.max(0, count - proof.cards.length);
}
