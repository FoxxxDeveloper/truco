/**
 * TrucoGame — Authoritative server-side game state machine
 * for 2-player Argentine Truco.
 *
 * States:
 *   WAITING       → waiting for both players
 *   DEALING       → distributing cards (brief)
 *   PLAYER_TURN   → a player must play a card or make a bet
 *   ENVIDO_PENDING → waiting for envido response
 *   TRUCO_PENDING  → waiting for truco response
 *   RESOLVING_HAND → determining winner of a mano
 *   END_ROUND      → round over, updating scores
 *   GAME_OVER      → game finished (30 pts)
 */

const { Deck } = require('./Deck');
const { compareCards, getCardPower } = require('./rules/cardHierarchy');
const { calculateEnvido, getEnvidoStake } = require('./rules/envido');
const {
  getTrucoStake,
  getTrucoRejectionStake,
  getNextTrucoBet,
  canBetTruco,
  TRUCO_LADDER,
} = require('./rules/truco');
const {
  hasFlor,
  calculateFlor,
  getFlorStake,
  getFlorRejectionStake,
  FLOR_LADDER,
} = require('./rules/flor');

const STATES = {
  WAITING: 'WAITING',
  DEALING: 'DEALING',
  PLAYER_TURN: 'PLAYER_TURN',
  ENVIDO_PENDING: 'ENVIDO_PENDING',
  TRUCO_PENDING: 'TRUCO_PENDING',
  FLOR_PENDING: 'FLOR_PENDING',
  RESOLVING_HAND: 'RESOLVING_HAND',
  END_ROUND: 'END_ROUND',
  GAME_OVER: 'GAME_OVER',
};

class TrucoGame {
  constructor(roomId, player1Id, player2Id, options = {}) {
    this.roomId = roomId;
    this.players = [player1Id, player2Id]; // [0] = mano (dealer turn)
    this.state = STATES.WAITING;

    // Game configuration
    this.config = {
      puntosMaximos: options.puntosMaximos || 30,
      florHabilitada: options.florHabilitada || false,
      modo: options.modo || 'casual',
    };

    // Scores (global, across all rounds)
    this.scores = { [player1Id]: 0, [player2Id]: 0 };

    // Per-round state
    this._initRound();
  }

  // ─── Initialization ───────────────────────────────────────────────

  _initRound() {
    this.hands = { [this.players[0]]: [], [this.players[1]]: [] };
    this.playedCards = [[], [], []]; // 3 manos, each [{playerId, card}]
    this.currentMano = 0;           // 0, 1, 2
    this.manoResults = [];          // 'p1' | 'p2' | 'tie'
    this.manoFirst = 0;             // index in this.players who plays first this mano
    this.waitingForPlayer = null;   // playerId whose turn it is

    // Envido
    this.envidoBetStack = [];
    this.envidoPendingBy = null;    // who announced last envido bet
    this.envidoResolved = false;
    this.envidoWinner = null;

    // Truco
    this.trucoBetStack = [];
    this.trucoPendingBy = null;     // who announced last truco bet waiting for response
    this.trucoAccepted = false;
    this.trucoResolved = false;
// If Envido is sung while Truco is pending, we store the pending Truco here
// and restore it after Envido is resolved.
this.pendingTrucoAfterEnvido = null;
    // Indicates if envido can still be sung (before first card played)
    this.envidoAvailable = true;

    // Who is "mano" this round (plays first) — alternates each round
    this.manoPlayer = this.players[0];

    // Flor (only relevant when config.florHabilitada is true)
    this.florState = {
      p1HasFlor: false,
      p2HasFlor: false,
      betStack: [],
      pendingBy: null,
      resolved: false,
      winner: null,
    };
  }

  // ─── Public API ───────────────────────────────────────────────────

  addPlayer(playerId) {
    if (!this.players.includes(playerId)) return { ok: false, error: 'Not in this game' };
    if (this.players.length === 2 && this.state === STATES.WAITING) {
      this._startRound();
    }
    return { ok: true };
  }

  startGame() {
    if (this.state !== STATES.WAITING) return { ok: false, error: 'Already started' };
    this._startRound();
    return { ok: true };
  }

  /**
   * Play a card from a player's hand.
   */
  playCard(playerId, cardId) {
    if (this.state !== STATES.PLAYER_TURN) {
      return { ok: false, error: 'Not in play phase' };
    }
    if (this.waitingForPlayer !== playerId) {
      return { ok: false, error: 'Not your turn' };
    }

    const hand = this.hands[playerId];
    const cardIdx = hand.findIndex(c => c.id === cardId);
    if (cardIdx === -1) {
      return { ok: false, error: 'Card not in hand' };
    }

    const card = hand.splice(cardIdx, 1)[0];
    this.playedCards[this.currentMano].push({ playerId, card });

    // Mark envido as no longer available after first card in mano 0
   

    const manoCards = this.playedCards[this.currentMano];

    // If both players have played their card this mano
    if (manoCards.length === 2) {
      return this._resolveMano();
    }

    // Waiting for the other player
    const otherPlayer = this._otherPlayer(playerId);
    this.waitingForPlayer = otherPlayer;
    return { ok: true, event: 'CARD_PLAYED', waitingFor: otherPlayer };
  }

  /**
   * Announce an envido bet.
   * betType: 'envido' | 'real_envido' | 'falta_envido'
   */
  announceEnvido(playerId, betType) {
  if (!['envido', 'real_envido', 'falta_envido'].includes(betType)) {
    return { ok: false, error: 'Invalid bet type' };
  }

  if (this.envidoResolved) {
    return { ok: false, error: 'Envido already resolved' };
  }

  if (!this.envidoAvailable) {
    return { ok: false, error: 'Envido no longer available' };
  }

  if (
    this.state !== STATES.PLAYER_TURN &&
    this.state !== STATES.ENVIDO_PENDING &&
    this.state !== STATES.TRUCO_PENDING
  ) {
    return { ok: false, error: 'Cannot announce envido now' };
  }

  // If envido is pending, only the OTHER player can respond with a raise.
  // Raising/answering an already-pending envido is allowed even if that player already played,
  // because the envido was already opened legally.
  if (this.state === STATES.ENVIDO_PENDING) {
    if (Number(playerId) === Number(this.envidoPendingBy)) {
      return { ok: false, error: 'Waiting for other player to respond' };
    }

    const ENVIDO_LADDER = ['envido', 'real_envido', 'falta_envido'];
    const lastIdx = ENVIDO_LADDER.indexOf(this.envidoBetStack[this.envidoBetStack.length - 1]);
    const newIdx = ENVIDO_LADDER.indexOf(betType);

    if (newIdx <= lastIdx) {
      return { ok: false, error: 'Must raise higher than current bet' };
    }
  } else {
    const canEnvidoOnTurn =
      this.state === STATES.PLAYER_TURN &&
      Number(this.waitingForPlayer) === Number(playerId) &&
      this._canPlayerInitiateEnvido(playerId);

    const canEnvidoBeforeAnsweringTruco =
      this.state === STATES.TRUCO_PENDING &&
      Number(this.trucoPendingBy) !== Number(playerId) &&
      this._canPlayerInitiateEnvido(playerId);

    if (!canEnvidoOnTurn && !canEnvidoBeforeAnsweringTruco) {
      return { ok: false, error: 'No podés cantar envido ahora' };
    }

    // If the player sings Envido while Truco is pending,
    // save the Truco pending state to restore it after Envido is resolved.
    if (this.state === STATES.TRUCO_PENDING) {
      this.pendingTrucoAfterEnvido = {
        trucoPendingBy: this.trucoPendingBy,
        waitingForPlayer: this.waitingForPlayer,
        trucoBetStack: [...this.trucoBetStack],
      };
    }
  }

  this.envidoBetStack.push(betType);
  this.envidoPendingBy = playerId;
  this.state = STATES.ENVIDO_PENDING;
  this.waitingForPlayer = this._otherPlayer(playerId);

  return {
    ok: true,
    event: 'ENVIDO_ANNOUNCED',
    betType,
    by: playerId,
    respondingPlayer: this._otherPlayer(playerId),
  };
}

  /**
   * Respond to envido: 'accept' | 'reject'
   */
  respondEnvido(playerId, response) {
  if (this.state !== STATES.ENVIDO_PENDING) {
    return { ok: false, error: 'No envido pending' };
  }

  if (Number(playerId) === Number(this.envidoPendingBy)) {
    return { ok: false, error: 'You announced this bet, wait for opponent' };
  }

  if (response === 'accept') {
    return this._resolveEnvido(true);
  }

  if (response === 'reject') {
    const rejectionPts =
      this.envidoBetStack.length === 1
        ? 1
        : this._getEnvidoRejectionPts();

    this.envidoResolved = true;
    this.envidoWinner = this.envidoPendingBy;
    this.scores[this.envidoPendingBy] += rejectionPts;

    const gameOverInfo = this._checkGameOver();

    if (!gameOverInfo.gameOver) {
      this._restorePendingTrucoAfterEnvidoOrPlayerTurn();
    }

    return {
      ok: true,
      event: 'ENVIDO_REJECTED',
      winner: this.envidoPendingBy,
      points: rejectionPts,
      scores: { ...this.scores },
      ...gameOverInfo,
    };
  }

  return { ok: false, error: 'Invalid response' };
}

  /**
   * Announce a truco bet.
   * betType: 'truco' | 'retruco' | 'vale4'
   */
  announceTruco(playerId, betType) {
    if (!TRUCO_LADDER.includes(betType)) {
      return { ok: false, error: 'Invalid truco bet' };
    }
    if (this.trucoResolved) return { ok: false, error: 'Truco already resolved' };
    if (this.state !== STATES.PLAYER_TURN && this.state !== STATES.TRUCO_PENDING) {
      return { ok: false, error: 'Cannot announce truco now' };
    }

    // Fresh truco call must come from the current turn player
    if (this.state === STATES.PLAYER_TURN && this.trucoBetStack.length === 0) {
      if (this.waitingForPlayer !== playerId) {
        return { ok: false, error: 'Not your turn to sing truco' };
      }
    }

    const valid = canBetTruco(betType, this.trucoBetStack, this.trucoPendingBy, playerId);
    if (!valid) return { ok: false, error: 'Invalid truco bet sequence' };

    // Cannot call initial Truco on the last mano holding only a 4 (power 14 = lowest)
    if (this.currentMano === 2 && this.trucoBetStack.length === 0 && betType === 'truco') {
      const hand = this.hands[playerId];
      if (hand && hand.length === 1 && getCardPower(hand[0].value, hand[0].suit) === 14) {
        return { ok: false, error: 'No podés cantar Truco con solo el 4 en la última mano' };
      }
    }

   this.trucoBetStack.push(betType);
this.trucoPendingBy = playerId;
this.state = STATES.TRUCO_PENDING;
this.waitingForPlayer = this._otherPlayer(playerId);
    return {
      ok: true,
      event: 'TRUCO_ANNOUNCED',
      betType,
      by: playerId,
      respondingPlayer: this._otherPlayer(playerId),
    };
  }

  /**
   * Respond to truco: 'accept' | 'reject' | 'raise' (raise = announce next level)
   */
  respondTruco(playerId, response) {
    if (this.state !== STATES.TRUCO_PENDING) {
      return { ok: false, error: 'No truco pending' };
    }
    if (playerId === this.trucoPendingBy) {
      return { ok: false, error: 'You announced this bet, wait for opponent' };
    }

    if (response === 'accept') {
      this.trucoAccepted = true;
      this.state = STATES.PLAYER_TURN;
      const stake = getTrucoStake(this.trucoBetStack);
      return {
        ok: true,
        event: 'TRUCO_ACCEPTED',
        stake,
        waitingFor: this.waitingForPlayer,
      };
    }

    if (response === 'reject') {
      const pts = getTrucoRejectionStake(this.trucoBetStack);
      this.trucoResolved = true;
      this.scores[this.trucoPendingBy] += pts;
      this.state = STATES.END_ROUND;
      return {
        ok: true,
        event: 'TRUCO_REJECTED',
        winner: this.trucoPendingBy,
        points: pts,
        nextState: this._checkGameOver(),
      };
    }

    return { ok: false, error: 'Invalid response' };
  }

  /**
   * Irse al mazo: player surrenders the round.
   */
  irseAlMazo(playerId) {
    if (this.state !== STATES.PLAYER_TURN && this.state !== STATES.TRUCO_PENDING) {
      return { ok: false, error: 'Cannot fold now' };
    }
    const winner = this._otherPlayer(playerId);
    const pts = this.trucoAccepted ? getTrucoStake(this.trucoBetStack) : 1;
    this.scores[winner] += pts;
    this.trucoResolved = true;
    this.state = STATES.END_ROUND;
    return {
      ok: true,
      event: 'IRSE_AL_MAZO',
      winner,
      points: pts,
      nextState: this._checkGameOver(),
    };
  }

  /**
   * Prepare next round. Returns true if game should continue.
   */
  nextRound() {
    if (this.state !== STATES.END_ROUND) return { ok: false };
    const go = this._checkGameOver();
    if (go.gameOver) return { ok: true, gameOver: true, winner: go.winner };

    // Swap mano player
    this.players.reverse();
    this._initRound();
    this._startRound();
    return { ok: true, gameOver: false };
  }

  // ─── Permission guard ──────────────────────────────────────────────

  /**
   * Returns true if `playerId` is currently allowed to perform `action`.
   * Call this before each action handler for an early authoritative check.
   *
   * actions: 'playCard' | 'envido' | 'real_envido' | 'falta_envido' |
   *          'respondEnvido' | 'truco' | 'respondTruco' |
   *          'irseAlMazo' | 'nextRound' | 'flor' | 'respondFlor'
   */
  canPlayerAct(playerId, action) {
    const isMyTurn = this.waitingForPlayer === playerId;

    switch (action) {
      case 'playCard':
        return this.state === STATES.PLAYER_TURN && isMyTurn;

     case 'envido':
case 'real_envido':
case 'falta_envido':
  if (!this.envidoAvailable || this.envidoResolved) return false;

  if (this.state === STATES.ENVIDO_PENDING) {
    return Number(playerId) !== Number(this.envidoPendingBy);
  }

  if (this.state === STATES.TRUCO_PENDING) {
    return (
      Number(playerId) !== Number(this.trucoPendingBy) &&
      this._canPlayerInitiateEnvido(playerId)
    );
  }

  return (
    this.state === STATES.PLAYER_TURN &&
    isMyTurn &&
    this._canPlayerInitiateEnvido(playerId)
  );

      case 'respondEnvido':
        return this.state === STATES.ENVIDO_PENDING && playerId !== this.envidoPendingBy;

      case 'truco':
        if (this.trucoResolved) return false;
        if (this.state === STATES.TRUCO_PENDING) return playerId !== this.trucoPendingBy;
        return this.state === STATES.PLAYER_TURN && isMyTurn;

      case 'respondTruco':
        return this.state === STATES.TRUCO_PENDING && playerId !== this.trucoPendingBy;

      case 'irseAlMazo':
        return (this.state === STATES.PLAYER_TURN || this.state === STATES.TRUCO_PENDING) && isMyTurn;

      case 'nextRound':
        return this.state === STATES.END_ROUND;

      case 'flor':
        if (!this.config.florHabilitada || this.florState.resolved) return false;
        if (this.state === STATES.FLOR_PENDING) return playerId !== this.florState.pendingBy;
        return this.state === STATES.PLAYER_TURN && isMyTurn;

      case 'respondFlor':
        return this.state === STATES.FLOR_PENDING && playerId !== this.florState.pendingBy;

      default:
        return false;
    }
  }

  // ─── Flor ─────────────────────────────────────────────────────────

  /**
   * Announce flor or raise with contraflor / contraflor al resto.
   * Only the current turn player can initiate; opponent raises in FLOR_PENDING.
   */
  announceFlor(playerId) {
    if (!this.config.florHabilitada) {
      return { ok: false, error: 'Flor is not enabled in this game' };
    }
    if (this.florState.resolved) return { ok: false, error: 'Flor already resolved' };

    const idx = this.players.indexOf(playerId);
    if (idx === -1) return { ok: false, error: 'Not a player in this game' };
    const playerHasFlor = idx === 0 ? this.florState.p1HasFlor : this.florState.p2HasFlor;
    if (!playerHasFlor) return { ok: false, error: 'You do not have flor' };

    if (this.state === STATES.FLOR_PENDING) {
      // Opponent raising
      if (playerId === this.florState.pendingBy) {
        return { ok: false, error: 'Waiting for opponent to respond to your flor' };
      }
      const lastIdx = FLOR_LADDER.indexOf(this.florState.betStack[this.florState.betStack.length - 1]);
      const nextBet = FLOR_LADDER[lastIdx + 1];
      if (!nextBet) return { ok: false, error: 'Cannot raise further' };
      this.florState.betStack.push(nextBet);
      this.florState.pendingBy = playerId;
      return {
        ok: true,
        event: 'FLOR_RAISED',
        betType: nextBet,
        by: playerId,
        respondingPlayer: this._otherPlayer(playerId),
      };
    }

    if (this.state !== STATES.PLAYER_TURN) {
      return { ok: false, error: 'Cannot announce flor now' };
    }
    if (this.waitingForPlayer !== playerId) {
      return { ok: false, error: 'Not your turn to sing flor' };
    }

    this.florState.betStack.push('flor');
    this.florState.pendingBy = playerId;

    // If opponent has no flor, announcer wins automatically
    const opponentIdx = idx === 0 ? 1 : 0;
    const opponentHasFlor = opponentIdx === 0 ? this.florState.p1HasFlor : this.florState.p2HasFlor;
    if (!opponentHasFlor) {
      return this._resolveFlor(playerId, 3);
    }

    this.state = STATES.FLOR_PENDING;
    return {
      ok: true,
      event: 'FLOR_ANNOUNCED',
      by: playerId,
      respondingPlayer: this._otherPlayer(playerId),
    };
  }

  /**
   * Respond to a flor bet: 'accept' (compare values) | 'reject' (announcer wins rejection stake).
   */
  respondFlor(playerId, response) {
    if (this.state !== STATES.FLOR_PENDING) {
      return { ok: false, error: 'No flor pending' };
    }
    if (playerId === this.florState.pendingBy) {
      return { ok: false, error: 'You announced flor — wait for opponent' };
    }

    if (response === 'accept') {
      const p1 = this.players[0];
      const p2 = this.players[1];
      const v1 = calculateFlor(this.hands[p1]);
      const v2 = calculateFlor(this.hands[p2]);
      let winner;
      if (v1 > v2) winner = p1;
      else if (v2 > v1) winner = p2;
      else winner = this.manoPlayer; // tie → mano player
      const stake = getFlorStake(
        this.florState.betStack,
        this.scores[p1],
        this.scores[p2],
        this.config.puntosMaximos
      );
      return this._resolveFlor(winner, stake, { florPoints: { [p1]: v1, [p2]: v2 } });
    }

    if (response === 'reject') {
      const pts = getFlorRejectionStake(this.florState.betStack);
      return this._resolveFlor(this.florState.pendingBy, pts);
    }

    return { ok: false, error: 'Invalid response — use accept or reject' };
  }

  // ─── Serialization ────────────────────────────────────────────────

  /**
   * Full snapshot for reconnection or initial sync.
   */
  toJSON() {
    return {
      roomId: this.roomId,
      state: this.state,
      players: this.players,
      scores: this.scores,
      currentMano: this.currentMano,
      manoResults: this.manoResults,
      waitingForPlayer: this.waitingForPlayer,
      envidoBetStack: this.envidoBetStack,
      envidoResolved: this.envidoResolved,
      envidoWinner: this.envidoWinner,
      trucoBetStack: this.trucoBetStack,
      trucoAccepted: this.trucoAccepted,
      trucoResolved: this.trucoResolved,
      trucoPendingBy: this.trucoPendingBy,
      envidoPendingBy: this.envidoPendingBy,
      envidoAvailable: this.envidoAvailable,
      playedCards: this.playedCards.map(mano =>
        mano.map(e => ({ playerId: e.playerId, card: e.card.toJSON() }))
      ),
      config: this.config,
      florState: this.config.florHabilitada ? { ...this.florState } : undefined,
    };
  }

  /**
   * Player-specific view (hides opponent's hand).
   */
  getPlayerView(playerId) {
    const otherPlayer = this._otherPlayer(playerId);
    return {
      ...this.toJSON(),
      myHand: (this.hands[playerId] || []).map(c => c.toJSON()),
      opponentCardCount: (this.hands[otherPlayer] || []).length,
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────

  _startRound() {
    this.state = STATES.DEALING;
    const deck = new Deck();
    deck.shuffle();
    this.hands[this.players[0]] = deck.deal(3);
    this.hands[this.players[1]] = deck.deal(3);

    // Flor detection
    if (this.config.florHabilitada) {
      this.florState.p1HasFlor = hasFlor(this.hands[this.players[0]]);
      this.florState.p2HasFlor = hasFlor(this.hands[this.players[1]]);
    }

    this.state = STATES.PLAYER_TURN;
    this.waitingForPlayer = this.manoPlayer;
  }

  _resolveMano() {
    const manoCards = this.playedCards[this.currentMano];
    const [a, b] = manoCards;
    const cmp = compareCards(a.card, b.card);

    let manoWinner;
    if (cmp > 0) manoWinner = a.playerId;
    else if (cmp < 0) manoWinner = b.playerId;
    else manoWinner = null; // tie (parda)

    this.manoResults.push(manoWinner);

    const roundResult = this._evaluateRound();
    if (roundResult) {
      // Round over
      return this._endRound(roundResult);
    }

    // Next mano
    this.currentMano++;
    // Winner of mano plays first next; tie → same order
    this.waitingForPlayer = manoWinner || this.waitingForPlayer;
    this.state = STATES.PLAYER_TURN;

    return {
      ok: true,
      event: 'MANO_RESOLVED',
      manoWinner,
      manoNumber: this.currentMano - 1,
      manoResults: this.manoResults,
    };
  }

  /**
   * Evaluates if enough manos have been played to decide a round winner.
   * Returns playerId if decided, null if undecided.
   *
   * Rules:
   *  - Win 2 manos → win round
   *  - Mano 0 tie + win mano 1 → win round
   *  - Both manos tie → mano player (player who dealt last) wins
   *  - Mano 0 win + mano 1 loss + mano 2 → winner of mano 2
   */
  _evaluateRound() {
    const r = this.manoResults;
    const [p1, p2] = this.players;

    const wins = (pid) => r.filter(x => x === pid).length;
    const ties = r.filter(x => x === null).length;

    // After 1st mano
    if (r.length === 1) {
      // Can't decide yet
      return null;
    }

    // After 2nd mano
    if (r.length === 2) {
      if (wins(p1) === 2) return p1;
      if (wins(p2) === 2) return p2;
      if (ties === 2) return this.manoPlayer; // both tied → mano player
      if (ties === 1) {
        // one tie, one win → winner of non-tied mano wins
        const winner = r.find(x => x !== null);
        return winner || null;
      }
      // split: one each → play 3rd mano
      return null;
    }

    // After 3rd mano
    if (r.length === 3) {
      if (wins(p1) > wins(p2)) return p1;
      if (wins(p2) > wins(p1)) return p2;
      // all tied or 1-1-1 split → mano player wins
      return this.manoPlayer;
    }

    return null;
  }

  _endRound(winnerId) {
    const trucoStake = this.trucoAccepted ? getTrucoStake(this.trucoBetStack) : 1;
    this.trucoResolved = true;
    this.scores[winnerId] += trucoStake;
    this.state = STATES.END_ROUND;

    const gameOverInfo = this._checkGameOver();
    return {
      ok: true,
      event: 'ROUND_OVER',
      roundWinner: winnerId,
      trucoPoints: trucoStake,
      scores: { ...this.scores },
      ...gameOverInfo,
    };
  }

  _resolveFlor(winnerId, pts, extra = {}) {
    this.florState.resolved = true;
    this.florState.winner = winnerId;
    this.scores[winnerId] += pts;
    this.state = STATES.PLAYER_TURN;
    const gameOverInfo = this._checkGameOver();
    return {
      ok: true,
      event: 'FLOR_RESOLVED',
      winner: winnerId,
      points: pts,
      scores: { ...this.scores },
      ...extra,
      ...gameOverInfo,
    };
  }

  _checkGameOver() {
    for (const pid of this.players) {
      if (this.scores[pid] >= this.config.puntosMaximos) {
        this.state = STATES.GAME_OVER;
        return { gameOver: true, winner: pid };
      }
    }
    return { gameOver: false };
  }
_playerAlreadyPlayedInCurrentMano(playerId) {
  const currentMano = this.currentMano ?? 0;
  const cards = this.playedCards?.[currentMano] || [];

  return cards.some((played) => Number(played.playerId) === Number(playerId));
}

_canPlayerInitiateEnvido(playerId) {
  // Envido can only be initiated during the first mano of the round.
  if (this.currentMano !== 0) return false;

  // Cannot initiate Envido after already playing your first card.
  if (this._playerAlreadyPlayedInCurrentMano(playerId)) return false;

  // Already resolved or disabled.
  if (this.envidoResolved || !this.envidoAvailable) return false;

  return true;
}

_restorePendingTrucoAfterEnvidoOrPlayerTurn() {
  if (this.pendingTrucoAfterEnvido) {
    this.trucoPendingBy = this.pendingTrucoAfterEnvido.trucoPendingBy;
    this.waitingForPlayer = this.pendingTrucoAfterEnvido.waitingForPlayer;
    this.trucoBetStack = [...this.pendingTrucoAfterEnvido.trucoBetStack];
    this.pendingTrucoAfterEnvido = null;
    this.state = STATES.TRUCO_PENDING;
    return;
  }

  this.state = STATES.PLAYER_TURN;

  // If nobody is waiting for some reason, fallback to mano player.
  if (!this.waitingForPlayer) {
    this.waitingForPlayer = this.manoPlayer;
  }
}
  _otherPlayer(playerId) {
    return this.players.find(p => p !== playerId);
  }

  _getEnvidoRejectionPts() {
    // When rejecting after envido was already called once, rejector loses previous stake
    const stack = this.envidoBetStack;
    if (stack.length === 0) return 0;
    // One envido: lose 1. envido+envido announced: lose 2. etc.
    const lastTwoBets = stack.slice(-2);
    if (lastTwoBets[lastTwoBets.length - 1] === 'falta_envido') return stack.length > 1 ? 2 : 1;
    if (lastTwoBets[lastTwoBets.length - 1] === 'real_envido') return stack.length > 1 ? 3 : 2;
    return 1;
  }

  _resolveEnvido(accepted) {
  if (!accepted) return this.respondEnvido;

  const stake = getEnvidoStake(
    this.envidoBetStack,
    this.scores[this.players[0]],
    this.scores[this.players[1]],
    this.config.puntosMaximos
  );

  const p1 = this.players[0];
  const p2 = this.players[1];

  const pts1 = calculateEnvido(this.hands[p1]);
  const pts2 = calculateEnvido(this.hands[p2]);

  let winner;

  if (pts1 > pts2) {
    winner = p1;
  } else if (pts2 > pts1) {
    winner = p2;
  } else {
    winner = this.manoPlayer;
  }

  this.envidoResolved = true;
  this.envidoWinner = winner;
  this.scores[winner] += stake;

  const gameOverInfo = this._checkGameOver();

  if (!gameOverInfo.gameOver) {
    this._restorePendingTrucoAfterEnvidoOrPlayerTurn();
  }

  return {
    ok: true,
    event: 'ENVIDO_RESOLVED',
    winner,
    points: stake,
    envidoPoints: { [p1]: pts1, [p2]: pts2 },
    scores: { ...this.scores },
    ...gameOverInfo,
  };
}
}

module.exports = { TrucoGame, STATES };
