/**
 * Battle Socket Handler
 *
 * Handles the "battle:accept" socket event emitted by the frontend
 * when a user accepts a battle room (either public or via invite code).
 *
 * Flow:
 *   client emits   → battle:accept { battleId }
 *   server creates → gameSession, joins sockets, emits game:start to both
 *
 * Reutiliza _startBattleMatch() que replica _startMatch() de matchmakingHandler
 * pero sin tocar el matchmaking queue.
 */
const BattleService   = require('../../services/battleService');
const gameSession     = require('../../services/gameSession');
const Game            = require('../../models/Game');
const { trackUserRoom, startTurnTimerPublic } = require('./gameHandler');
const logger          = require('../../config/logger');
const { query }       = require('../../config/database');

function registerBattleHandlers(io, socket, user) {

  /**
   * battle:startGame — triggered after the REST accept endpoint succeeds.
   *
   * The client sends ONLY { battleId }.
   * ALL game data (roomId, creatorId, opponentId, amount, prize, gameConfig)
   * is loaded from DB and never trusted from the client payload.
   *
   * Guards:
   *   - battle must exist in DB
   *   - status must be 'accepted' (not 'open', 'finished', 'cancelled', etc.)
   *   - socket.data.user.id must be creator_id OR opponent_id from DB row
   *   - idempotent: if gameSession already exists for that roomId, reconnect only
   */
  socket.on('battle:startGame', async (payload) => {
    try {
      const { battleId } = payload || {};

      if (!battleId || typeof battleId !== 'string') {
        return socket.emit('game:error', { error: 'Datos de batalla inválidos' });
      }

      // ── Load battle from DB — do NOT trust any other client field ──────────
      const rows = await query(
        `SELECT id, room_id, creator_id, opponent_id, amount, prize_amount,
                commission_rate, game_config, status
         FROM challenges WHERE id = ?`,
        [battleId]
      );

      if (!rows.length) {
        return socket.emit('game:error', { error: 'Batalla no encontrada' });
      }

      const b = rows[0];

      // ── Membership check against DB values ──────────────────────────────────
      const isParticipant = user.id === b.creator_id || user.id === b.opponent_id;
      if (!isParticipant) {
        logger.warn(`battle:startGame unauthorized: user=${user.id} battle=${battleId}`);
        return socket.emit('game:error', { error: 'No sos parte de esta batalla' });
      }

      // ── Status guard — must be 'accepted' or 'active' ──────────────────────
      // 'accepted' = funds locked, roomId assigned, game not yet started
      // 'active'   = game already running — handle as reconnect below
      if (b.status !== 'accepted' && b.status !== 'active') {
        return socket.emit('game:error', {
          error: b.status === 'finished'  ? 'La batalla ya fue jugada'
               : b.status === 'cancelled' ? 'La batalla fue cancelada'
               : `Estado de batalla inválido: ${b.status}`,
        });
      }

      const roomId    = b.room_id;
      const creatorId = b.creator_id;
      const opponentId = b.opponent_id;
      const amount    = parseFloat(b.amount);
      const prize     = parseFloat(b.prize_amount);
      const gameConfig = typeof b.game_config === 'string'
        ? JSON.parse(b.game_config)
        : (b.game_config || {});

      if (!roomId) {
        return socket.emit('game:error', { error: 'Sala sin roomId asignado' });
      }

      // ── Idempotent: game already running (status was 'active') ───────────────
      const existingGame = await gameSession.getGame(roomId);
      if (existingGame) {
        socket.join(roomId);
        const rivalId = user.id === creatorId ? opponentId : creatorId;
        const [rivalRow] = await query('SELECT id, username FROM usuarios WHERE id = ?', [rivalId]);
        socket.emit('game:start', {
          roomId,
          opponent:    { id: rivalId, username: rivalRow?.username || 'Rival' },
          gameState:   existingGame.getPlayerView(user.id),
          gameOptions: existingGame.config,
          battle:      { id: battleId, amount, prize },
        });
        return;
      }

      // ── Start game — all data sourced from DB ────────────────────────────────
      await _startBattleMatch(io, {
        battleId, roomId, creatorId, opponentId, amount, prize, gameConfig,
      });

    } catch (err) {
      logger.error('battle:startGame error: ' + err.message);
      socket.emit('game:error', { error: 'Error al iniciar la batalla' });
    }
  });
}

/**
 * Inicia una partida de batalla competitiva.
 * Crea el gameSession, persiste en DB, une los sockets y emite game:start a ambos.
 */
async function _startBattleMatch(io, { battleId, roomId, creatorId, opponentId, amount, prize, gameConfig }) {
  const config = {
    puntosMaximos:      gameConfig?.puntosMaximos ?? 30,
    florHabilitada:     gameConfig?.florHabilitada ?? false,
    modo:               'apuesta',
    turnTimeoutSecs:    gameConfig?.turnTimeoutSecs ?? 30,
    reconnectGraceSecs: gameConfig?.reconnectGraceSecs ?? 60,
  };

  // Create game session
  const game = await gameSession.createGame(roomId, creatorId, opponentId, config);
  game.startGame();

  // Persist to DB
  try {
    await Game.create({ roomId, player1Id: creatorId, player2Id: opponentId });
  } catch (err) {
    logger.error('DB game create (battle) failed: ' + err.message);
  }

  // Update battle status to 'active'
  await query(
    "UPDATE challenges SET status = 'active', started_at = NOW() WHERE id = ?",
    [battleId]
  ).catch(err => logger.error('Update battle active: ' + err.message));

  // Find sockets for both players
  const creatorSocket   = _findSocket(io, creatorId);
  const opponentSocket  = _findSocket(io, opponentId);

  // If creator is offline — refund both and abort
  if (!creatorSocket) {
    logger.warn(`Battle ${battleId}: creator ${creatorId} offline, aborting and refunding`);
    await BattleService.refund(battleId, 'creator_offline').catch(() => {});
    if (opponentSocket) {
      opponentSocket.emit('battle:cancelled', {
        reason: 'El creador de la sala está offline. Tu saldo fue devuelto.',
      });
    }
    await gameSession.deleteGame(roomId);
    return;
  }

  // If opponent socket lost connection between accept & startGame — refund
  if (!opponentSocket) {
    logger.warn(`Battle ${battleId}: opponent ${opponentId} offline, refunding`);
    await BattleService.refund(battleId, 'opponent_offline').catch(() => {});
    creatorSocket.emit('battle:cancelled', {
      reason: 'El rival se desconectó antes de iniciar. Tu saldo fue devuelto.',
    });
    await gameSession.deleteGame(roomId);
    return;
  }

  // Fetch usernames
  const [creatorRow, opponentRow] = await Promise.all([
    query('SELECT username, id FROM usuarios WHERE id = ?', [creatorId]),
    query('SELECT username, id FROM usuarios WHERE id = ?', [opponentId]),
  ]);
  const creatorUser  = creatorRow[0]  || { id: creatorId,  username: 'Jugador' };
  const opponentUser = opponentRow[0] || { id: opponentId, username: 'Jugador' };

  // Join both sockets to the room
  creatorSocket.join(roomId);
  opponentSocket.join(roomId);

  // Track for disconnect handling
  trackUserRoom(creatorId,  roomId);
  trackUserRoom(opponentId, roomId);

  const battleInfo = { id: battleId, amount: parseFloat(amount), prize: parseFloat(prize) };

  // Emit game:start to both
  creatorSocket.emit('game:start', {
    roomId,
    opponent:    { id: opponentUser.id, username: opponentUser.username },
    gameState:   game.getPlayerView(creatorId),
    gameOptions: config,
    battle:      battleInfo,
  });

  opponentSocket.emit('game:start', {
    roomId,
    opponent:    { id: creatorUser.id, username: creatorUser.username },
    gameState:   game.getPlayerView(opponentId),
    gameOptions: config,
    battle:      battleInfo,
  });

  // Start turn timer
  if (startTurnTimerPublic) {
    startTurnTimerPublic(io, roomId, game);
  }

  logger.info(`Battle match started: room=${roomId} battle=${battleId} ${creatorId} vs ${opponentId} amount=${amount}`);
}

function _findSocket(io, userId) {
  for (const [, s] of io.sockets.sockets) {
    if (s.data?.user?.id === userId) return s;
  }
  return null;
}

module.exports = { registerBattleHandlers, _startBattleMatch };
