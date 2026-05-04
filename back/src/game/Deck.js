const { SUITS, VALUES } = require('./rules/cardHierarchy');

class Card {
  constructor(value, suit) {
    this.value = value;
    this.suit = suit;
    this.id = `${value}_${suit}`;
  }

  toJSON() {
    return { value: this.value, suit: this.suit, id: this.id };
  }
}

class Deck {
  constructor() {
    this.cards = [];
    for (const suit of SUITS) {
      for (const value of VALUES) {
        this.cards.push(new Card(value, suit));
      }
    }
  }

  shuffle() {
    // Fisher-Yates
    const arr = this.cards;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  deal(n) {
    return this.cards.splice(0, n);
  }
}

module.exports = { Card, Deck };
