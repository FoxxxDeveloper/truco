/**
 * Tournament Socket Handler
 *
 * Eventos registrados por socket autenticado:
 *   tournament:join        → se une a la room socket del torneo para recibir updates
 *   tournament:leave       → sale de la room
 *   tournament:matchReady  → botón "Estoy listo" en un cruce
 *
 * Flujo "ambos listos":
 *   1. setPlayerReady devuelve bothReady === true
 *   2. startTournamentMatch() crea la gameSession y emite game:start a ambos
 *   3. Al terminar la partida, gameHandler._finishGame llama
 *      TournamentService.finishMatchFromGame() que avanza el bracket
 */
'use strict';

const { v4: uuidv4 } = require('uuid');

const TournamentService = require('../../services/tournamentService');
const gameSession       = require('../../services/gameSession');
const Game              = require('../../models/Game');
const { query }         = require('../../config/database');
const logger            = require('../../config/logger');
const NotificationService = require('../../services/notificationService');

// Importado de gameHandler después de que gameHandler ya se cargó
// (circular-safe porque sólo se usa en runtime, no en require-time)
const { trackUserRoom, startTurnTimerPublic } = require('./gameHandler');

// ── Mensajes que son errores de usuario (→ emitir al cliente, no loguear como 500)
const USER_ERRORS = [
  'Torneo no encontrado',
  'Cruce no encontrado',
  'No sos jugador de este cruce',
  'El cruce no está listo',
  'Ambos jugadores aún no están listos',
  'El cruce no existe en este torneo',
  'Este cruce ya fue finalizado',
  'Ya estás inscripto',
  'No estás inscripto',
  'El check-in no está abierto',
  'El torneo aún no inició oficialmente',
  'No podés cancelar listo',
];

function _emitTournamentError(socket, message) {
  socket.emit('tournament:error', { error: message });
}

function _isUserError(message) {
  return USER_ERRORS.some(msg => message.includes(msg));
}

// ─────────────────────────────────────────────────────────────────────────────

function registerTournamentHandlers(io, socket, user) {

  // ── tournament:join ───────────────────────────────────────────────────────
  // Cliente se suscribe a la room del torneo para recibir actualizaciones de bracket.
  socket.on('tournament:join', async (payload) => {
    try {
      const { tournamentId } = payload || {};
      if (!tournamentId) return _emitTournamentError(socket, 'tournamentId requerido');

      const rows = await query(
        'SELECT id, name, status FROM tournaments WHERE id = ?',
        [Number(tournamentId)]
      );
      if (!rows.length) return _emitTournamentError(socket, 'Torneo no encontrado');

      socket.join(`tournament:${tournamentId}`);
      socket.emit('tournament:joined', {
        tournamentId: rows[0].id,
        name:         rows[0].name,
        status:       rows[0].status,
      });
    } catch (err) {
      logger.error(`tournament:join user=${user.id}: ${err.message}`);
      _emitTournamentError(socket, 'Error al unirse al torneo');
    }
  });

  // ── tournament:leave ──────────────────────────────────────────────────────
  socket.on('tournament:leave', (payload) => {
    const { tournamentId } = payload || {};
    if (tournamentId) {
      socket.leave(`tournament:${tournamentId}`);
    }
  });

  // ── tournament:matchReady ─────────────────────────────────────────────────
  // Jugador presiona "Estoy listo" en su cruce.
  // Si ambos están listos, se inicia la partida automáticamente.
  socket.on('tournament:matchReady', async (payload) => {
    try {
      const { tournamentId, matchId } = payload || {};
      if (!tournamentId || !matchId) {
        return _emitTournamentError(socket, 'Datos incompletos: se requieren tournamentId y matchId');
      }

      const result = await TournamentService.setPlayerReady(
        Number(tournamentId),
        Number(matchId),
        user.id
      );

      // Notificar a todos en la room del torneo
      io.to(`tournament:${tournamentId}`).emit('tournament:playerReady', {
        tournamentId: Number(tournamentId),
        matchId:      Number(matchId),
        userId:       user.id,
        bothReady:    result.bothReady,
      });

      // Update del bracket para todos
      io.to(`tournament:${tournamentId}`).emit('tournament:updated', {
        tournamentId: Number(tournamentId),
      });

      if (result.bothReady) {
        // Iniciar la partida. Manejar offline dentro de startTournamentMatch.
        await startTournamentMatch(io, Number(matchId)).catch(err => {
          logger.error(`startTournamentMatch (match=${matchId}): ${err.message}`);
          _emitTournamentError(socket, 'No se pudo iniciar la partida');
        });
      }

    } catch (err) {
      logger.error(`tournament:matchReady user=${user.id}: ${err.message}`);
      _emitTournamentError(
        socket,
        _isUserError(err.message) ? err.message : 'Error al marcar listo'
      );
    }
  });

  // ── tournament:matchUnready ───────────────────────────────────────────────
  socket.on('tournament:matchUnready', async (payload) => {
    try {
      const { tournamentId, matchId } = payload || {};
      if (!tournamentId || !matchId) {
        return _emitTournamentError(socket, 'Datos incompletos: se requieren tournamentId y matchId');
      }

      await TournamentService.unsetPlayerReady(
        Number(tournamentId),
        Number(matchId),
        user.id
      );

      io.to(`tournament:${tournamentId}`).emit('tournament:playerReady', {
        tournamentId: Number(tournamentId),
        matchId:      Number(matchId),
        userId:       user.id,
        bothReady:    false,
        unready:      true,
      });

      io.to(`tournament:${tournamentId}`).emit('tournament:updated', {
        tournamentId: Number(tournamentId),
      });
    } catch (err) {
      logger.error(`tournament:matchUnready user=${user.id}: ${err.message}`);
      _emitTournamentError(
        socket,
        _isUserError(err.message) ? err.message : 'Error al cancelar listo'
      );
    }
  });

  // ── Tournament chat (room tournament-chat:<id>) ───────────────────────────
  socket.on('tournament:chat:join', async (payload) => {
    try {
      const tournamentId = Number((payload || {}).tournamentId);
      if (!tournamentId) {
        return socket.emit('tournament:chat:error', { error: 'tournamentId requerido' });
      }
      const acc = await TournamentService.canAccessTournamentChat(tournamentId, user.id, user.role);
      if (!acc.ok) {
        if (acc.reason === 'expired') {
          return socket.emit('tournament:chat:error', {
            code:   'CHAT_EXPIRED',
            error:  'El chat de este torneo ya finalizó.',
          });
        }
        return socket.emit('tournament:chat:error', { error: 'Sin acceso al chat de torneo' });
      }
      socket.join(`tournament-chat:${tournamentId}`);
      socket.emit('tournament:chat:joined', { tournamentId });
    } catch (err) {
      logger.error(`tournament:chat:join user=${user.id}: ${err.message}`);
      socket.emit('tournament:chat:error', { error: 'Error al unirse al chat' });
    }
  });

  socket.on('tournament:chat:leave', (payload) => {
    const tournamentId = Number((payload || {}).tournamentId);
    if (tournamentId) socket.leave(`tournament-chat:${tournamentId}`);
  });

  socket.on('tournament:chat:message', async (payload) => {
    try {
      const tournamentId = Number((payload || {}).tournamentId);
      const raw = payload?.message ?? payload?.text ?? '';
      const msg = await TournamentService.createTournamentChatMessage(
        tournamentId,
        user.id,
        user.role,
        raw
      );
      const out = { ...msg, tournamentId };
      NotificationService.emitToRoom(`tournament-chat:${tournamentId}`, 'tournament:chat:message', out);
    } catch (err) {
      if (err.code === 'expired') {
        return socket.emit('tournament:chat:error', {
          code:   'CHAT_EXPIRED',
          error:  'El chat de este torneo ya finalizó.',
        });
      }
      if (err.code === 'empty') {
        return socket.emit('tournament:chat:error', { error: 'El mensaje no puede estar vacío' });
      }
      logger.error(`tournament:chat:message user=${user.id}: ${err.message}`);
      socket.emit('tournament:chat:error', { error: 'No se pudo enviar el mensaje' });
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// startTournamentMatch — inicia la partida cuando ambos jugadores están listos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea una gameSession para el match de torneo, une los sockets al room y
 * emite game:start a ambos jugadores.
 *
 * @param {import('socket.io').Server} io
 * @param {number} matchId
 */
async function startTournamentMatch(io, matchId) {
  // 1. Cargar datos del match + torneo
  const match = await TournamentService.getMatchForStart(matchId);

  if (!match.player1_id || !match.player2_id) {
    throw new Error('El cruce no tiene ambos jugadores asignados');
  }
  if (!['ready', 'waiting_ready'].includes(match.status)) {
    throw new Error('El cruce no está en estado listo');
  }
  if (!match.player1_ready || !match.player2_ready) {
    throw new Error('Ambos jugadores aún no están listos');
  }

  // 2. Idempotencia — si ya tiene room_id y la game session existe, no recrear
  if (match.room_id) {
    const existing = await gameSession.getGame(match.room_id);
    if (existing) {
      logger.info(`Tournament match ${matchId}: game already running in room ${match.room_id}`);
      return;
    }
  }

  // 3. Buscar sockets de ambos jugadores
  const p1Socket = _findSocket(io, match.player1_id);
  const p2Socket = _findSocket(io, match.player2_id);

  // Si alguno no está conectado: no crear partida, notificar al torneo
  if (!p1Socket || !p2Socket) {
    const offlineId = !p1Socket ? match.player1_id : match.player2_id;
    logger.warn(`Tournament match ${matchId}: player ${offlineId} offline — game not started`);
    io.to(`tournament:${match.tournament_id}`).emit('tournament:error', {
      matchId,
      error: 'El rival no está conectado. La partida no pudo iniciarse.',
    });
    return;
  }

  // 4. Crear roomId y config del juego
  const roomId = uuidv4();

  const gameConfig = {
    puntosMaximos:      match.puntos_maximos     || 15,
    florHabilitada:     Boolean(match.flor_habilitada),
    modo:               'torneo',
    tournamentId:       match.tournament_id,
    tournamentMatchId:  matchId,
    turnTimeoutSecs:    match.turn_seconds        || 30,
    reconnectGraceSecs: match.reconnect_seconds   || 60,
  };

  // 5. Crear game session (en memoria) y arrancar
  const game = await gameSession.createGame(
    roomId,
    match.player1_id,
    match.player2_id,
    gameConfig
  );
  game.startGame();

  // 6. Persistir room en DB de forma atómica (evita dos partidas por carrera socket/scheduler)
  const claimed = await TournamentService.claimMatchActive(matchId, roomId);
  if (!claimed) {
    try {
      await gameSession.deleteGame(roomId);
    } catch (err) {
      logger.warn(`Tournament match ${matchId}: cleanup game ${roomId}: ${err.message}`);
    }
    return;
  }

  try {
    await Game.create({
      roomId,
      player1Id: match.player1_id,
      player2Id: match.player2_id,
    });
  } catch (err) {
    logger.error(`Tournament match ${matchId}: DB partida create failed — ${err.message}`);
    // No abort; game session ya existe, continuar
  }

  // 7. Unir sockets al room y trackear para disconnect handling
  p1Socket.join(roomId);
  p2Socket.join(roomId);
  trackUserRoom(match.player1_id, roomId);
  trackUserRoom(match.player2_id, roomId);

  // 8. Cargar info de usuarios para el payload
  const [p1Rows, p2Rows] = await Promise.all([
    query('SELECT id, username, avatar FROM usuarios WHERE id = ?', [match.player1_id]),
    query('SELECT id, username, avatar FROM usuarios WHERE id = ?', [match.player2_id]),
  ]);
  const p1 = p1Rows[0] || { id: match.player1_id, username: 'Jugador', avatar: null };
  const p2 = p2Rows[0] || { id: match.player2_id, username: 'Jugador', avatar: null };

  const tournamentInfo = {
    id:          match.tournament_id,
    matchId,
    name:        match.tournament_name  || null,
    phase:       match.phase            || null,
    roundNumber: match.round_number,
    matchNumber: match.match_number,
  };

  // 9. Emitir game:start a cada jugador con su vista personalizada
  p1Socket.emit('game:start', {
    roomId,
    opponent:    { id: p2.id, username: p2.username, avatar: p2.avatar || null },
    gameState:   game.getPlayerView(match.player1_id),
    gameOptions: gameConfig,
    tournament:  tournamentInfo,
  });

  p2Socket.emit('game:start', {
    roomId,
    opponent:    { id: p1.id, username: p1.username, avatar: p1.avatar || null },
    gameState:   game.getPlayerView(match.player2_id),
    gameOptions: gameConfig,
    tournament:  tournamentInfo,
  });

  // 10. Iniciar timer de turno (reutiliza el de gameHandler)
  startTurnTimerPublic(io, roomId, game);

  // 11. Notificar a la room del torneo
  io.to(`tournament:${match.tournament_id}`).emit('tournament:matchStarted', {
    tournamentId: match.tournament_id,
    matchId,
    roomId,
  });
  io.to(`tournament:${match.tournament_id}`).emit('tournament:updated', {
    tournamentId: match.tournament_id,
  });

  logger.info(
    `Tournament match started: room=${roomId} match=${matchId} ` +
    `${match.player1_id} vs ${match.player2_id} ` +
    `tournament=${match.tournament_id}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/** Encuentra el primer socket activo de un userId en el server */
function _findSocket(io, userId) {
  for (const [, s] of io.sockets.sockets) {
    if (s.data?.user?.id === userId) return s;
  }
  return null;
}

module.exports = { registerTournamentHandlers, startTournamentMatch };
