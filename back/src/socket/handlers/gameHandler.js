const gameSession       = require('../../services/gameSession');
const { calculateNewRatings } = require('../../services/elo');
const Game              = require('../../models/Game');
const Ranking           = require('../../models/Ranking');
const matchmaking       = require('../../services/matchmaking');
const BattleService     = require('../../services/battleService');
const TournamentService = require('../../services/tournamentService');
const NotificationService = require('../../services/notificationService');
const logger            = require('../../config/logger');
const { securityLog }   = require('../../config/logger');
const { query }         = require('../../config/database');
const {
  isValidRoomId,
  isValidCardId,
  isValidBetType,
  isValidResponse,
} = require('../../middleware/errorHandler');

// ── Disconnection state ────────────────────────────────────────────────────────
// userId → roomId: tracks which active game each player is in
const userRooms = new Map();
// `${roomId}:${userId}` → TimeoutHandle: fires when grace period expires
const disconnectTimers = new Map();

const ABANDON_GRACE_MS = 60_000; // 60 s grace period before auto-abandon

// ── Turn timeout state ─────────────────────────────────────────────────────────
// `${roomId}:turn` → TimeoutHandle
const turnTimers = new Map();
const TURN_TIMEOUT_MS        = 30_000; // 30 s to play a card
const BET_RESPONSE_TIMEOUT_MS = 20_000; // 20 s to respond to truco/envido

const AUTO_ROUND_DELAY_MS = 2500; // 2.5 s pause before auto-starting next round

/**
 * Emits updated game views to both players in a room.
 * Uses per-socket direct delivery (O(n)) instead of fetchSockets O(n²).
 */
function broadcastGameState(io, roomId, game) {
  // Build a map: userId → computed view (avoid computing twice)
  const views = {};
  for (const pid of game.players) {
    views[pid] = game.getPlayerView(pid);
  }
  // Emit to every socket in the room; each socket delivers its own view
  io.in(roomId).fetchSockets().then(sockets => {
    for (const s of sockets) {
      const pid = s.data?.user?.id;
      if (pid && views[pid]) s.emit('game:state', views[pid]);
    }
  }).catch(() => {});
}

/**
 * Start or reset the turn countdown for a room.
 * On expiry: forfeit active player's turn (fold on truco/envido or auto-irse al mazo).
 */
function _startTurnTimer(io, roomId, game, timeoutMs = TURN_TIMEOUT_MS) {
  _clearTurnTimer(roomId);

  const timerKey = `${roomId}:turn`;
  const waitingId = game.waitingForPlayer;
  if (!waitingId) return; // nobody waiting, nothing to time

  const handle = setTimeout(async () => {
    turnTimers.delete(timerKey);
    const currentGame = await gameSession.getGame(roomId);
    if (!currentGame || currentGame.state === 'GAME_OVER') return;
    // Only forfeit if still the same player's turn
    if (currentGame.waitingForPlayer !== waitingId) return;

    logger.info(`Turn timeout for player ${waitingId} in room ${roomId}`);
    io.to(roomId).emit('game:turnTimeout', { playerId: waitingId });

    // Auto-action based on state
    let result;
    if (currentGame.state === 'TRUCO_PENDING') {
      result = currentGame.respondTruco(waitingId, 'reject');
    } else if (currentGame.state === 'ENVIDO_PENDING') {
      result = currentGame.respondEnvido(waitingId, 'reject');
    } else if (currentGame.state === 'PLAYER_TURN') {
      // Play first card in hand as forfeit
      const hand = currentGame.hands[waitingId];
      if (hand && hand.length > 0) {
        result = currentGame.playCard(waitingId, hand[0].id);
      } else {
        result = currentGame.irseAlMazo(waitingId);
      }
    }

    if (!result || !result.ok) return;
    await gameSession.saveGame(roomId);

    if (result.gameOver) {
      await _finishGame(io, roomId, currentGame, result.winner);
    } else {
      broadcastGameState(io, roomId, currentGame);
      _startTurnTimer(io, roomId, currentGame);
    }
  }, timeoutMs);

  turnTimers.set(timerKey, handle);
  // Notify clients how many seconds they have
  io.to(roomId).emit('game:turnTimer', { playerId: waitingId, seconds: Math.floor(timeoutMs / 1000) });
}

function _clearTurnTimer(roomId) {
  const key = `${roomId}:turn`;
  if (turnTimers.has(key)) {
    clearTimeout(turnTimers.get(key));
    turnTimers.delete(key);
  }
}

/**
 * After a round ends (game not over), auto-start the next round
 * after AUTO_ROUND_DELAY_MS ms so players can see the result.
 */
async function _autoNextRound(io, roomId) {
  return new Promise(resolve => {
    setTimeout(async () => {
      try {
        const game = await gameSession.getGame(roomId);
        if (!game || game.state === 'GAME_OVER') return resolve();
        if (game.state !== 'END_ROUND') return resolve();

        const result = game.nextRound();
        if (!result.ok) return resolve();

        if (result.gameOver) {
          await _finishGame(io, roomId, game, result.winner);
        } else {
          await gameSession.saveGame(roomId);
          io.to(roomId).emit('game:newRound', { scores: game.scores });
          broadcastGameState(io, roomId, game);
          _startTurnTimer(io, roomId, game);
        }
      } catch (err) {
        logger.error('autoNextRound error: ' + err.message);
      }
      resolve();
    }, AUTO_ROUND_DELAY_MS);
  });
}

/**
 * Fetches the game for a room and verifies that the requesting user is a participant.
 * Emits game:error and logs a security event if not.
 * Returns the game object on success, null otherwise.
 */
async function getAuthorizedGame(socket, user, roomId, eventName) {
  const game = await gameSession.getGame(roomId);
  if (!game) {
    socket.emit('game:error', { error: 'Game not found' });
    return null;
  }
  if (!game.players.includes(user.id)) {
    securityLog('game_unauthorized_room', { userId: user.id, roomId, event: eventName });
    socket.emit('game:error', { error: 'No sos jugador de esta partida' });
    return null;
  }
  return game;
}

function registerGameHandlers(io, socket, user) {
  // ── RECONNECT TO EXISTING GAME ───────────────────────────────────
  socket.on('game:reconnect', async ({ roomId }) => {
    try {
      if (!isValidRoomId(roomId)) return socket.emit('game:error', { error: 'Invalid roomId' });
      const game = await gameSession.getGame(roomId);
      if (!game) return socket.emit('game:error', { error: 'Game not found' });
      if (!game.players.includes(user.id)) {
        securityLog('reconnect_not_in_game', { userId: user.id, roomId });
        return socket.emit('game:error', { error: 'Not in this game' });
      }
      await _handleReconnect(io, socket, user, roomId);
    } catch (err) {
      logger.error('game:reconnect error: ' + err.message);
      socket.emit('game:error', { error: 'Reconnect failed' });
    }
  });

  // ── PLAY CARD ────────────────────────────────────────────────────
  socket.on('game:playCard', async ({ roomId, cardId }) => {
    if (!isValidRoomId(roomId) || !isValidCardId(cardId)) {
      securityLog('invalid_input', { userId: user.id, event: 'game:playCard', roomId, cardId });
      return socket.emit('game:error', { error: 'Invalid input' });
    }
    const game = await getAuthorizedGame(socket, user, roomId, 'game:playCard');
    if (!game) return;

    const result = game.playCard(user.id, cardId);
    if (!result.ok) {
      // Log failed attempts (potential cheating)
      if (/not your turn|not in hand/i.test(result.error)) {
        securityLog('cheat_attempt', { userId: user.id, event: 'playCard', roomId, cardId, reason: result.error });
      }
      return socket.emit('game:error', { error: result.error });
    }

    _clearTurnTimer(roomId);
    await gameSession.saveGame(roomId);

    io.to(roomId).emit('game:cardPlayed', {
      playerId: user.id, cardId,
      event: result.event,
      manoResults: result.manoResults,
      manoWinner:  result.manoWinner,
    });

    if (result.gameOver) {
      await _finishGame(io, roomId, game, result.winner);
    } else {
      broadcastGameState(io, roomId, game);
      if (game.state === 'END_ROUND') {
        _autoNextRound(io, roomId);
      } else {
        _startTurnTimer(io, roomId, game);
      }
    }
  });

  // ── ANNOUNCE ENVIDO ──────────────────────────────────────────────
  socket.on('game:envido', async ({ roomId, betType }) => {
    if (!isValidRoomId(roomId) || !isValidBetType(betType)) {
      securityLog('invalid_input', { userId: user.id, event: 'game:envido', roomId, betType });
      return socket.emit('game:error', { error: 'Invalid input' });
    }
    const game = await getAuthorizedGame(socket, user, roomId, 'game:envido');
    if (!game) return;

    const result = game.announceEnvido(user.id, betType);
    if (!result.ok) {
      if (/not your turn|already|phase/i.test(result.error)) {
        securityLog('cheat_attempt', { userId: user.id, event: 'envido', roomId, betType, reason: result.error });
      }
      return socket.emit('game:error', { error: result.error });
    }

    _clearTurnTimer(roomId);
    await gameSession.saveGame(roomId);
    io.to(roomId).emit('game:envidoAnnounced', { by: user.id, betType });
    broadcastGameState(io, roomId, game);
    _startTurnTimer(io, roomId, game, BET_RESPONSE_TIMEOUT_MS);
  });

  // ── RESPOND ENVIDO ───────────────────────────────────────────────
  socket.on('game:envidoResponse', async ({ roomId, response }) => {
    if (!isValidRoomId(roomId) || !isValidResponse(response)) {
      securityLog('invalid_input', { userId: user.id, event: 'game:envidoResponse', roomId, response });
      return socket.emit('game:error', { error: 'Invalid input' });
    }
    const game = await getAuthorizedGame(socket, user, roomId, 'game:envidoResponse');
    if (!game) return;

    const result = game.respondEnvido(user.id, response);
    if (!result.ok) {
      if (/not your turn/i.test(result.error)) {
        securityLog('cheat_attempt', { userId: user.id, event: 'envidoResponse', roomId, reason: result.error });
      }
      return socket.emit('game:error', { error: result.error });
    }

    _clearTurnTimer(roomId);
    await gameSession.saveGame(roomId);
    io.to(roomId).emit('game:envidoResult', result);

    if (result.gameOver) {
      await _finishGame(io, roomId, game, result.winner);
    } else {
      broadcastGameState(io, roomId, game);
      _startTurnTimer(io, roomId, game);
    }
  });

  // ── ANNOUNCE TRUCO ───────────────────────────────────────────────
  socket.on('game:truco', async ({ roomId, betType }) => {
    if (!isValidRoomId(roomId) || !isValidBetType(betType)) {
      securityLog('invalid_input', { userId: user.id, event: 'game:truco', roomId, betType });
      return socket.emit('game:error', { error: 'Invalid input' });
    }
    const game = await getAuthorizedGame(socket, user, roomId, 'game:truco');
    if (!game) return;

    const result = game.announceTruco(user.id, betType);
    if (!result.ok) {
      if (/not your turn/i.test(result.error)) {
        securityLog('cheat_attempt', { userId: user.id, event: 'truco', roomId, betType, reason: result.error });
      }
      return socket.emit('game:error', { error: result.error });
    }

    _clearTurnTimer(roomId);
    await gameSession.saveGame(roomId);
    io.to(roomId).emit('game:trucoAnnounced', { by: user.id, betType });
    broadcastGameState(io, roomId, game);
    _startTurnTimer(io, roomId, game, BET_RESPONSE_TIMEOUT_MS);
  });

  // ── RESPOND TRUCO ────────────────────────────────────────────────
  socket.on('game:trucoResponse', async ({ roomId, response }) => {
    if (!isValidRoomId(roomId) || !isValidResponse(response)) {
      securityLog('invalid_input', { userId: user.id, event: 'game:trucoResponse', roomId, response });
      return socket.emit('game:error', { error: 'Invalid input' });
    }
    const game = await getAuthorizedGame(socket, user, roomId, 'game:trucoResponse');
    if (!game) return;

    const result = game.respondTruco(user.id, response);
    if (!result.ok) {
      if (/not your turn/i.test(result.error)) {
        securityLog('cheat_attempt', { userId: user.id, event: 'trucoResponse', roomId, reason: result.error });
      }
      return socket.emit('game:error', { error: result.error });
    }

    _clearTurnTimer(roomId);
    await gameSession.saveGame(roomId);
    io.to(roomId).emit('game:trucoResult', result);

    if (result.nextState?.gameOver) {
      await _finishGame(io, roomId, game, result.nextState.winner);
    } else {
      broadcastGameState(io, roomId, game);
      if (game.state === 'END_ROUND') {
        _autoNextRound(io, roomId);
      } else {
        _startTurnTimer(io, roomId, game);
      }
    }
  });

  // ── IRSE AL MAZO ─────────────────────────────────────────────────
  socket.on('game:irseAlMazo', async ({ roomId }) => {
    if (!isValidRoomId(roomId)) return socket.emit('game:error', { error: 'Invalid input' });
    const game = await getAuthorizedGame(socket, user, roomId, 'game:irseAlMazo');
    if (!game) return;

    const result = game.irseAlMazo(user.id);
    if (!result.ok) {
      if (/not your turn/i.test(result.error)) {
        securityLog('cheat_attempt', { userId: user.id, event: 'irseAlMazo', roomId, reason: result.error });
      }
      return socket.emit('game:error', { error: result.error });
    }

    _clearTurnTimer(roomId);
    await gameSession.saveGame(roomId);
    io.to(roomId).emit('game:irseAlMazo', { by: user.id, winner: result.winner, points: result.points });

    if (result.nextState?.gameOver) {
      await _finishGame(io, roomId, game, result.nextState.winner);
    } else {
      broadcastGameState(io, roomId, game);
      if (game.state === 'END_ROUND') {
        _autoNextRound(io, roomId);
      } else {
        _startTurnTimer(io, roomId, game);
      }
    }
  });

  // ── ANNOUNCE FLOR ────────────────────────────────────────────────
  socket.on('game:flor', async ({ roomId }) => {
    if (!isValidRoomId(roomId)) return socket.emit('game:error', { error: 'Invalid input' });
    const game = await getAuthorizedGame(socket, user, roomId, 'game:flor');
    if (!game) return;

    const result = game.announceFlor(user.id);
    if (!result.ok) {
      if (/not your turn/i.test(result.error)) {
        securityLog('cheat_attempt', { userId: user.id, event: 'flor', roomId, reason: result.error });
      }
      return socket.emit('game:error', { error: result.error });
    }

    _clearTurnTimer(roomId);
    await gameSession.saveGame(roomId);
    io.to(roomId).emit('game:florAnnounced', { by: user.id, event: result.event });

    if (result.event === 'FLOR_RESOLVED') {
      io.to(roomId).emit('game:florResult', result);
      if (result.gameOver) {
        await _finishGame(io, roomId, game, result.winner);
        return;
      }
    }
    broadcastGameState(io, roomId, game);
    _startTurnTimer(io, roomId, game, BET_RESPONSE_TIMEOUT_MS);
  });

  // ── RESPOND FLOR ─────────────────────────────────────────────────
  socket.on('game:florResponse', async ({ roomId, response }) => {
    if (!isValidRoomId(roomId) || !isValidResponse(response)) {
      securityLog('invalid_input', { userId: user.id, event: 'game:florResponse', roomId, response });
      return socket.emit('game:error', { error: 'Invalid input' });
    }
    const game = await getAuthorizedGame(socket, user, roomId, 'game:florResponse');
    if (!game) return;

    const result = game.respondFlor(user.id, response);
    if (!result.ok) {
      if (/not your turn/i.test(result.error)) {
        securityLog('cheat_attempt', { userId: user.id, event: 'florResponse', roomId, reason: result.error });
      }
      return socket.emit('game:error', { error: result.error });
    }

    _clearTurnTimer(roomId);
    await gameSession.saveGame(roomId);
    io.to(roomId).emit('game:florResult', result);

    if (result.gameOver) {
      await _finishGame(io, roomId, game, result.winner);
    } else {
      broadcastGameState(io, roomId, game);
      _startTurnTimer(io, roomId, game);
    }
  });

  // ── VOLUNTARY ABANDON ────────────────────────────────────────────
  // Player explicitly chose to leave the game (e.g. pressed "Abandonar").
  // Skip the grace period and forfeit immediately.
  socket.on('game:abandon', async ({ roomId: rid }) => {
    if (!rid || !isValidRoomId(rid)) return;
    try {
      const game = await gameSession.getGame(rid);
      if (!game) return;
      if (!game.players.includes(user.id)) {
        securityLog('abandon_not_in_game', { userId: user.id, roomId: rid });
        return;
      }
      logger.info(`Player ${user.username} voluntarily abandoned room ${rid}`);
      await _handleAbandon(io, rid, user.id);
    } catch (err) {
      logger.error(`game:abandon error: ${err.message}`);
    }
  });

  // ── DISCONNECT HANDLING ──────────────────────────────────────────
  socket.on('disconnect', async () => {
    try {
      await _handleDisconnect(io, user.id);
    } catch (err) {
      logger.error(`disconnect handler for ${user.username}: ${err.message}`);
    }
  });
}

// ── Disconnect / Reconnect helpers ─────────────────────────────────────────────

/**
 * Called when a socket disconnects.
 * If the user was in an active game, notifies the opponent and starts
 * an abandon timer. The game is NOT deleted immediately.
 */
async function _handleDisconnect(io, userId) {
  const roomId = userRooms.get(userId);
  if (!roomId) return;

  const game = await gameSession.getGame(roomId);
  if (!game || game.state === 'GAME_OVER') {
    userRooms.delete(userId);
    return;
  }

  logger.info(`Player ${userId} disconnected from game ${roomId}`);

  // Pause the turn timer so it doesn't auto-act while player is reconnecting
  _clearTurnTimer(roomId);

  // Notify opponent
  io.to(roomId).emit('player:disconnected', {
    playerId:         userId,
    gracePeriodSecs:  ABANDON_GRACE_MS / 1000,
  });

  // Persist paused state in DB
  try {
    const isP1  = game.players[0] === userId;
    const col   = isP1 ? 'p1_disconnected_at' : 'p2_disconnected_at';
    await query(
      `UPDATE partidas SET status = 'paused', ${col} = NOW() WHERE room_id = ?`,
      [roomId]
    );
  } catch (err) {
    logger.error('Failed to update paused status: ' + err.message);
  }

  // Start abandon timer
  const timerKey = `${roomId}:${userId}`;
  if (disconnectTimers.has(timerKey)) clearTimeout(disconnectTimers.get(timerKey));

  const handle = setTimeout(async () => {
    disconnectTimers.delete(timerKey);
    await _handleAbandon(io, roomId, userId);
  }, ABANDON_GRACE_MS);

  disconnectTimers.set(timerKey, handle);
}

/**
 * Called when a player reconnects to an existing game.
 * Cancels the abandon timer and restores the game state.
 */
async function _handleReconnect(io, socket, user, roomId) {
  const timerKey = `${roomId}:${user.id}`;
  if (disconnectTimers.has(timerKey)) {
    clearTimeout(disconnectTimers.get(timerKey));
    disconnectTimers.delete(timerKey);
  }

  userRooms.set(user.id, roomId);
  socket.join(roomId);

  const game = await gameSession.getGame(roomId);
  if (!game) return socket.emit('game:error', { error: 'Game not found' });

  // Resume game in DB
  try {
    const isP1 = game.players[0] === user.id;
    const col  = isP1 ? 'p1_disconnected_at' : 'p2_disconnected_at';
    await query(
      `UPDATE partidas SET status = 'active', ${col} = NULL WHERE room_id = ?`,
      [roomId]
    );
  } catch (err) {
    logger.error('Failed to update active status on reconnect: ' + err.message);
  }

  // Send current state back to reconnecting player
  const view = game.getPlayerView ? game.getPlayerView(user.id) : game;
  socket.emit('game:resume', { gameState: view });

  // Notify opponent
  socket.to(roomId).emit('player:reconnected', {
    playerId: user.id,
    username: user.username,
  });

  // Restart the turn timer so the active player has their full time
  if (game.state === 'PLAYER_TURN' || game.state === 'TRUCO_PENDING' || game.state === 'ENVIDO_PENDING' || game.state === 'FLOR_PENDING') {
    const isbet = game.state !== 'PLAYER_TURN';
    _startTurnTimer(io, roomId, game, isbet ? BET_RESPONSE_TIMEOUT_MS : TURN_TIMEOUT_MS);
  }

  logger.info(`Player ${user.username} reconnected to ${roomId}`);
}

/**
 * Grace period expired — the disconnected player forfeits.
 * Awards the win to the opponent and settles any wagered funds.
 */
async function _handleAbandon(io, roomId, abandonedUserId) {
  const game = await gameSession.getGame(roomId);
  if (!game || game.state === 'GAME_OVER') return;

  const winnerId = game.players.find(p => p !== abandonedUserId);
  if (!winnerId) return;

  logger.info(`Game ${roomId}: ${abandonedUserId} abandoned — ${winnerId} wins`);

  // Emit a single game:over with reason:'abandon' so the frontend handles it
  // exactly once via its game:over handler (no separate game:abandoned event).
  // _finishGame settles the wallet, updates DB/ELO, sends notifications and
  // deletes the game session — nothing else needed here.
  await _finishGame(io, roomId, game, winnerId, {
    reason:      'abandon',
    abandonedBy: abandonedUserId,
  });
}

/**
 * Register a userId → roomId mapping so disconnect events can find the game.
 * Called by matchmakingHandler after a game starts.
 */
function trackUserRoom(userId, roomId) {
  userRooms.set(userId, roomId);
}

/**
 * Remove userRoom tracking when a game ends normally.
 */
function untrackUserRoom(userId) {
  userRooms.delete(userId);
}

// extraPayload: optional extra fields merged into the game:over event
// (e.g. { reason: 'abandon', abandonedBy: userId })
async function _finishGame(io, roomId, game, winnerId, extraPayload = {}) {
  const loserId = game.players.find(p => p !== winnerId);
  const scores  = game.scores;

  // Clear all timers for this room
  _clearTurnTimer(roomId);
  for (const pid of game.players) untrackUserRoom(pid);

  try {
    // Settle wagered funds (no-op if not a challenge game)
    await BattleService.settle({ roomId, winnerId }).catch(err => {
      logger.error(`Settle battle for ${roomId}: ${err.message}`);
    });

    // DB: finish game
    await Game.finish({
      roomId,
      winnerId,
      scoreP1: scores[game.players[0]],
      scoreP2: scores[game.players[1]],
    });

    // ELO update — only for ranked games
    const isRanked = game.config?.modo === 'ranked';
    let eloDelta = null;
    if (isRanked) {
      // Ensure ranking rows exist (covers users registered before ranking feature was added)
      await Promise.all([
        Ranking.initForUser(winnerId),
        Ranking.initForUser(loserId),
      ]);

      const [winnerRank, loserRank] = await Promise.all([
        Ranking.getByUserId(winnerId),
        Ranking.getByUserId(loserId),
      ]);

      if (winnerRank && loserRank) {
        const { newWinner, newLoser, delta } = calculateNewRatings(winnerRank.elo, loserRank.elo);
        await Ranking.updateAfterGame({ winnerId, loserId, newWinnerElo: newWinner, newLoserElo: newLoser });
        eloDelta = { [winnerId]: delta, [loserId]: -delta };
      }
    }

    // Single authoritative end event — includes reason/abandonedBy when coming from abandon
    io.to(roomId).emit('game:over', { winner: winnerId, scores, eloDelta, ...extraPayload });

    // Notifications
    const [winnerUser, loserUser] = await Promise.all([
      query('SELECT username FROM usuarios WHERE id = ?', [winnerId]),
      query('SELECT username FROM usuarios WHERE id = ?', [loserId]),
    ]);
    const isAbandon = extraPayload.reason === 'abandon';
    await Promise.all([
      NotificationService.create({
        userId:   winnerId,
        type:     'game_result',
        title:    isAbandon ? '¡Ganaste! (rival abandonó)' : '¡Ganaste la partida!',
        body:     isAbandon
          ? `Tu rival no volvió — ganás la partida.`
          : `Venciste a ${loserUser[0]?.username || 'tu rival'}`,
        metadata: { roomId, result: 'win', eloDelta: eloDelta?.[winnerId] },
      }),
      NotificationService.create({
        userId:   loserId,
        type:     'game_result',
        title:    isAbandon ? 'Perdiste por abandono' : 'Perdiste la partida',
        body:     isAbandon
          ? 'Te desconectaste y tu rival ganó la partida.'
          : `${winnerUser[0]?.username || 'Tu rival'} te ganó`,
        metadata: { roomId, result: 'loss', eloDelta: eloDelta?.[loserId] },
      }),
    ]).catch(() => {});

    // ── TOURNAMENT: avanzar bracket si la partida era de torneo ──────────────
    // Modo 'torneo' no actualiza ELO (isRanked === false), ni mueve wallet.
    // finishMatchFromGame devuelve null si el roomId no pertenece a ningún torneo.
    try {
      const tResult = await TournamentService.finishMatchFromGame(roomId, winnerId, scores);
      if (tResult) {
        const tRoom = `tournament:${tResult.tournamentId}`;

        io.to(tRoom).emit('tournament:matchFinished', {
          tournamentId: tResult.tournamentId,
          matchId:      tResult.matchId,
          winnerId:     tResult.winnerId,
          loserId:      tResult.loserId,
        });
        io.to(tRoom).emit('tournament:updated', { tournamentId: tResult.tournamentId });

        if (tResult.champion) {
          io.to(tRoom).emit('tournament:champion', {
            tournamentId: tResult.tournamentId,
            winnerId:     tResult.winnerId,
          });
          logger.info(`Tournament ${tResult.tournamentId}: champion = ${tResult.winnerId}`);
        } else if (tResult.qualified) {
          io.to(tRoom).emit('tournament:qualified', {
            tournamentId: tResult.tournamentId,
            winnerId:     tResult.winnerId,
          });
          logger.info(`Tournament ${tResult.tournamentId}: player ${tResult.winnerId} qualified`);
        }
      }
    } catch (tErr) {
      // No lanzar — no debe romper la finalización de la partida
      logger.error(`Tournament post-game hook (room=${roomId}): ${tErr.message}`);
    }

  } catch (err) {
    logger.error('Error finishing game: ' + err.message);
    io.to(roomId).emit('game:over', { winner: winnerId, scores, ...extraPayload });
  }

  await gameSession.deleteGame(roomId);
}

module.exports = {
  registerGameHandlers,
  trackUserRoom,
  untrackUserRoom,
  startTurnTimerPublic: _startTurnTimer,
  userRooms,
};
