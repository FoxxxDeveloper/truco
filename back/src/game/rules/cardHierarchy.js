/**
 * Card hierarchy for Argentine Truco (highest = 1, lowest = 14)
 * Baraja española de 40 cartas (sin 8 ni 9)
 */

// Suits: espada, basto, oro, copa
const SUITS = ['espada', 'basto', 'oro', 'copa'];
const VALUES = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]; // 8 and 9 removed

/**
 * Returns the truco power rank of a card (lower number = stronger card).
 * Returns null for invalid cards.
 */
function getCardPower(value, suit) {
  // Special cards
  if (value === 1 && suit === 'espada') return 1;  // Ancho de espada - highest
  if (value === 1 && suit === 'basto')  return 2;  // Ancho de basto
  if (value === 7 && suit === 'espada') return 3;  // 7 de espada
  if (value === 7 && suit === 'oro')    return 4;  // 7 de oro
  if (value === 3)                      return 5;  // 3 (all suits)
  if (value === 2)                      return 6;  // 2 (all suits)
  if (value === 1)                      return 7;  // Anchos falsos (oro, copa)
  if (value === 12)                     return 8;
  if (value === 11)                     return 9;
  if (value === 10)                     return 10;
  if (value === 7)                      return 11; // 7 restantes (basto, copa)
  if (value === 6)                      return 12;
  if (value === 5)                      return 13;
  if (value === 4)                      return 14; // lowest
  return null;
}

/**
 * Returns the envido point value of a card.
 * Figures (10,11,12) = 0 points. Others = face value.
 */
function getEnvidoValue(value) {
  if (value >= 10) return 0;
  return value;
}

/**
 * Compares two cards for truco.
 * Returns 1 if cardA wins, -1 if cardB wins, 0 if tie.
 */
function compareCards(cardA, cardB) {
  const powerA = getCardPower(cardA.value, cardA.suit);
  const powerB = getCardPower(cardB.value, cardB.suit);
  if (powerA < powerB) return 1;   // A wins (lower rank = stronger)
  if (powerA > powerB) return -1;  // B wins
  return 0;                        // tie (parda)
}

module.exports = { SUITS, VALUES, getCardPower, getEnvidoValue, compareCards };
