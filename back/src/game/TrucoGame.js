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
const { calculateEnvido, canRaiseEnvido, getEnvidoStake } = require('./rules/envido');
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
    const rs = Number(options.reconnectGraceSecs);
    this.config = {
      puntosMaximos: options.puntosMaximos || 30,
      florHabilitada: options.florHabilitada || false,
      modo: options.modo || 'casual',
      reconnectGraceSecs: Number.isFinite(rs) ? Math.min(300, Math.max(30, rs)) : 60,
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
    this.manoResults = [];          // winner playerId per mano, or null (parda)
    this.manoFirst = this.manoPlayer;  // playerId who plays first in this mano (for parda tiebreaks)
    this.waitingForPlayer = null;   // playerId whose turn it is

    // Envido
    this.envidoBetStack = [];
    this.envidoPendingBy = null;           // who announced last envido bet
    this.envidoResolved = false;
    this.envidoWinner = null;
    // Saved when envido is initiated from PLAYER_TURN so we can restore the
    // correct card-play turn after envido resolves, regardless of who raised last.
    this.envidoOriginalTurnPlayer = null;

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
    if (
      this.state === STATES.TRUCO_PENDING ||
      this.state === STATES.ENVIDO_PENDING ||
      this.state === STATES.FLOR_PENDING
    ) {
      return { ok: false, error: 'Hay una respuesta pendiente.' };
    }
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

    // envidoAvailable stays true until mano 0 ends (both cards played).
    // Per Argentine Truco rules: you can call envido as long as you haven't played
    // your own first card in mano 0. The per-player check is in _canPlayerInitiateEnvido.

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

  if (
    this.state === STATES.TRUCO_PENDING &&
    Number(playerId) === Number(this.trucoPendingBy)
  ) {
    return { ok: false, error: 'Hay una respuesta pendiente.' };
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

    if (!canRaiseEnvido(this.envidoBetStack, betType)) {
      return { ok: false, error: 'Esa subida no es válida en esta cadena de envido' };
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

    // Save whose card-play turn it was before envido started (PLAYER_TURN path).
    // This ensures the turn returns to the correct player regardless of how many
    // raises happened — the last envidoPendingBy is not necessarily the turn player.
    if (this.state === STATES.PLAYER_TURN && this.envidoOriginalTurnPlayer === null) {
      this.envidoOriginalTurnPlayer = this.waitingForPlayer;
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
      betStack: [...this.envidoBetStack],
      accepted: false,
      manoPlayerId: this.manoPlayer,
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
    if (
      this.state === STATES.TRUCO_PENDING &&
      Number(playerId) === Number(this.trucoPendingBy)
    ) {
      return { ok: false, error: 'Hay una respuesta pendiente.' };
    }
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

    if (this._cannotTrucoLadderDueToOpeningFourDecisiveMano(playerId)) {
      return { ok: false, error: 'No podés cantar sobre el 4 en una mano decisiva.' };
    }

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
    if (Number(playerId) === Number(this.trucoPendingBy)) {
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
    let pts;
    if (this.trucoAccepted) {
      pts = getTrucoStake(this.trucoBetStack);
    } else if (this.state === STATES.TRUCO_PENDING && this.trucoBetStack.length > 0) {
      pts = getTrucoRejectionStake(this.trucoBetStack);
    } else if (this._isMazoBeforeAnyCardWithEnvidoAvailable(playerId)) {
      pts = 2;
    } else {
      pts = 1;
    }
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
        if (this._cannotTrucoLadderDueToOpeningFourDecisiveMano(playerId)) return false;
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
      this.waitingForPlayer = this._otherPlayer(playerId);
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
    this.waitingForPlayer = this._otherPlayer(playerId);
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
      manoFirst: this.manoFirst,
      manoPlayer: this.manoPlayer,
      waitingForPlayer: this.waitingForPlayer,
      envidoBetStack: this.envidoBetStack,
      envidoResolved: this.envidoResolved,
      envidoWinner: this.envidoWinner,
      envidoAvailable: this.envidoAvailable,
      envidoPendingBy: this.envidoPendingBy,
      envidoOriginalTurnPlayer: this.envidoOriginalTurnPlayer,
      trucoBetStack: this.trucoBetStack,
      trucoAccepted: this.trucoAccepted,
      trucoResolved: this.trucoResolved,
      trucoPendingBy: this.trucoPendingBy,
      pendingTrucoAfterEnvido: this.pendingTrucoAfterEnvido,
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
    const blockedByOpeningFourDecisive = this._cannotTrucoLadderDueToOpeningFourDecisiveMano(playerId);
    return {
      ...this.toJSON(),
      myHand: (this.hands[playerId] || []).map(c => c.toJSON()),
      opponentCardCount: (this.hands[otherPlayer] || []).length,
      trucoBlockedByOpeningFourDecisiveMano: blockedByOpeningFourDecisive,
      trucoBlockedByOpeningFourThirdMano: blockedByOpeningFourDecisive,
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────

  /**
   * Mano actual es la que define la ronda (no confundir con “última mano” en abstracto).
   * Cubre: 2ª tras 1ª parda; 3ª tras dos pardas; 3ª con 1–1 en las dos primeras.
   */
  isCurrentManoDecisive() {
    const r = this.manoResults || [];
    const cm = this.currentMano;
    if (cm === 1 && r.length === 1 && r[0] === null) return true;
    if (cm === 2 && r.length === 2 && r[0] === null && r[1] === null) return true;
    if (
      cm === 2 &&
      r.length === 2 &&
      r[0] != null &&
      r[1] != null &&
      Number(r[0]) !== Number(r[1])
    ) {
      return true;
    }
    return false;
  }

  /**
   * En una mano decisiva: exactamente una carta en la mano actual, jugada por quien abrió (manoFirst), y es un 4.
   */
  _openingLedWithFourInCurrentDecisiveMano() {
    if (!this.isCurrentManoDecisive()) return false;
    const trick = this.playedCards[this.currentMano];
    if (!trick || trick.length !== 1) return false;
    const first = trick[0];
    if (Number(first.playerId) !== Number(this.manoFirst)) return false;
    const v = first?.card?.value;
    return Number(v) === 4;
  }

  /**
   * El rival del abridor no puede cantar Truco / Retruco / Vale 4 después de ver ese 4
   * (solo con una carta jugada en la mano decisiva).
   */
  _cannotTrucoLadderDueToOpeningFourDecisiveMano(playerId) {
    if (!this._openingLedWithFourInCurrentDecisiveMano()) return false;
    const openerId = this.playedCards[this.currentMano][0].playerId;
    return Number(playerId) !== Number(openerId);
  }

  /**
   * Mazo al inicio de la ronda: sin cartas jugadas, sin envido/flor en juego, sin escalera de truco:
   * el rival cobra 1 por la ronda + 1 por envido no jugado (total 2).
   */
  _isMazoBeforeAnyCardWithEnvidoAvailable(playerId) {
    if (this.currentMano !== 0) return false;
    if (this._totalCardsPlayedInRound() !== 0) return false;
    if (this.envidoResolved) return false;
    if (this.envidoBetStack.length > 0) return false;
    if (!this.envidoAvailable) return false;
    if (this.trucoBetStack.length > 0 || this.trucoAccepted) return false;
    if (this.config.florHabilitada && ((this.florState?.betStack?.length || 0) > 0 || this.florState.resolved)) {
      return false;
    }
    return true;
  }

  _totalCardsPlayedInRound() {
    return this.playedCards.reduce((n, mano) => n + mano.length, 0);
  }

  /**
   * Resolución central de ganador de ronda según resultados de manos (incluye pardas).
   * @returns {{ winnerId: number|null, reason: string|null }}
   */
  resolveRoundWinnerFromManos() {
    const r = this.manoResults || [];
    const [p1, p2] = this.players;
    const mp = this.manoPlayer;

    const wins = pid => r.filter(x => x === pid).length;
    const ties = r.filter(x => x === null).length;

    if (r.length === 0 || r.length === 1) {
      return { winnerId: null, reason: null };
    }

    if (r.length === 2) {
      if (wins(p1) === 2) return { winnerId: p1, reason: 'two_wins' };
      if (wins(p2) === 2) return { winnerId: p2, reason: 'two_wins' };
      if (ties === 2) return { winnerId: null, reason: null };
      if (ties === 1) {
        const w = r.find(x => x !== null);
        return { winnerId: w, reason: 'first_win_second_parda_or_first_parda_second_win' };
      }
      if (wins(p1) === 1 && wins(p2) === 1) return { winnerId: null, reason: null };
      return { winnerId: null, reason: null };
    }

    if (r.length === 3) {
      if (wins(p1) >= 2) return { winnerId: p1, reason: 'two_wins' };
      if (wins(p2) >= 2) return { winnerId: p2, reason: 'two_wins' };
      if (wins(p1) > wins(p2)) return { winnerId: p1, reason: 'two_wins' };
      if (wins(p2) > wins(p1)) return { winnerId: p2, reason: 'two_wins' };
      if (wins(p1) === 1 && wins(p2) === 1) {
        if (r[2] === null) return { winnerId: r[0], reason: 'one_each_third_parda_first_winner' };
        return { winnerId: r[2], reason: 'one_each_third_decided' };
      }
      if (ties === 3) return { winnerId: mp, reason: 'three_pardas_mano' };
      const nonNulls = r.filter(x => x !== null);
      if (nonNulls.length === 1) return { winnerId: nonNulls[0], reason: 'single_win_among_pardas' };
      return { winnerId: mp, reason: 'fallback_mano' };
    }

    return { winnerId: null, reason: null };
  }

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
    this.manoFirst = this.manoPlayer; // who opens mano 0
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
    if (roundResult != null) {
      // Round over
      return this._endRound(roundResult);
    }

    // Next mano
    this.currentMano++;
    // Envido is definitely unavailable in mano 1+ (belt-and-suspenders)
    if (!this.envidoResolved) this.envidoAvailable = false;
    // Winner of mano plays first next; tie → same player who opened this mano goes again
    if (manoWinner) {
      this.waitingForPlayer = manoWinner;
    } else {
      this.waitingForPlayer = this.manoFirst;
    }
    // Track who opens next mano (used for tie resolution)
    this.manoFirst = this.waitingForPlayer;
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
   */
  _evaluateRound() {
    const { winnerId } = this.resolveRoundWinnerFromManos();
    return winnerId;
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

  // Restore the card-play turn to whoever had it before envido started.
  // envidoOriginalTurnPlayer is saved in announceEnvido when coming from PLAYER_TURN,
  // so multiple raises (mano→envido, pie raises, mano raises…) don't corrupt the result.
  this.state = STATES.PLAYER_TURN;
  this.waitingForPlayer = this.envidoOriginalTurnPlayer || this.manoPlayer;
}
  _otherPlayer(playerId) {
    return this.players.find(p => p !== playerId);
  }

  _getEnvidoRejectionPts() {
    // Official rejection stakes per the traditional rules:
    //   envido                         → no quiero = 1
    //   real_envido                    → no quiero = 1
    //   falta_envido                   → no quiero = 1
    //   envido + envido                → no quiero = 2
    //   envido + real_envido           → no quiero = 2  (the envido is already "in")
    //   envido + falta_envido          → no quiero = 2
    //   envido + envido + real_envido  → no quiero = 4
    //   envido + envido + falta_envido → no quiero = 4
    //   real_envido + falta_envido     → no quiero = 3  (real_envido already accepted)
    const stack = this.envidoBetStack;
    if (stack.length === 0) return 0;
    if (stack.length === 1) return 1; // any single first bet: rejection = 1

    // For stacks of 2+, points already "committed" before the last raise:
    // The rejector must pay what was already accepted/implied before the final raise.
    const withoutLast = stack.slice(0, -1);
    // Recursively get what the second-to-last state was worth if accepted
    // We use getEnvidoStake on the sub-stack with same scores (scores don't matter here
    // since we only care about non-falta bets for the rejection calculation)
    return getEnvidoStake(withoutLast, 0, 0, this.config.puntosMaximos);
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

  // Argentine Truco reveal rules:
  // Pie (non-mano) always shows their count first.
  // Mano only reveals their count if they won; otherwise says "son buenas".
  const manoId = this.manoPlayer;
  const pieId  = this._otherPlayer(manoId);
  const manoWon = String(winner) === String(manoId);
  const allPts  = { [p1]: pts1, [p2]: pts2 };
  const shownPoints = {
    [String(pieId)]: allPts[pieId],
    ...(manoWon ? { [String(manoId)]: allPts[manoId] } : {}),
  };
  const envidoReveal = {
    manoPlayerId: manoId,
    sonBuenas:    !manoWon,
    shownPoints,
  };

  return {
    ok: true,
    event: 'ENVIDO_RESOLVED',
    winner,
    points: stake,
    betStack: [...this.envidoBetStack],
    accepted: true,
    envidoPoints: { [p1]: pts1, [p2]: pts2 },
    envidoReveal,
    scores: { ...this.scores },
    ...gameOverInfo,
  };
}
}

module.exports = { TrucoGame, STATES };
