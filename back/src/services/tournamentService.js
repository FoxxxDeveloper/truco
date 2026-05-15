/**
 * TournamentService — Lógica de torneos gratuitos de TrucoFX.
 *
 * Formato soportado:
 *   - Clasificatorio A/B  (phase: qualifier_a / qualifier_b)  → 4 clasificados
 *   - Finales             (phase: finals)                     → 1 campeón
 *   - Eliminación directa (phase: general / format: single_elimination)
 *
 * Reglas generales:
 *   - Torneos con costo: cargo idempotente al inscribirse como titular (entry_fee > 0;
 *     is_paid en DB debe ir con entry_fee > 0). Suplentes no pagan hasta promoción al cerrar check-in.
 *   - Titulares: primeros max_players en registrarse (status registered/checked_in).
 *   - Suplentes: los que llegan después (status substitute).
 *   - Check-in obligatorio; suplentes con check-in cubren ausencias de titulares en el bracket.
 *   - Bracket generado con shuffle aleatorio; byes automáticos si jugadores < potencia de 2.
 */
'use strict';

const { query, withTransaction } = require('../config/database');
const logger = require('../config/logger');
const VerificationService = require('./verificationService');
const WalletService = require('./walletService');

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const ACTIVE_REG_STATUSES = ['registered', 'checked_in', 'substitute'];
const QUALIFY_COUNT       = 4;   // cuántos avanzan por fase clasificatoria

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS INTERNOS
// ─────────────────────────────────────────────────────────────────────────────

/** Fisher-Yates shuffle */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Menor potencia de 2 mayor o igual a n (mínimo 2) */
function nextPowerOfTwo(n) {
  if (n <= 2) return 2;
  let p = 2;
  while (p < n) p <<= 1;
  return p;
}

/** log2 entero (para potencias exactas de 2) */
function intLog2(n) {
  return Math.round(Math.log2(n));
}

/** Agrupa un array de matches por round_number */
function groupMatchesByRound(matches) {
  const rounds = {};
  for (const m of matches) {
    const rn = m.round_number;
    if (!rounds[rn]) rounds[rn] = [];
    rounds[rn].push(m);
  }
  return rounds;
}

/** Normaliza una fila de tournament_matches (con JOINs) a payload público */
function normalizeMatch(r) {
  return {
    id:               r.id,
    tournament_id:    r.tournament_id,
    round_number:     r.round_number,
    match_number:     r.match_number,
    bracket_position: r.bracket_position,
    round_type:       r.round_type || 'bracket',
    status:           r.status,
    player1:          r.player1_id
      ? { id: r.player1_id, username: r.p1_username || null, avatar: r.p1_avatar || null }
      : null,
    player2:          r.player2_id
      ? { id: r.player2_id, username: r.p2_username || null, avatar: r.p2_avatar || null }
      : null,
    winner:           r.winner_id
      ? { id: r.winner_id, username: r.w_username || null, avatar: r.w_avatar || null }
      : null,
    player1_ready:    !!r.player1_ready,
    player2_ready:    !!r.player2_ready,
    player1_ready_at: r.player1_ready_at,
    player2_ready_at: r.player2_ready_at,
    ready_deadline:   r.ready_deadline,
    player1_score:    r.player1_score,
    player2_score:    r.player2_score,
    next_match_id:    r.next_match_id,
    next_slot:        r.next_slot,
    room_id:          r.room_id || null,
    scheduled_at:     r.scheduled_at,
    started_at:       r.started_at,
    finished_at:      r.finished_at,
    round_type:       r.round_type || 'bracket',
    round_label:      r.round_type === 'third_place' ? 'Partido por el 3° puesto' : null,
  };
}

/**
 * Persiste un evento en tournament_events.
 * Recibe conn si se está dentro de una transacción, null si no.
 */
async function createEvent(connOrNull, tournamentId, type, metadata = null, userId = null, adminId = null) {
  const sql = `INSERT INTO tournament_events (tournament_id, type, metadata, user_id, admin_id)
               VALUES (?, ?, ?, ?, ?)`;
  const p = [
    tournamentId,
    type,
    metadata ? JSON.stringify(metadata) : null,
    userId  || null,
    adminId || null,
  ];
  if (connOrNull) await connOrNull.execute(sql, p);
  else            await query(sql, p);
}

function parseJsonField(val, fallback = {}) {
  if (val == null) return { ...fallback };
  if (typeof val === 'object') return val;
  try {
    const o = JSON.parse(val);
    return o && typeof o === 'object' ? o : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

function parsePlacementConfig(tRow) {
  return parseJsonField(tRow?.placement_config, {});
}

function parsePrizeConfig(tRow) {
  return parseJsonField(tRow?.prize_config, {});
}

/**
 * Premio para una posición final (1..4). Si no hay prize_config.positions[n]
 * y n===1, usa prize_text como label del campeón.
 */
function prizeForFinalPosition(tournamentRow, finalPosition) {
  const fp = finalPosition != null ? Number(finalPosition) : null;
  if (!fp || !Number.isFinite(fp)) {
    return { prize_label: null, prize_amount: null, prize_currency: null };
  }
  const cfg = parsePrizeConfig(tournamentRow);
  const pos = cfg.positions && typeof cfg.positions === 'object' ? cfg.positions : {};
  const key = String(fp);
  const entry = pos[key] || pos[fp];
  if (entry && (entry.label != null || entry.amount != null)) {
    return {
      prize_label: entry.label != null ? String(entry.label) : null,
      prize_amount: entry.amount != null && entry.amount !== '' ? Number(entry.amount) : null,
      prize_currency: entry.currency != null ? String(entry.currency) : (cfg.currency || null),
    };
  }
  if (fp === 1 && tournamentRow?.prize_text) {
    return {
      prize_label: String(tournamentRow.prize_text).trim(),
      prize_amount: tournamentRow.prize_amount != null ? Number(tournamentRow.prize_amount) : null,
      prize_currency: cfg.currency || null,
    };
  }
  return { prize_label: null, prize_amount: null, prize_currency: null };
}

/** Máxima ronda del bracket principal (excluye third_place, etc.). */
async function bracketMaxRound(conn, tournamentId) {
  const [mxRows] = await conn.execute(
    `SELECT MAX(round_number) AS mx FROM tournament_matches
     WHERE tournament_id = ? AND COALESCE(round_type, 'bracket') = 'bracket'`,
    [tournamentId]
  );
  return Number(mxRows[0]?.mx || 0);
}

/**
 * Tras una semifinal: si aplica, crea el cruce por 3° puesto entre perdedores.
 */
async function tryScheduleThirdPlaceMatch(conn, tournamentId, finishedMatch) {
  if (String(finishedMatch.round_type || 'bracket') !== 'bracket') return;

  const [tRows] = await conn.execute(
    'SELECT phase, placement_config FROM tournaments WHERE id = ? FOR UPDATE',
    [tournamentId]
  );
  if (!tRows.length) return;
  const placement = parseJsonField(tRows[0].placement_config, {});
  if (!placement.third_place_match) return;

  const phase = tRows[0].phase;
  if (phase === 'qualifier_a' || phase === 'qualifier_b') return;

  const maxR = await bracketMaxRound(conn, tournamentId);
  if (maxR < 2) return;

  const semiR = maxR - 1;
  if (Number(finishedMatch.round_number) !== semiR) return;

  const [exists] = await conn.execute(
    `SELECT id FROM tournament_matches
     WHERE tournament_id = ? AND round_type = 'third_place' AND status <> 'cancelled'
     LIMIT 1`,
    [tournamentId]
  );
  if (exists.length) return;

  const [semiMatches] = await conn.execute(
    `SELECT id, player1_id, player2_id, winner_id, status, match_number
     FROM tournament_matches
     WHERE tournament_id = ? AND COALESCE(round_type, 'bracket') = 'bracket' AND round_number = ?
     ORDER BY match_number ASC`,
    [tournamentId, semiR]
  );
  const done = semiMatches.filter((x) => ['finished', 'walkover'].includes(x.status));
  if (done.length < 2) return;

  const losers = [];
  for (const sm of done) {
    if (!sm.winner_id) return;
    const lid = Number(sm.player1_id) === Number(sm.winner_id) ? sm.player2_id : sm.player1_id;
    if (lid) losers.push(Number(lid));
  }
  if (losers.length !== 2) return;

  const maxMn = semiMatches.reduce((acc, x) => Math.max(acc, Number(x.match_number) || 0), 0);
  const nextMn = maxMn + 1;
  const p1 = losers[0];
  const p2 = losers[1];
  const ready = p1 && p2 ? 'ready' : 'pending';

  await conn.execute(
    `INSERT INTO tournament_matches
       (tournament_id, round_number, match_number, bracket_position,
        player1_id, player2_id, status, round_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'third_place')`,
    [tournamentId, maxR, nextMn, 999, p1, p2, ready]
  );
  await createEvent(conn, tournamentId, 'third_place_match_scheduled', { players: losers }, null, null);
}

async function applyThirdPlaceWinnerPlacement(conn, tournamentId, matchRow, winnerId) {
  await conn.execute(
    `UPDATE tournament_registrations SET final_position = 3
     WHERE tournament_id = ? AND user_id = ?
       AND status NOT IN ('winner','qualified','cancelled','no_show','disqualified')`,
    [tournamentId, winnerId]
  );
}

/** Lanza error si el torneo no existe; devuelve la fila */
async function assertTournamentExists(tournamentId) {
  const rows = await query('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
  if (!rows.length) throw new Error('Torneo no encontrado');
  return rows[0];
}

/** Cuenta titulares activos (registered + checked_in, SIN suplentes). Requiere conn. */
async function getActiveTitularCount(conn, tournamentId) {
  const [rows] = await conn.execute(
    `SELECT COUNT(*) AS cnt FROM tournament_registrations
     WHERE tournament_id = ? AND status IN ('registered','checked_in')`,
    [tournamentId]
  );
  return Number(rows[0].cnt);
}

/** Cuenta suplentes activos. Requiere conn. */
async function getSubstituteCount(conn, tournamentId) {
  const [rows] = await conn.execute(
    `SELECT COUNT(*) AS cnt FROM tournament_registrations
     WHERE tournament_id = ? AND status = 'substitute'`,
    [tournamentId]
  );
  return Number(rows[0].cnt);
}

/**
 * Núcleo del avance de ganador — se ejecuta DENTRO de una transacción existente.
 * Llena el slot del siguiente cruce o marca el resultado final (qualified / champion).
 */
async function _advanceWinnerConn(conn, matchId, winnerId) {
  const [rows] = await conn.execute(
    `SELECT tm.next_match_id, tm.next_slot, tm.tournament_id,
            tm.round_type,
            t.phase
     FROM tournament_matches tm
     JOIN tournaments t ON t.id = tm.tournament_id
     WHERE tm.id = ?`,
    [matchId]
  );
  if (!rows.length) return;

  const { next_match_id, next_slot, tournament_id: tId, phase, round_type: rt } = rows[0];
  if (String(rt || 'bracket') === 'third_place') {
    return;
  }
  const isQualifier = phase === 'qualifier_a' || phase === 'qualifier_b';

  if (!next_match_id) {
    // ── Final del bracket ────────────────────────────────────────────────────
    if (isQualifier) {
      await conn.execute(
        `UPDATE tournament_registrations SET status = 'qualified'
         WHERE tournament_id = ? AND user_id = ?`,
        [tId, winnerId]
      );
      await createEvent(conn, tId, 'player_qualified', { matchId, winnerId }, winnerId);

      // Si ya hay QUALIFY_COUNT clasificados, marcar torneo como terminado
      const [qRows] = await conn.execute(
        `SELECT COUNT(*) AS cnt FROM tournament_registrations
         WHERE tournament_id = ? AND status = 'qualified'`,
        [tId]
      );
      if (Number(qRows[0].cnt) >= QUALIFY_COUNT) {
        await conn.execute(
          "UPDATE tournaments SET status = 'finished', finished_at = COALESCE(finished_at, NOW()) WHERE id = ?",
          [tId]
        );
        await createEvent(conn, tId, 'qualifier_finished', { qualifiedCount: QUALIFY_COUNT });
      }
    } else {
      // finals / general → campeón
      await conn.execute(
        `UPDATE tournaments SET status = 'finished', winner_id = ?, finished_at = COALESCE(finished_at, NOW()) WHERE id = ?`,
        [winnerId, tId]
      );
      await conn.execute(
        `UPDATE tournament_registrations SET status = 'winner', final_position = 1
         WHERE tournament_id = ? AND user_id = ?`,
        [tId, winnerId]
      );
      await createEvent(conn, tId, 'champion', { matchId, winnerId }, winnerId);
    }
  } else {
    // ── Avanzar al siguiente cruce ───────────────────────────────────────────
    const col = next_slot === 'player1' ? 'player1_id' : 'player2_id';
    await conn.execute(
      `UPDATE tournament_matches SET ${col} = ? WHERE id = ?`,
      [winnerId, next_match_id]
    );

    // Si el siguiente cruce ya tiene ambos jugadores, activarlo
    const [nextRows] = await conn.execute(
      'SELECT player1_id, player2_id FROM tournament_matches WHERE id = ?',
      [next_match_id]
    );
    if (nextRows.length && nextRows[0].player1_id && nextRows[0].player2_id) {
      await conn.execute(
        "UPDATE tournament_matches SET status = 'ready' WHERE id = ?",
        [next_match_id]
      );
    }

    await createEvent(conn, tId, 'winner_advanced',
      { fromMatchId: matchId, toMatchId: next_match_id, slot: next_slot, winnerId },
      winnerId
    );
  }
}

/**
 * Marca al perdedor de un cruce ya finalizado (eliminatoria / clasificatorio).
 */
async function _markLoserFromFinishedMatch(conn, tournamentId, matchRow, loserId) {
  if (!loserId) return;

  if (String(matchRow.round_type || 'bracket') === 'third_place') {
    await conn.execute(
      `UPDATE tournament_registrations
       SET status = 'eliminated', eliminated_round = ?, final_position = 4
       WHERE tournament_id = ? AND user_id = ?
         AND status NOT IN ('winner','qualified','cancelled','no_show','disqualified')`,
      [matchRow.round_number, tournamentId, loserId]
    );
    return;
  }

  const [tRows] = await conn.execute(
    'SELECT phase, placement_config FROM tournaments WHERE id = ?',
    [tournamentId]
  );
  const phase = tRows[0]?.phase || 'general';
  const placement = parseJsonField(tRows[0]?.placement_config, {});
  const thirdOn = placement.third_place_match === true;
  const isQual = phase === 'qualifier_a' || phase === 'qualifier_b';

  const maxR = await bracketMaxRound(conn, tournamentId);
  const r = Number(matchRow.round_number || 0);

  let finalPosition = null;
  if (!isQual && maxR > 0) {
    if (r === maxR) finalPosition = 2;
    else if (maxR > 1 && r === maxR - 1) {
      if (!thirdOn) finalPosition = 3;
    }
  }

  let sql =
    `UPDATE tournament_registrations
     SET status = 'eliminated', eliminated_round = ?`;
  const params = [r];
  if (finalPosition != null) {
    sql += ', final_position = ?';
    params.push(finalPosition);
  }
  sql += ` WHERE tournament_id = ? AND user_id = ?
     AND status NOT IN ('winner','qualified','cancelled','no_show','disqualified')`;
  params.push(tournamentId, loserId);

  await conn.execute(sql, params);
}

/**
 * Procesa walkovers/byes iterativamente dentro de una transacción.
 * Maneja byes encadenados (ej: n=5 jugadores → byes en R1 y R2).
 *
 * Pases:
 *   1. Cancela cruces con ambos jugadores nulos.
 *   2. Finaliza cruces con un jugador real y un null → walkover para el real.
 * Repite hasta que no haya cambios (máx. 20 iteraciones como guard).
 */
async function _processAllByes(conn, tournamentId) {
  let changed    = true;
  let iterations = 0;

  while (changed && iterations < 20) {
    iterations++;
    changed = false;

    // Cancelar cruces sin ningún jugador (ambos null)
    const [bothNull] = await conn.execute(
      `SELECT id FROM tournament_matches
       WHERE tournament_id = ? AND status NOT IN ('finished','walkover','cancelled')
         AND player1_id IS NULL AND player2_id IS NULL`,
      [tournamentId]
    );
    for (const m of bothNull) {
      await conn.execute(
        "UPDATE tournament_matches SET status = 'cancelled' WHERE id = ?",
        [m.id]
      );
      changed = true;
    }

    // Walkover: un jugador real, el otro null
    const [singles] = await conn.execute(
      `SELECT id, player1_id, player2_id FROM tournament_matches
       WHERE tournament_id = ? AND status NOT IN ('finished','walkover','cancelled')
         AND (
           (player1_id IS NOT NULL AND player2_id IS NULL) OR
           (player1_id IS NULL     AND player2_id IS NOT NULL)
         )`,
      [tournamentId]
    );
    for (const m of singles) {
      const winner = m.player1_id !== null ? m.player1_id : m.player2_id;
      await conn.execute(
        `UPDATE tournament_matches
         SET status = 'finished', winner_id = ?, loser_id = NULL, finished_at = NOW()
         WHERE id = ?`,
        [winner, m.id]
      );
      await _advanceWinnerConn(conn, m.id, winner);
      changed = true;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API PÚBLICA
// ─────────────────────────────────────────────────────────────────────────────

const TournamentService = {

  // ── 1. listTournaments ────────────────────────────────────────────────────
  /**
   * Lista todos los torneos con conteos y, si se pasa userId, el estado del
   * usuario en cada torneo (myStatus).
   */
  async listTournaments(userId = null) {
    const rows = await query(
      `SELECT
         t.id, t.name, t.description, t.prize_text,
         t.max_players, t.status, t.format, t.phase,
         t.puntos_maximos, t.flor_habilitada,
         t.starts_at, t.checkin_starts_at, t.registration_closes_at,
         t.entry_fee, t.prize_amount, t.is_paid,
         t.auto_checkin_enabled, t.auto_start_enabled,
         t.checkin_closed_at, t.bracket_generated_at, t.ready_timeout_minutes,
         t.winner_id, t.created_at,
         t.prize_config, t.placement_config,
         SUM(CASE WHEN tr.status IN ('registered','checked_in') THEN 1 ELSE 0 END) AS titular_count,
         SUM(CASE WHEN tr.status = 'substitute'                  THEN 1 ELSE 0 END) AS substitute_count
       FROM tournaments t
       LEFT JOIN tournament_registrations tr ON tr.tournament_id = t.id
       GROUP BY t.id
       ORDER BY
         FIELD(t.status,'checkin','started','open','draft','finished','cancelled'),
         t.starts_at ASC`,
      []
    );

    if (!userId || !rows.length) return rows;

    const ids          = rows.map(r => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const myRegs       = await query(
      `SELECT tournament_id, status FROM tournament_registrations
       WHERE user_id = ? AND tournament_id IN (${placeholders})`,
      [userId, ...ids]
    );
    const myMap = Object.fromEntries(myRegs.map(r => [r.tournament_id, r.status]));
    for (const t of rows) t.myStatus = myMap[t.id] || null;

    return rows;
  },

  // ── 2. getTournament ──────────────────────────────────────────────────────
  /**
   * Detalle completo: datos del torneo, conteos, myRegistration,
   * listas de titulares/suplentes y bracket si ya existe.
   * No expone email, wallet ni datos de identidad.
   */
  async getTournament(tournamentId, userId = null) {
    const tRows = await query(
      `SELECT
         t.id, t.name, t.description, t.prize_text,
         t.max_players, t.status, t.format, t.phase,
         t.puntos_maximos, t.flor_habilitada,
         t.turn_seconds, t.reconnect_seconds,
         t.starts_at, t.checkin_starts_at, t.registration_closes_at,
         t.entry_fee, t.prize_amount, t.is_paid,
         t.auto_checkin_enabled, t.auto_start_enabled,
         t.checkin_closed_at, t.bracket_generated_at, t.ready_timeout_minutes,
         t.winner_id, t.created_at, t.updated_at,
         t.prize_config, t.placement_config,
         u.username AS winner_username, u.avatar AS winner_avatar,
         SUM(CASE WHEN tr.status IN ('registered','checked_in') THEN 1 ELSE 0 END) AS titular_count,
         SUM(CASE WHEN tr.status = 'substitute'                  THEN 1 ELSE 0 END) AS substitute_count
       FROM tournaments t
       LEFT JOIN usuarios u               ON u.id = t.winner_id
       LEFT JOIN tournament_registrations tr ON tr.tournament_id = t.id
       WHERE t.id = ?
       GROUP BY t.id`,
      [tournamentId]
    );
    if (!tRows.length) throw new Error('Torneo no encontrado');
    const tournament = tRows[0];

    // Mi inscripción
    tournament.myRegistration = null;
    if (userId) {
      const myRows = await query(
        `SELECT status, position_number, seed, checked_in_at, created_at,
                paid_amount, payment_tx_id, refunded_at, final_position, eliminated_round
         FROM tournament_registrations WHERE tournament_id = ? AND user_id = ?`,
        [tournamentId, userId]
      );
      tournament.myRegistration = myRows[0] || null;
    }

    // Titulares + estados post-bracket (eliminated, qualified, winner)
    tournament.titulars = await query(
      `SELECT tr.user_id AS id, u.username, u.avatar,
              tr.status, tr.position_number, tr.seed, tr.checked_in_at,
              r.elo
       FROM tournament_registrations tr
       JOIN   usuarios u ON u.id = tr.user_id
       LEFT JOIN ranking r ON r.user_id = tr.user_id
       WHERE tr.tournament_id = ?
         AND tr.status IN ('registered','checked_in','eliminated','qualified','winner')
       ORDER BY tr.position_number ASC`,
      [tournamentId]
    );

    // Suplentes
    tournament.substitutes = await query(
      `SELECT tr.user_id AS id, u.username, u.avatar,
              tr.status, tr.position_number, tr.checked_in_at,
              r.elo
       FROM tournament_registrations tr
       JOIN   usuarios u ON u.id = tr.user_id
       LEFT JOIN ranking r ON r.user_id = tr.user_id
       WHERE tr.tournament_id = ? AND tr.status = 'substitute'
       ORDER BY tr.position_number ASC`,
      [tournamentId]
    );

    // Bracket básico si existe
    const matchRows = await query(
      `SELECT tm.*,
              p1.username AS p1_username, p1.avatar AS p1_avatar,
              p2.username AS p2_username, p2.avatar AS p2_avatar,
              w.username  AS w_username,  w.avatar  AS w_avatar
       FROM tournament_matches tm
       LEFT JOIN usuarios p1 ON p1.id = tm.player1_id
       LEFT JOIN usuarios p2 ON p2.id = tm.player2_id
       LEFT JOIN usuarios w  ON w.id  = tm.winner_id
       WHERE tm.tournament_id = ?
       ORDER BY tm.round_number ASC, tm.match_number ASC`,
      [tournamentId]
    );
    tournament.bracket = matchRows.length
      ? groupMatchesByRound(matchRows.map(normalizeMatch))
      : null;

    return tournament;
  },

  // ── 3. register ───────────────────────────────────────────────────────────
  /**
   * Inscribe un usuario en el torneo.
   * Usa transacción + FOR UPDATE para evitar race conditions en el último cupo.
   */
  async register(tournamentId, userId) {
    await VerificationService.requireVerifiedForTournaments(userId);

    return withTransaction(async (conn) => {
      const [tRows] = await conn.execute(
        `SELECT id, status, max_players, entry_fee, is_paid
         FROM tournaments WHERE id = ? FOR UPDATE`,
        [tournamentId]
      );
      if (!tRows.length) throw new Error('Torneo no encontrado');
      const t = tRows[0];
      if (t.status !== 'open') throw new Error('El torneo no está abierto para inscripción');

      const entryFee = parseFloat(t.entry_fee || 0);
      const chargeAmount = entryFee > 0 ? entryFee : 0;

      const [existing] = await conn.execute(
        'SELECT id, status FROM tournament_registrations WHERE tournament_id = ? AND user_id = ? FOR UPDATE',
        [tournamentId, userId]
      );
      if (existing.length && ACTIVE_REG_STATUSES.includes(existing[0].status)) {
        throw new Error('Ya estás inscripto en este torneo');
      }

      const titularCount = await getActiveTitularCount(conn, tournamentId);
      const isTitular    = titularCount < t.max_players;
      const newStatus    = isTitular ? 'registered' : 'substitute';

      let paymentTxId = null;
      let paidAmount  = 0;

      if (isTitular && chargeAmount > 0) {
        const idem = `trn_entry:${tournamentId}:${userId}:register`;
        const ref  = `tournament:register:${tournamentId}`;
        const pay  = await WalletService.debitTournamentEntry(
          conn, userId, chargeAmount, ref, idem
        );
        paymentTxId = pay.transactionId;
        paidAmount  = chargeAmount;
      }

      if (isTitular) {
        const [posRows] = await conn.execute(
          `SELECT COALESCE(MAX(position_number), 0) AS maxPos
           FROM tournament_registrations
           WHERE tournament_id = ? AND status IN ('registered','checked_in')`,
          [tournamentId]
        );
        const pos = Number(posRows[0].maxPos) + 1;

        if (existing.length) {
          await conn.execute(
            `UPDATE tournament_registrations
             SET status = 'registered', position_number = ?, seed = NULL, checked_in_at = NULL,
                 paid_amount = ?, payment_tx_id = ?, refunded_at = NULL
             WHERE tournament_id = ? AND user_id = ?`,
            [pos, paidAmount, paymentTxId, tournamentId, userId]
          );
        } else {
          await conn.execute(
            `INSERT INTO tournament_registrations
               (tournament_id, user_id, status, position_number, paid_amount, payment_tx_id)
             VALUES (?, ?, 'registered', ?, ?, ?)`,
            [tournamentId, userId, pos, paidAmount, paymentTxId]
          );
        }
      } else {
        const subCount = await getSubstituteCount(conn, tournamentId);
        const subPos   = subCount + 1;

        if (existing.length) {
          await conn.execute(
            `UPDATE tournament_registrations
             SET status = 'substitute', position_number = ?, checked_in_at = NULL,
                 paid_amount = 0, payment_tx_id = NULL, refunded_at = NULL
             WHERE tournament_id = ? AND user_id = ?`,
            [subPos, tournamentId, userId]
          );
        } else {
          await conn.execute(
            `INSERT INTO tournament_registrations
               (tournament_id, user_id, status, position_number, paid_amount, payment_tx_id)
             VALUES (?, ?, 'substitute', ?, 0, NULL)`,
            [tournamentId, userId, subPos]
          );
        }
      }

      await createEvent(conn, tournamentId,
        isTitular ? 'registered' : 'substitute_registered',
        { paidAmount },
        userId
      );
      return { ok: true, status: newStatus, paidAmount };
    });
  },

  // ── 4. unregister ─────────────────────────────────────────────────────────
  /** Cancela la inscripción. No borra la fila — cambia status a 'cancelled'. */
  async unregister(tournamentId, userId) {
    const t = await assertTournamentExists(tournamentId);
    if (!['open', 'checkin'].includes(t.status)) {
      throw new Error('No podés retirarte de un torneo que ya comenzó');
    }

    return withTransaction(async (conn) => {
      const [rows] = await conn.execute(
        `SELECT id, status, paid_amount, payment_tx_id, refunded_at
         FROM tournament_registrations
         WHERE tournament_id = ? AND user_id = ? FOR UPDATE`,
        [tournamentId, userId]
      );
      if (!rows.length || !ACTIVE_REG_STATUSES.includes(rows[0].status)) {
        throw new Error('No estás inscripto en este torneo');
      }
      const reg = rows[0];
      const paid  = parseFloat(reg.paid_amount || 0);

      if (paid > 0 && reg.payment_tx_id && !reg.refunded_at) {
        const idem = `trn_refund:${tournamentId}:${userId}:${reg.id}`;
        const ref  = `tournament:unregister:${tournamentId}`;
        await WalletService.creditTournamentRefund(conn, userId, paid, ref, idem);
        await conn.execute(
          'UPDATE tournament_registrations SET refunded_at = NOW() WHERE id = ?',
          [reg.id]
        );
      }

      await conn.execute(
        `UPDATE tournament_registrations SET status = 'cancelled'
         WHERE tournament_id = ? AND user_id = ?`,
        [tournamentId, userId]
      );
      await createEvent(conn, tournamentId, 'unregistered', { refunded: paid > 0 }, userId);
      return { ok: true };
    });
  },

  // ── 5. checkin ────────────────────────────────────────────────────────────
  /**
   * Registra el check-in de un jugador.
   * - registered  → checked_in
   * - substitute  → substitute + checked_in_at (mantiene status)
   * - Idempotente si ya hizo check-in.
   */
  async checkin(tournamentId, userId) {
    const t = await assertTournamentExists(tournamentId);
    if (t.status !== 'checkin') throw new Error('El check-in no está abierto');

    const rows = await query(
      `SELECT id, status, checked_in_at FROM tournament_registrations
       WHERE tournament_id = ? AND user_id = ?`,
      [tournamentId, userId]
    );
    if (!rows.length) throw new Error('No estás inscripto en este torneo');
    const reg = rows[0];

    // Idempotente
    if (reg.status === 'checked_in') return { ok: true, alreadyDone: true };
    if (reg.status === 'substitute' && reg.checked_in_at) return { ok: true, alreadyDone: true };

    if (!['registered', 'substitute'].includes(reg.status)) {
      throw new Error('No podés hacer check-in con tu estado actual');
    }

    // registered → checked_in; substitute se queda como substitute pero registra timestamp
    const newStatus = reg.status === 'registered' ? 'checked_in' : 'substitute';
    await query(
      `UPDATE tournament_registrations
       SET status = ?, checked_in_at = NOW()
       WHERE tournament_id = ? AND user_id = ?`,
      [newStatus, tournamentId, userId]
    );
    await createEvent(null, tournamentId, 'checked_in', null, userId);
    return { ok: true };
  },

  /**
   * Cierra check-in: titulares sin check-in → no_show, promueve suplentes con check-in
   * hasta completar max_players. En torneos con costo, cobra al promover (idempotente).
   */
  async closeCheckinAndPromoteSubstitutes(tournamentId, adminId = null) {
    return withTransaction(async (conn) => {
      const [tRows] = await conn.execute(
        'SELECT * FROM tournaments WHERE id = ? FOR UPDATE',
        [tournamentId]
      );
      if (!tRows.length) throw new Error('Torneo no encontrado');
      const t = tRows[0];
      if (t.status !== 'checkin') {
        throw new Error('El torneo no está en check-in');
      }
      if (t.checkin_closed_at) {
        return { ok: true, alreadyClosed: true };
      }

      const [pendingNoShow] = await conn.execute(
        `SELECT user_id FROM tournament_registrations
         WHERE tournament_id = ? AND status = 'registered' AND checked_in_at IS NULL`,
        [tournamentId]
      );
      await conn.execute(
        `UPDATE tournament_registrations SET status = 'no_show'
         WHERE tournament_id = ? AND status = 'registered' AND checked_in_at IS NULL`,
        [tournamentId]
      );
      for (const row of pendingNoShow) {
        await createEvent(conn, tournamentId, 'player_no_show', { userId: row.user_id }, row.user_id, adminId);
      }

      const [cntRows] = await conn.execute(
        `SELECT COUNT(*) AS c FROM tournament_registrations
         WHERE tournament_id = ? AND status = 'checked_in'`,
        [tournamentId]
      );
      let slots = Math.max(0, Number(t.max_players) - Number(cntRows[0].c));

      const entryFee = parseFloat(t.entry_fee || 0);
      const paidTournament = entryFee > 0;

      const [subs] = await conn.execute(
        `SELECT id, user_id, position_number FROM tournament_registrations
         WHERE tournament_id = ? AND status = 'substitute' AND checked_in_at IS NOT NULL
         ORDER BY position_number ASC`,
        [tournamentId]
      );

      for (const sub of subs) {
        if (slots <= 0) break;

        const [mxPos] = await conn.execute(
          `SELECT COALESCE(MAX(position_number), 0) AS m
           FROM tournament_registrations
           WHERE tournament_id = ? AND status = 'checked_in'`,
          [tournamentId]
        );
        const nextPos = Number(mxPos[0].m) + 1;

        if (paidTournament) {
          const idem = `trn_entry:${tournamentId}:${sub.user_id}:promote:${sub.id}`;
          const ref  = `tournament:promote:${tournamentId}`;
          try {
            const pay = await WalletService.debitTournamentEntry(
              conn, sub.user_id, entryFee, ref, idem
            );
            if (!pay.alreadyProcessed) {
              await conn.execute(
                `UPDATE tournament_registrations
                 SET status = 'checked_in', position_number = ?,
                     paid_amount = ?, payment_tx_id = ?
                 WHERE id = ?`,
                [nextPos, entryFee, pay.transactionId, sub.id]
              );
            } else {
              await conn.execute(
                `UPDATE tournament_registrations
                 SET status = 'checked_in', position_number = ?
                 WHERE id = ?`,
                [nextPos, sub.id]
              );
            }
          } catch (e) {
            if (String(e.message || '').includes('Saldo insuficiente')) {
              await createEvent(conn, tournamentId, 'substitute_payment_failed',
                { userId: sub.user_id, registrationId: sub.id }, sub.user_id, adminId);
              continue;
            }
            throw e;
          }
        } else {
          await conn.execute(
            `UPDATE tournament_registrations
             SET status = 'checked_in', position_number = ?
             WHERE id = ?`,
            [nextPos, sub.id]
          );
        }

        await createEvent(conn, tournamentId, 'substitute_promoted',
          { userId: sub.user_id, registrationId: sub.id }, sub.user_id, adminId);
        slots--;
      }

      await conn.execute(
        `UPDATE tournaments SET checkin_closed_at = NOW() WHERE id = ?`,
        [tournamentId]
      );
      return { ok: true };
    });
  },

  // ── 6. getBracket ─────────────────────────────────────────────────────────
  /**
   * Devuelve bracket agrupado por ronda con jugadores, estado y readiness.
   */
  async getBracket(tournamentId) {
    const t = await assertTournamentExists(tournamentId);

    const matchRows = await query(
      `SELECT tm.*,
              p1.username AS p1_username, p1.avatar AS p1_avatar,
              p2.username AS p2_username, p2.avatar AS p2_avatar,
              w.username  AS w_username,  w.avatar  AS w_avatar
       FROM tournament_matches tm
       LEFT JOIN usuarios p1 ON p1.id = tm.player1_id
       LEFT JOIN usuarios p2 ON p2.id = tm.player2_id
       LEFT JOIN usuarios w  ON w.id  = tm.winner_id
       WHERE tm.tournament_id = ?
       ORDER BY tm.round_number ASC, tm.match_number ASC`,
      [tournamentId]
    );

    return {
      tournament: {
        id:               t.id,
        name:             t.name,
        status:           t.status,
        phase:            t.phase,
        puntos_maximos:   t.puntos_maximos,
        flor_habilitada:  !!t.flor_habilitada,
        turn_seconds:     t.turn_seconds,
        reconnect_seconds: t.reconnect_seconds,
      },
      rounds: groupMatchesByRound(matchRows.map(normalizeMatch)),
    };
  },

  // ── 7. generateBracket ────────────────────────────────────────────────────
  /**
   * Genera el bracket del torneo.
   *
   * Algoritmo en 3 pasadas dentro de una transacción:
   *   1. Insertar todos los cruces (R1 a Rn) con jugadores solo en R1.
   *   2. Enlazar next_match_id / next_slot entre rondas.
   *   3. Procesar byes iterativamente (_processAllByes).
   *
   * Rondas por fase:
   *   - qualifier_a/b (64 jugadores):  4 rondas → 4 clasificados
   *   - finals        (8 jugadores):   3 rondas → 1 campeón
   *   - general:      log2(bracketSize) rondas → 1 campeón
   */
  async generateBracket(tournamentId, adminId) {
    const t = await assertTournamentExists(tournamentId);
    if (!['checkin', 'open', 'draft'].includes(t.status)) {
      throw new Error('El torneo no está en un estado válido para generar el bracket');
    }

    const existingCount = await query(
      'SELECT COUNT(*) AS cnt FROM tournament_matches WHERE tournament_id = ?',
      [tournamentId]
    );
    if (Number(existingCount[0].cnt) > 0) throw new Error('El bracket ya fue generado');

    // Jugadores: titulares con check-in primero, luego suplentes con check-in
    const titulars = await query(
      `SELECT user_id FROM tournament_registrations
       WHERE tournament_id = ? AND status = 'checked_in'
       ORDER BY position_number ASC`,
      [tournamentId]
    );
    const subs = await query(
      `SELECT user_id FROM tournament_registrations
       WHERE tournament_id = ? AND status = 'substitute' AND checked_in_at IS NOT NULL
       ORDER BY position_number ASC`,
      [tournamentId]
    );

    let players = [
      ...titulars.map(r => r.user_id),
      ...subs.map(r => r.user_id),
    ];

    if (players.length < 2) {
      throw new Error('No hay jugadores suficientes para generar el bracket');
    }

    const phase       = t.phase;
    const isQualifier = phase === 'qualifier_a' || phase === 'qualifier_b';

    // Caso degenerado: clasificatorio con <= QUALIFY_COUNT jugadores → clasifican directamente
    if (isQualifier && players.length <= QUALIFY_COUNT) {
      const ph = players.map(() => '?').join(',');
      await query(
        `UPDATE tournament_registrations SET status = 'qualified'
         WHERE tournament_id = ? AND user_id IN (${ph})`,
        [tournamentId, ...players]
      );
      await query(
        "UPDATE tournaments SET status = 'finished', bracket_generated_at = NOW(), finished_at = COALESCE(finished_at, NOW()) WHERE id = ?",
        [tournamentId]
      );
      await createEvent(null, tournamentId, 'bracket_generated',
        { method: 'direct_qualify', playerCount: players.length }, null, adminId);
      return { ok: true, method: 'direct_qualify', qualifiedCount: players.length };
    }

    // Shuffle y padding
    players = shuffle(players);
    const bracketSize = nextPowerOfTwo(players.length);

    // Determinar rondas totales
    let totalRounds;
    if (isQualifier) {
      totalRounds = bracketSize <= QUALIFY_COUNT
        ? 1
        : intLog2(bracketSize / QUALIFY_COUNT);
    } else {
      // finals / general / single_elimination → hasta 1 campeón
      totalRounds = intLog2(bracketSize);
    }

    while (players.length < bracketSize) players.push(null);

    return withTransaction(async (conn) => {
      // ── Pasada 1: insertar cruces ──────────────────────────────────────────
      // idMap[round][matchNum] = insertId
      const idMap = {};

      for (let round = 1; round <= totalRounds; round++) {
        const matchCount = bracketSize / Math.pow(2, round);
        idMap[round] = {};

        for (let matchNum = 1; matchNum <= matchCount; matchNum++) {
          let p1 = null, p2 = null;
          if (round === 1) {
            p1 = players[(matchNum - 1) * 2]     ?? null;
            p2 = players[(matchNum - 1) * 2 + 1] ?? null;
          }

          // En R1, si ambos jugadores reales → ready; si uno null → pending (bye se resolverá)
          let status = 'pending';
          if (round === 1 && p1 !== null && p2 !== null) status = 'ready';

          const [res] = await conn.execute(
            `INSERT INTO tournament_matches
               (tournament_id, round_number, match_number, bracket_position,
                player1_id, player2_id, status, round_type)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'bracket')`,
            [tournamentId, round, matchNum, matchNum, p1, p2, status]
          );
          idMap[round][matchNum] = res.insertId;
        }
      }

      // ── Pasada 2: enlazar next_match_id / next_slot ────────────────────────
      // Patrón: match m de round r → Math.ceil(m/2) de round r+1
      //         m impar  → slot player1; m par → slot player2
      for (let round = 1; round < totalRounds; round++) {
        const matchCount = bracketSize / Math.pow(2, round);
        for (let matchNum = 1; matchNum <= matchCount; matchNum++) {
          const nextMatchNum = Math.ceil(matchNum / 2);
          const nextSlot     = matchNum % 2 === 1 ? 'player1' : 'player2';
          const nextId       = idMap[round + 1]?.[nextMatchNum];
          if (!nextId) continue;
          await conn.execute(
            `UPDATE tournament_matches SET next_match_id = ?, next_slot = ? WHERE id = ?`,
            [nextId, nextSlot, idMap[round][matchNum]]
          );
        }
      }

      // ── Pasada 3: resolver byes y walkovers iterativamente ─────────────────
      await _processAllByes(conn, tournamentId);

      // Actualizar metadatos del torneo (no cambia a "started" aquí — eso es startTournament / auto-start)
      const [tCheck] = await conn.execute(
        'SELECT status FROM tournaments WHERE id = ?',
        [tournamentId]
      );
      if (tCheck.length && tCheck[0].status !== 'finished') {
        await conn.execute(
          `UPDATE tournaments SET bracket_generated_at = NOW() WHERE id = ?`,
          [tournamentId]
        );
      }

      const totalMatches = Object.values(idMap).reduce(
        (sum, round) => sum + Object.keys(round).length, 0
      );
      await createEvent(conn, tournamentId, 'bracket_generated',
        {
          totalRounds, bracketSize,
          playerCount: titulars.length + subs.length,
          totalMatches,
        },
        null, adminId
      );

      logger.info(
        `Bracket generado: tournament=${tournamentId} rondas=${totalRounds} ` +
        `size=${bracketSize} matches=${totalMatches}`
      );
      return { ok: true, totalRounds, bracketSize, totalMatches };
    });
  },

  // ── 8. setPlayerReady ─────────────────────────────────────────────────────
  /**
   * Marca a un jugador como listo en un cruce.
   * - Primer listo: status → waiting_ready, ready_deadline se fija.
   * - Ambos listos: devuelve bothReady: true (la Etapa 4 creará la partida).
   * - Idempotente si ya estaba listo.
   */
  async setPlayerReady(tournamentId, matchId, userId) {
    return withTransaction(async (conn) => {
      const [rows] = await conn.execute(
        `SELECT tm.*, t.ready_timeout_minutes AS rtm
         FROM tournament_matches tm
         JOIN tournaments t ON t.id = tm.tournament_id
         WHERE tm.id = ? AND tm.tournament_id = ? FOR UPDATE`,
        [matchId, tournamentId]
      );
      if (!rows.length) throw new Error('El cruce no existe en este torneo');
      const m = rows[0];

      if (!['ready', 'waiting_ready'].includes(m.status)) {
        throw new Error('El cruce no está listo');
      }

      const isP1 = Number(m.player1_id) === Number(userId);
      const isP2 = Number(m.player2_id) === Number(userId);
      if (!isP1 && !isP2) throw new Error('No sos jugador de este cruce');

      // Idempotente
      if ((isP1 && m.player1_ready) || (isP2 && m.player2_ready)) {
        return {
          ok:           true,
          alreadyReady: true,
          bothReady:    !!(m.player1_ready && m.player2_ready),
        };
      }

      const newP1 = isP1 ? 1 : (m.player1_ready ? 1 : 0);
      const newP2 = isP2 ? 1 : (m.player2_ready ? 1 : 0);
      const bothReady = newP1 === 1 && newP2 === 1;
      const mins = Math.min(60, Math.max(1, Number(m.rtm) || 5));

      await conn.execute(
        `UPDATE tournament_matches
         SET player1_ready = ?, player2_ready = ?,
             player1_ready_at = IF(? = 1, COALESCE(player1_ready_at, NOW()), player1_ready_at),
             player2_ready_at = IF(? = 1, COALESCE(player2_ready_at, NOW()), player2_ready_at),
             status        = ?,
             ready_deadline = COALESCE(ready_deadline, DATE_ADD(NOW(), INTERVAL ? MINUTE))
         WHERE id = ?`,
        [newP1, newP2, isP1 ? 1 : 0, isP2 ? 1 : 0, bothReady ? 'ready' : 'waiting_ready', mins, matchId]
      );

      await createEvent(conn, tournamentId, 'player_ready',
        { matchId, slot: isP1 ? 'player1' : 'player2', bothReady },
        userId
      );
      return { ok: true, bothReady, matchId };
    });
  },

  /**
   * Cancela "listo" antes de que el cruce pase a activo / ambos listos inicien partida.
   */
  async unsetPlayerReady(tournamentId, matchId, userId) {
    return withTransaction(async (conn) => {
      const [rows] = await conn.execute(
        `SELECT * FROM tournament_matches
         WHERE id = ? AND tournament_id = ? FOR UPDATE`,
        [matchId, tournamentId]
      );
      if (!rows.length) throw new Error('El cruce no existe en este torneo');
      const m = rows[0];

      if (m.status === 'active') {
        throw new Error('No podés cancelar listo: la partida ya comenzó.');
      }
      if (!['ready', 'waiting_ready'].includes(m.status)) {
        throw new Error('El cruce no está listo');
      }

      const isP1 = Number(m.player1_id) === Number(userId);
      const isP2 = Number(m.player2_id) === Number(userId);
      if (!isP1 && !isP2) throw new Error('No sos jugador de este cruce');

      if ((isP1 && !m.player1_ready) || (isP2 && !m.player2_ready)) {
        return { ok: true, alreadyNotReady: true };
      }

      const newP1 = isP1 ? 0 : (m.player1_ready ? 1 : 0);
      const newP2 = isP2 ? 0 : (m.player2_ready ? 1 : 0);
      const neither = newP1 === 0 && newP2 === 0;
      const newStatus = neither ? 'ready' : 'waiting_ready';
      const newDeadline = neither ? null : m.ready_deadline;

      await conn.execute(
        `UPDATE tournament_matches
         SET player1_ready = ?, player2_ready = ?,
             player1_ready_at = IF(? = 1, NULL, player1_ready_at),
             player2_ready_at = IF(? = 1, NULL, player2_ready_at),
             status = ?, ready_deadline = ?, ready_cancelled_by = ?
         WHERE id = ?`,
        [
          newP1, newP2,
          isP1 ? 1 : 0,
          isP2 ? 1 : 0,
          newStatus,
          newDeadline,
          userId,
          matchId,
        ]
      );

      await createEvent(conn, tournamentId, 'player_unready',
        { matchId, slot: isP1 ? 'player1' : 'player2' },
        userId
      );
      return { ok: true, matchId, newStatus };
    });
  },

  // ── 9. forceResult ────────────────────────────────────────────────────────
  /**
   * Admin fuerza el resultado de un cruce (o walkover automático).
   * Actualiza match, marca perdedor y avanza el ganador en la misma transacción.
   */
  async forceResult(tournamentId, matchId, winnerId, adminId, reason = 'admin_decision') {
    await withTransaction(async (conn) => {
      const [rows] = await conn.execute(
        `SELECT * FROM tournament_matches
         WHERE id = ? AND tournament_id = ? FOR UPDATE`,
        [matchId, tournamentId]
      );
      if (!rows.length) throw new Error('El cruce no existe en este torneo');
      const m = rows[0];

      if (['finished', 'walkover'].includes(m.status)) {
        throw new Error('Este cruce ya fue finalizado');
      }
      if (m.winner_id) throw new Error('Este cruce ya tiene un ganador');

      const validPlayers = [Number(m.player1_id), Number(m.player2_id)].filter(Boolean);
      if (!validPlayers.includes(Number(winnerId))) throw new Error('Ganador inválido');

      const loserId     = Number(m.player1_id) === Number(winnerId) ? m.player2_id : m.player1_id;
      const matchStatus = reason === 'no_show' || reason === 'ready_timeout' ? 'walkover' : 'finished';

      await conn.execute(
        `UPDATE tournament_matches
         SET winner_id = ?, loser_id = ?, status = ?, finished_at = NOW()
         WHERE id = ?`,
        [winnerId, loserId, matchStatus, matchId]
      );
      await createEvent(conn, tournamentId, 'admin_force_result',
        { matchId, winnerId, loserId, reason }, null, adminId
      );
      await _markLoserFromFinishedMatch(conn, tournamentId, m, loserId);
      await _advanceWinnerConn(conn, matchId, winnerId);
      if (String(m.round_type || 'bracket') === 'third_place') {
        await applyThirdPlaceWinnerPlacement(conn, tournamentId, m, winnerId);
      } else {
        await tryScheduleThirdPlaceMatch(conn, tournamentId, m);
      }
    });

    return { ok: true };
  },

  // ── 10. advanceWinner ─────────────────────────────────────────────────────
  /**
   * Avanza al ganador al siguiente cruce, o lo marca como classified/champion
   * si era el último cruce del bracket.
   */
  async advanceWinner(matchId, winnerId) {
    return withTransaction(async (conn) => {
      await _advanceWinnerConn(conn, matchId, winnerId);
      return { ok: true };
    });
  },

  // ── 12. createTournament ─────────────────────────────────────────────────
  /**
   * Admin crea un torneo nuevo en estado 'draft'.
   * Valida campos requeridos y rangos permitidos.
   */
  async createTournament(adminId, body) {
    const {
      name,
      description          = null,
      prize_text           = null,
      max_players          = 128,
      format               = 'single_elimination',
      phase                = 'general',
      puntos_maximos       = 15,
      flor_habilitada      = 0,
      turn_seconds         = 30,
      reconnect_seconds    = 60,
      entry_fee            = 0,
      prize_amount         = null,
      is_paid              = 0,
      auto_checkin_enabled = 1,
      auto_start_enabled   = 1,
      ready_timeout_minutes = 5,
      starts_at            = null,
      checkin_starts_at    = null,
      registration_closes_at = null,
      prize_config         = null,
      placement_config     = null,
    } = body || {};

    if (!name?.trim()) throw new Error('Nombre obligatorio');

    const nPlayers = parseInt(max_players, 10);
    if (!isFinite(nPlayers) || nPlayers < 2 || nPlayers > 128) {
      throw new Error('max_players debe estar entre 2 y 128');
    }
    if (![15, 30].includes(Number(puntos_maximos))) {
      throw new Error('puntos_maximos debe ser 15 o 30');
    }
    const ts = parseInt(turn_seconds, 10);
    if (!isFinite(ts) || ts < 10 || ts > 120) {
      throw new Error('turn_seconds debe estar entre 10 y 120');
    }
    const rs = parseInt(reconnect_seconds, 10);
    if (!isFinite(rs) || rs < 30 || rs > 300) {
      throw new Error('reconnect_seconds debe estar entre 30 y 300');
    }

    const validFormats = ['single_elimination', 'qualifier', 'finals'];
    const validPhases  = ['qualifier_a', 'qualifier_b', 'finals', 'general'];
    if (!validFormats.includes(format)) throw new Error('Formato inválido');
    if (!validPhases.includes(phase))   throw new Error('Fase inválida');

    const fee = parseFloat(entry_fee);
    if (!isFinite(fee) || fee < 0) throw new Error('entry_fee inválido');
    const paidFlag = Number(is_paid) === 1;
    if (paidFlag && (!fee || fee <= 0)) {
      throw new Error('Torneo pago: definí entry_fee mayor a 0.');
    }
    const rtm = parseInt(ready_timeout_minutes, 10);
    if (!isFinite(rtm) || rtm < 1 || rtm > 60) {
      throw new Error('ready_timeout_minutes debe estar entre 1 y 60');
    }

    const prizeConfigJson =
      prize_config == null
        ? null
        : typeof prize_config === 'string'
          ? prize_config
          : JSON.stringify(prize_config);
    const placementConfigJson =
      placement_config == null
        ? null
        : typeof placement_config === 'string'
          ? placement_config
          : JSON.stringify(placement_config);

    const result = await query(
      `INSERT INTO tournaments
         (name, description, prize_text, max_players, format, phase,
          puntos_maximos, flor_habilitada, turn_seconds, reconnect_seconds,
          entry_fee, prize_amount, is_paid, auto_checkin_enabled, auto_start_enabled,
          ready_timeout_minutes,
          starts_at, checkin_starts_at, registration_closes_at,
          prize_config, placement_config,
          status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
      [
        name.trim().substring(0, 120),
        description?.trim() || null,
        prize_text?.trim().substring(0, 120) || null,
        nPlayers,
        format,
        phase,
        Number(puntos_maximos),
        flor_habilitada ? 1 : 0,
        ts,
        rs,
        fee,
        prize_amount != null ? parseFloat(prize_amount) : null,
        paidFlag ? 1 : 0,
        auto_checkin_enabled ? 1 : 0,
        auto_start_enabled ? 1 : 0,
        rtm,
        starts_at            || null,
        checkin_starts_at    || null,
        registration_closes_at || null,
        prizeConfigJson,
        placementConfigJson,
        adminId,
      ]
    );

    const tournamentId = result.insertId;
    await createEvent(null, tournamentId, 'tournament_created', { adminId }, null, adminId);
    logger.info(`Torneo creado: id=${tournamentId} name="${name}" by admin=${adminId}`);
    return { ok: true, tournamentId };
  },

  // ── 13. updateTournament ─────────────────────────────────────────────────
  /**
   * Admin actualiza campos de un torneo en estado draft u open.
   */
  async updateTournament(tournamentId, adminId, body) {
    const t = await assertTournamentExists(tournamentId);
    if (!['draft', 'open'].includes(t.status)) {
      throw new Error('No se puede modificar un torneo iniciado');
    }

    const ALLOWED = [
      'name', 'description', 'prize_text', 'max_players', 'format', 'phase',
      'puntos_maximos', 'flor_habilitada', 'turn_seconds', 'reconnect_seconds',
      'starts_at', 'checkin_starts_at', 'registration_closes_at',
      'entry_fee', 'prize_amount', 'is_paid',
      'auto_checkin_enabled', 'auto_start_enabled', 'ready_timeout_minutes',
      'prize_config', 'placement_config',
    ];
    const updates = {};
    for (const field of ALLOWED) {
      if (body[field] !== undefined) updates[field] = body[field];
    }
    if (updates.prize_config !== undefined) {
      updates.prize_config =
        updates.prize_config == null
          ? null
          : typeof updates.prize_config === 'string'
            ? updates.prize_config
            : JSON.stringify(updates.prize_config);
    }
    if (updates.placement_config !== undefined) {
      updates.placement_config =
        updates.placement_config == null
          ? null
          : typeof updates.placement_config === 'string'
            ? updates.placement_config
            : JSON.stringify(updates.placement_config);
    }
    if (Object.keys(updates).length === 0) throw new Error('Nada que actualizar');

    // Validaciones parciales
    if (updates.name !== undefined && !updates.name?.trim()) {
      throw new Error('Nombre obligatorio');
    }
    if (updates.max_players !== undefined) {
      const n = parseInt(updates.max_players, 10);
      if (!isFinite(n) || n < 2 || n > 128) throw new Error('max_players debe estar entre 2 y 128');
      updates.max_players = n;
    }
    if (updates.puntos_maximos !== undefined && ![15, 30].includes(Number(updates.puntos_maximos))) {
      throw new Error('puntos_maximos debe ser 15 o 30');
    }
    if (updates.turn_seconds !== undefined) {
      const v = parseInt(updates.turn_seconds, 10);
      if (!isFinite(v) || v < 10 || v > 120) throw new Error('turn_seconds debe estar entre 10 y 120');
      updates.turn_seconds = v;
    }
    if (updates.reconnect_seconds !== undefined) {
      const v = parseInt(updates.reconnect_seconds, 10);
      if (!isFinite(v) || v < 30 || v > 300) throw new Error('reconnect_seconds debe estar entre 30 y 300');
      updates.reconnect_seconds = v;
    }
    if (updates.entry_fee !== undefined) {
      const v = parseFloat(updates.entry_fee);
      if (!isFinite(v) || v < 0) throw new Error('entry_fee inválido');
      updates.entry_fee = v;
    }
    if (updates.ready_timeout_minutes !== undefined) {
      const v = parseInt(updates.ready_timeout_minutes, 10);
      if (!isFinite(v) || v < 1 || v > 60) throw new Error('ready_timeout_minutes debe estar entre 1 y 60');
      updates.ready_timeout_minutes = v;
    }
    if (updates.is_paid !== undefined) updates.is_paid = updates.is_paid ? 1 : 0;
    if (updates.auto_checkin_enabled !== undefined) {
      updates.auto_checkin_enabled = updates.auto_checkin_enabled ? 1 : 0;
    }
    if (updates.auto_start_enabled !== undefined) {
      updates.auto_start_enabled = updates.auto_start_enabled ? 1 : 0;
    }

    const mergedFee = updates.entry_fee !== undefined ? Number(updates.entry_fee) : parseFloat(t.entry_fee);
    const mergedPaid = updates.is_paid !== undefined ? Number(updates.is_paid) : Number(t.is_paid);
    if (mergedPaid === 1 && (!mergedFee || mergedFee <= 0)) {
      throw new Error('Torneo pago: definí entry_fee mayor a 0.');
    }

    const setClauses = Object.keys(updates).map(k => `\`${k}\` = ?`).join(', ');
    await query(
      `UPDATE tournaments SET ${setClauses} WHERE id = ?`,
      [...Object.values(updates), tournamentId]
    );
    await createEvent(null, tournamentId, 'tournament_updated',
      { fields: Object.keys(updates) }, null, adminId);
    return { ok: true };
  },

  // ── 14. setTournamentStatus ───────────────────────────────────────────────
  /**
   * Admin cambia el estado del torneo siguiendo transiciones válidas.
   * Válido para: open, checkin, started, finished, cancelled.
   */
  async setTournamentStatus(tournamentId, adminId, newStatus, opts = {}) {
    const VALID = ['open', 'checkin', 'started', 'cancelled', 'finished'];
    if (!VALID.includes(newStatus)) throw new Error('Estado inválido');

    const t = await assertTournamentExists(tournamentId);

    const TRANSITIONS = {
      open:      ['draft'],
      checkin:   ['open', 'draft'],
      started:   ['checkin', 'open'],
      cancelled: ['draft', 'open', 'checkin', 'started'],
      finished:  ['started'],
    };
    if (!TRANSITIONS[newStatus]?.includes(t.status)) {
      throw new Error(`No se puede pasar de '${t.status}' a '${newStatus}'`);
    }

    await query('UPDATE tournaments SET status = ? WHERE id = ?', [newStatus, tournamentId]);

    const EVENT_MAP = {
      open:      'tournament_opened',
      checkin:   'checkin_started',
      started:   'tournament_started',
      cancelled: 'tournament_cancelled',
      finished:  'tournament_finished',
    };
    const eventType = opts.eventTypeOverride || EVENT_MAP[newStatus];
    await createEvent(null, tournamentId, eventType, { adminId }, null, adminId);
    return { ok: true };
  },

  // ── 15. startTournament ───────────────────────────────────────────────────
  /**
   * Admin inicia el torneo. Requiere que el bracket ya esté generado.
   */
  async startTournament(tournamentId, adminId, opts = {}) {
    const matchCount = await query(
      'SELECT COUNT(*) AS cnt FROM tournament_matches WHERE tournament_id = ?',
      [tournamentId]
    );
    if (Number(matchCount[0].cnt) === 0) {
      throw new Error('El torneo no tiene bracket generado. Generá el bracket antes de iniciar');
    }
    return this.setTournamentStatus(tournamentId, adminId, 'started', opts);
  },

  /**
   * Posiciones y grupos para la vista "tabla final" (registrations + torneo + partidas del torneo).
   */
  async getStandings(tournamentId) {
    await assertTournamentExists(tournamentId);

    const tw = await query(
      `SELECT id, name, status, winner_id, phase, prize_text, prize_amount,
              prize_config, placement_config
       FROM tournaments WHERE id = ?`,
      [tournamentId]
    );
    if (!tw.length) throw new Error('Torneo no encontrado');
    const tournament = tw[0];
    const placement = parsePlacementConfig(tournament);

    const regs = await query(
      `SELECT tr.user_id AS id, tr.status, tr.final_position, tr.eliminated_round,
              u.username, u.avatar
       FROM tournament_registrations tr
       JOIN usuarios u ON u.id = tr.user_id
       WHERE tr.tournament_id = ?`,
      [tournamentId]
    );

    const tmFinished = await query(
      `SELECT player1_id, player2_id, winner_id, status
       FROM tournament_matches
       WHERE tournament_id = ?
         AND winner_id IS NOT NULL
         AND status IN ('finished', 'walkover')`,
      [tournamentId]
    );

    const statsByUser = {};
    for (const row of tmFinished) {
      const w = row.winner_id != null ? Number(row.winner_id) : null;
      const p1 = row.player1_id != null ? Number(row.player1_id) : null;
      const p2 = row.player2_id != null ? Number(row.player2_id) : null;
      for (const pid of [p1, p2]) {
        if (!pid) continue;
        if (!statsByUser[pid]) {
          statsByUser[pid] = { tournament_wins: 0, tournament_losses: 0, matches_played: 0 };
        }
        statsByUser[pid].matches_played += 1;
        if (w === pid) statsByUser[pid].tournament_wins += 1;
        else statsByUser[pid].tournament_losses += 1;
      }
    }

    const lossRows = await query(
      `SELECT
         CASE
           WHEN tm.winner_id = tm.player1_id THEN tm.player2_id
           WHEN tm.winner_id = tm.player2_id THEN tm.player1_id
           ELSE NULL
         END AS loser_id,
         tm.round_number
       FROM tournament_matches tm
       WHERE tm.tournament_id = ?
         AND tm.status IN ('finished', 'walkover')
         AND tm.winner_id IS NOT NULL
         AND tm.player1_id IS NOT NULL
         AND tm.player2_id IS NOT NULL`,
      [tournamentId]
    );
    const lossRoundByUser = {};
    for (const row of lossRows) {
      const lid = row.loser_id != null ? Number(row.loser_id) : null;
      if (!lid) continue;
      const rn = Number(row.round_number) || 0;
      if (!lossRoundByUser[lid] || rn > lossRoundByUser[lid]) {
        lossRoundByUser[lid] = rn;
      }
    }

    const regStatusShort = (s) => {
      const m = {
        registered: 'Inscripto',
        checked_in: 'Check-in',
        substitute: 'Suplente',
        cancelled: 'Cancelado',
      };
      return m[s] || s;
    };

    const labelFor = (r) => {
      if (r.status === 'winner') return 'Campeón';
      if (r.status === 'qualified') return 'Clasificado';
      if (r.status === 'no_show') return 'No se presentó';
      if (r.status === 'disqualified') return 'Descalificado';
      if (r.status === 'eliminated') {
        const fp = r.final_position != null ? Number(r.final_position) : null;
        if (fp === 2) return 'Subcampeón';
        if (fp === 3 && placement.third_place_match) return 'Tercer puesto';
        if (fp === 4 && placement.third_place_match) return 'Cuarto puesto';
        if (fp === 3 || fp === 4) return '3° / 4°';
        if (r.eliminated_round != null) return `Eliminado (R${r.eliminated_round})`;
        return 'Eliminado';
      }
      if (['registered', 'checked_in', 'substitute', 'cancelled'].includes(r.status)) {
        return regStatusShort(r.status);
      }
      return r.status;
    };

    const statusLabelRegistration = (r) => {
      const m = {
        winner: 'Campeón',
        eliminated: 'Eliminado',
        qualified: 'Clasificado',
        registered: 'Inscripto',
        checked_in: 'Check-in',
        substitute: 'Suplente',
        cancelled: 'Cancelado',
        no_show: 'No se presentó',
        disqualified: 'Descalificado',
      };
      return m[r.status] || r.status || '—';
    };

    const tournSt = tournament.status;
    const positionLabelForRow = (r) => {
      if (r.status === 'winner') return '1';
      const fp = r.final_position != null ? Number(r.final_position) : null;
      if (fp === 2) return '2';
      if (placement.third_place_match) {
        if (fp === 3) return '3°';
        if (fp === 4) return '4°';
      }
      if (fp === 3 || fp === 4) return '3°/4°';
      if (fp != null && fp > 4) return `${fp}°`;
      if (r.status === 'eliminated') {
        if (r.eliminated_round != null) return `Ronda ${r.eliminated_round}`;
        return 'Eliminado';
      }
      if (r.status === 'no_show' || r.status === 'disqualified') return '—';
      if (['registered', 'checked_in', 'substitute'].includes(r.status)) {
        if (['open', 'checkin', 'started'].includes(tournSt)) return 'En curso';
      }
      if (r.status === 'qualified') return '—';
      return '—';
    };

    const champion =
      regs.find((r) => r.status === 'winner')
      || (tournament.winner_id && regs.find((r) => Number(r.id) === Number(tournament.winner_id)))
      || null;

    const runnerUp =
      regs.find((r) => Number(r.final_position) === 2)
      || regs.find((r) => r.status === 'eliminated' && Number(r.final_position) === 2)
      || null;

    const semi = regs.filter(
      (r) => r.status === 'eliminated'
        && r.final_position != null
        && Number(r.final_position) >= 3
        && Number(r.final_position) <= 4
    );

    const qualified = regs.filter((r) => r.status === 'qualified');
    const noShow = regs.filter((r) => r.status === 'no_show');
    const disqualified = regs.filter((r) => r.status === 'disqualified');

    const eliminated = regs.filter(
      (r) => r.status === 'eliminated' && r.eliminated_round != null && r.final_position == null
    );
    const eliminatedByRoundRaw = {};
    for (const r of eliminated) {
      const k = String(r.eliminated_round);
      if (!eliminatedByRoundRaw[k]) eliminatedByRoundRaw[k] = [];
      eliminatedByRoundRaw[k].push(r);
    }

    const standingsList = [...regs].filter((r) => !['cancelled'].includes(r.status)).sort((a, b) => {
      const isCh = (row) =>
        row.status === 'winner'
        || (champion && Number(row.id) === Number(champion.id));
      const wa = isCh(a) ? 1 : 0;
      const wb = isCh(b) ? 1 : 0;
      if (wa !== wb) return wb - wa;
      const pa = a.final_position != null ? Number(a.final_position) : 999;
      const pb = b.final_position != null ? Number(b.final_position) : 999;
      if (pa !== pb) return pa - pb;
      const aggA = statsByUser[Number(a.id)] || { tournament_wins: 0, tournament_losses: 0, matches_played: 0 };
      const aggB = statsByUser[Number(b.id)] || { tournament_wins: 0, tournament_losses: 0, matches_played: 0 };
      if (aggB.tournament_wins !== aggA.tournament_wins) return aggB.tournament_wins - aggA.tournament_wins;
      if (aggA.tournament_losses !== aggB.tournament_losses) return aggA.tournament_losses - aggB.tournament_losses;
      const ra = lossRoundByUser[Number(a.id)];
      const rb = lossRoundByUser[Number(b.id)];
      if (ra != null && rb != null && ra !== rb) return rb - ra;
      return (a.username || '').localeCompare(b.username || '');
    });

    const mapPlayer = (r) => {
      if (!r) return null;
      const uid = Number(r.id);
      const agg = statsByUser[uid] || { tournament_wins: 0, tournament_losses: 0, matches_played: 0 };
      const isChampion =
        r.status === 'winner'
        || (champion && Number(r.id) === Number(champion.id))
        || (tournament.winner_id && Number(r.id) === Number(tournament.winner_id));

      let resultLabel = labelFor(r);
      let positionLabel = positionLabelForRow(r);
      let statusLabel = statusLabelRegistration(r);

      const lr = lossRoundByUser[uid];
      const played = agg.matches_played > 0;
      const staleReg =
        played
        && !isChampion
        && ['registered', 'checked_in', 'substitute'].includes(r.status)
        && ['started', 'finished'].includes(tournSt);

      if (staleReg) {
        if (agg.tournament_losses > 0 && lr != null) {
          statusLabel = 'Eliminado';
          resultLabel = r.eliminated_round != null ? `Eliminado (R${r.eliminated_round})` : `Eliminado en ronda ${lr}`;
          positionLabel = r.final_position != null ? positionLabelForRow(r) : `Ronda ${lr}`;
        } else if (agg.matches_played > 0) {
          statusLabel = 'En competencia';
          resultLabel = 'En competencia';
          positionLabel = 'En curso';
        }
      }

      const isFinal =
        isChampion
        || (r.final_position != null && ['eliminated', 'qualified'].includes(r.status))
        || (staleReg && agg.tournament_losses > 0);
      const still =
        ['registered', 'checked_in'].includes(r.status)
        && ['open', 'checkin', 'started'].includes(tournSt)
        && agg.tournament_losses === 0;

      const fpNum = r.final_position != null ? Number(r.final_position) : null;
      const showPrize = fpNum != null && Number.isFinite(fpNum);
      const pr = showPrize ? prizeForFinalPosition(tournament, fpNum) : { prize_label: null, prize_amount: null, prize_currency: null };

      return {
        user_id: r.id,
        id: r.id,
        username: r.username,
        avatar: r.avatar,
        wins: agg.tournament_wins,
        losses: agg.tournament_losses,
        tournament_wins: agg.tournament_wins,
        tournament_losses: agg.tournament_losses,
        matches_played: agg.matches_played,
        final_position: r.final_position,
        eliminated_round: r.eliminated_round ?? lr ?? null,
        status: r.status,
        label: resultLabel,
        result_label: resultLabel,
        position_label: positionLabel,
        status_label: statusLabel,
        is_final_position: isFinal,
        is_still_competing: still,
        prize_label: pr.prize_label,
        prize_amount: pr.prize_amount,
        prize_currency: pr.prize_currency,
      };
    };

    const standingsRows = standingsList.map((r) => mapPlayer(r));

    const eliminatedByRound = {};
    for (const [k, arr] of Object.entries(eliminatedByRoundRaw)) {
      eliminatedByRound[k] = arr.map((x) => mapPlayer(x));
    }

    const groups = {
      champion: champion ? [mapPlayer(champion)] : [],
      runner_up: runnerUp ? [mapPlayer(runnerUp)] : [],
      semifinalists: semi.map((r) => mapPlayer(r)),
      qualified: qualified.map((r) => mapPlayer(r)),
      eliminated: eliminated.map((r) => mapPlayer(r)),
      eliminated_by_round: eliminatedByRound,
      no_show: noShow.map((r) => mapPlayer(r)),
      disqualified: disqualified.map((r) => mapPlayer(r)),
    };

    return {
      tournament: {
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
        phase: tournament.phase,
        winner_id: tournament.winner_id,
        prize_text: tournament.prize_text,
        prize_config: parsePrizeConfig(tournament),
        placement_config: placement,
      },
      champion: champion ? { id: champion.id, username: champion.username, avatar: champion.avatar } : null,
      runner_up: runnerUp ? { id: runnerUp.id, username: runnerUp.username, avatar: runnerUp.avatar } : null,
      semifinalists: semi.map((r) => ({ id: r.id, username: r.username, avatar: r.avatar, label: '3°/4°' })),
      qualified: qualified.map((r) => ({ id: r.id, username: r.username, avatar: r.avatar })),
      eliminatedByRound,
      no_show: noShow.map((r) => ({ id: r.id, username: r.username, avatar: r.avatar })),
      disqualified: disqualified.map((r) => ({ id: r.id, username: r.username, avatar: r.avatar })),
      standingsList: standingsRows,
      groups,
    };
  },

  /**
   * Walkovers por vencimiento de ready_deadline (un jugador listo, el otro no).
   */
  async applyReadyDeadlineWalkovers() {
    let rows = [];
    try {
      rows = await query(
        `SELECT tm.id, tm.tournament_id, tm.player1_id, tm.player2_id, tm.player1_ready, tm.player2_ready
         FROM tournament_matches tm
         JOIN tournaments t ON t.id = tm.tournament_id
         WHERE t.status = 'started'
           AND tm.status IN ('ready','waiting_ready')
           AND tm.ready_deadline IS NOT NULL AND tm.ready_deadline <= NOW()`
      );
    } catch (e) {
      logger.warn(`applyReadyDeadlineWalkovers query: ${e.message}`);
      return [];
    }

    const out = [];
    for (const m of rows) {
      const p1 = !!m.player1_ready;
      const p2 = !!m.player2_ready;
      try {
        if (p1 && !p2) {
          await this.forceResult(m.tournament_id, m.id, m.player1_id, null, 'ready_timeout');
          out.push({ matchId: m.id, tournamentId: m.tournament_id, winnerId: m.player1_id });
        } else if (!p1 && p2) {
          await this.forceResult(m.tournament_id, m.id, m.player2_id, null, 'ready_timeout');
          out.push({ matchId: m.id, tournamentId: m.tournament_id, winnerId: m.player2_id });
        } else if (!p1 && !p2) {
          await createEvent(null, m.tournament_id, 'both_not_ready_timeout', { matchId: m.id });
          out.push({ matchId: m.id, tournamentId: m.tournament_id, bothNotReady: true });
        }
      } catch (e) {
        logger.warn(`applyReadyDeadlineWalkovers match ${m.id}: ${e.message}`);
      }
    }
    return out;
  },

  /** Cruces con ambos listos pero sin room (p. ej. offline al iniciar). */
  async getMatchesBothReadyWithoutRoom() {
    try {
      const rows = await query(
        `SELECT tm.id FROM tournament_matches tm
         JOIN tournaments t ON t.id = tm.tournament_id
         WHERE t.status = 'started'
           AND tm.status IN ('ready','waiting_ready')
           AND tm.player1_ready = 1 AND tm.player2_ready = 1
           AND tm.room_id IS NULL`
      );
      return rows.map(r => r.id);
    } catch (e) {
      logger.warn(`getMatchesBothReadyWithoutRoom: ${e.message}`);
      return [];
    }
  },

  // ── 11. resolveAbsence ────────────────────────────────────────────────────
  /**
   * Resuelve la ausencia de un jugador usando el estado de readiness.
   * - p1 listo, p2 no → walkover para p1.
   * - p2 listo, p1 no → walkover para p2.
   * - Ninguno listo → error (requiere decisión manual).
   */
  async resolveAbsence(tournamentId, matchId, adminId) {
    const rows = await query(
      `SELECT * FROM tournament_matches WHERE id = ? AND tournament_id = ?`,
      [matchId, tournamentId]
    );
    if (!rows.length) throw new Error('El cruce no existe en este torneo');
    const m = rows[0];

    if (!['ready', 'waiting_ready'].includes(m.status)) {
      throw new Error('El cruce no está en estado listo');
    }

    const p1Ready = !!m.player1_ready;
    const p2Ready = !!m.player2_ready;

    let winnerId;
    if      (p1Ready && !p2Ready) winnerId = m.player1_id;
    else if (p2Ready && !p1Ready) winnerId = m.player2_id;
    else throw new Error('Ningún jugador está listo, se requiere decisión manual');

    return this.forceResult(tournamentId, matchId, winnerId, adminId, 'no_show');
  },

  // ── 16. getMatchForStart ──────────────────────────────────────────────────
  /**
   * Devuelve el match completo + datos del torneo necesarios para crear la gameSession.
   * Usado por startTournamentMatch en tournamentHandler.
   */
  async getMatchForStart(matchId) {
    const rows = await query(
      `SELECT tm.*,
              t.name            AS tournament_name,
              t.puntos_maximos,
              t.flor_habilitada,
              t.turn_seconds,
              t.reconnect_seconds,
              t.phase,
              t.status          AS tournament_status
       FROM   tournament_matches tm
       JOIN   tournaments t ON t.id = tm.tournament_id
       WHERE  tm.id = ?`,
      [matchId]
    );
    if (!rows.length) throw new Error('Cruce no encontrado');
    if (rows[0].tournament_status !== 'started') {
      throw new Error('El torneo aún no inició oficialmente. Esperá la señal de inicio.');
    }
    return rows[0];
  },

  // ── 17. markMatchActive ───────────────────────────────────────────────────
  /**
   * Marca el cruce como active y guarda el roomId de la partida.
   * Llamado justo antes de emitir game:start en tournamentHandler.
   */
  async markMatchActive(matchId, roomId) {
    await query(
      `UPDATE tournament_matches
       SET    status = 'active', room_id = ?, started_at = NOW()
       WHERE  id = ?`,
      [roomId, matchId]
    );
  },

  /**
   * Intenta tomar el cruce para iniciar partida: solo si sigue listo, ambos ready y sin room_id.
   * Evita dos partidas concurrentes por doble click / socket + scheduler.
   */
  async claimMatchActive(matchId, roomId) {
    const header = await query(
      `UPDATE tournament_matches
       SET status = 'active', room_id = ?, started_at = NOW()
       WHERE id = ?
         AND status IN ('ready','waiting_ready')
         AND player1_ready = 1 AND player2_ready = 1
         AND room_id IS NULL`,
      [roomId, matchId]
    );
    const n = header && typeof header.affectedRows === 'number' ? header.affectedRows : 0;
    return n === 1;
  },

  // ── 18. finishMatchFromGame ───────────────────────────────────────────────
  /**
   * Llamado desde _finishGame de gameHandler cuando termina una partida.
   * Busca si el roomId corresponde a un tournament_match.
   * Si sí: actualiza scores/winner/status y avanza el bracket en la misma TX.
   * Devuelve null si no es un cruce de torneo (no-op para partidas normales).
   */
  async finishMatchFromGame(roomId, winnerId, scores = {}) {
    const rows = await query(
      `SELECT tm.id, tm.tournament_id, tm.player1_id, tm.player2_id, tm.round_number,
              tm.next_match_id, tm.round_type
       FROM   tournament_matches tm
       WHERE  tm.room_id = ?`,
      [roomId]
    );
    if (!rows.length) return null;   // no es cruce de torneo — no-op

    const m      = rows[0];
    const loserId = Number(m.player1_id) === Number(winnerId)
      ? m.player2_id
      : m.player1_id;
    const p1Score = scores[m.player1_id] ?? null;
    const p2Score = scores[m.player2_id] ?? null;

    await withTransaction(async (conn) => {
      await conn.execute(
        `UPDATE tournament_matches
         SET    winner_id     = ?,
                loser_id      = ?,
                status        = 'finished',
                finished_at   = NOW(),
                player1_score = COALESCE(?, player1_score),
                player2_score = COALESCE(?, player2_score)
         WHERE  id = ?`,
        [winnerId, loserId, p1Score, p2Score, m.id]
      );
      await createEvent(conn, m.tournament_id, 'match_finished',
        { matchId: m.id, winnerId, loserId, roomId }, winnerId);
      await _markLoserFromFinishedMatch(conn, m.tournament_id, m, loserId);
      await _advanceWinnerConn(conn, m.id, winnerId);
      if (String(m.round_type || 'bracket') === 'third_place') {
        await applyThirdPlaceWinnerPlacement(conn, m.tournament_id, m, winnerId);
      } else {
        await tryScheduleThirdPlaceMatch(conn, m.tournament_id, m);
      }
    });

    // Determinar si este jugador se convirtió en clasificado o campeón
    const regRows = await query(
      `SELECT status FROM tournament_registrations
       WHERE  tournament_id = ? AND user_id = ?`,
      [m.tournament_id, winnerId]
    );
    const regStatus = regRows[0]?.status;

    return {
      tournamentId: m.tournament_id,
      matchId:      m.id,
      winnerId,
      loserId,
      qualified:    regStatus === 'qualified',
      champion:     regStatus === 'winner',
    };
  },

  _tournamentChatAnchor(t) {
    if (!t || t.status !== 'finished') return null;
    return t.finished_at || t.updated_at || null;
  },

  isTournamentChatExpired(t) {
    if (!t || t.status !== 'finished') return false;
    const anchor = this._tournamentChatAnchor(t);
    if (!anchor) return false;
    return Date.now() > new Date(anchor).getTime() + 24 * 3600 * 1000;
  },

  /**
   * Acceso al chat de torneo: participantes con inscripción válida; admin con mismas
   * ventanas de tiempo (no cancelado, no expirado +24h post-finish).
   */
  async canAccessTournamentChat(tournamentId, userId, userRole = 'user') {
    const tid = Number(tournamentId);
    if (!Number.isInteger(tid) || tid <= 0) return { ok: false, reason: 'not_found' };

    const rows = await query(
      `SELECT id, name, status, finished_at, updated_at FROM tournaments WHERE id = ?`,
      [tid]
    );
    if (!rows.length) return { ok: false, reason: 'not_found' };
    const t = rows[0];

    if (t.status === 'cancelled') return { ok: false, reason: 'cancelled' };
    if (this.isTournamentChatExpired(t)) return { ok: false, reason: 'expired' };

    if (userRole === 'admin') {
      return { ok: true, tournament: t, admin: true };
    }

    const regs = await query(
      `SELECT status FROM tournament_registrations WHERE tournament_id = ? AND user_id = ?`,
      [tid, userId]
    );
    if (!regs.length) return { ok: false, reason: 'forbidden' };
    const st = regs[0].status;
    if (st === 'cancelled') return { ok: false, reason: 'forbidden' };

    const allowed = new Set([
      'registered',
      'checked_in',
      'substitute',
      'qualified',
      'eliminated',
      'winner',
      'no_show',
      'disqualified',
    ]);
    if (!allowed.has(st)) return { ok: false, reason: 'forbidden' };

    return { ok: true, tournament: t, registrationStatus: st };
  },

  async listTournamentChatsAvailable(userId) {
    const uid = Number(userId);
    if (!Number.isInteger(uid) || uid <= 0) return [];

    return query(
      `SELECT DISTINCT t.id, t.name, t.status, t.finished_at, t.updated_at
       FROM tournaments t
       INNER JOIN tournament_registrations tr
         ON tr.tournament_id = t.id AND tr.user_id = ?
       WHERE tr.status <> 'cancelled'
         AND t.status <> 'cancelled'
         AND t.status <> 'draft'
         AND (
           t.status IN ('open', 'checkin', 'started')
           OR (
             t.status = 'finished'
             AND DATE_ADD(COALESCE(t.finished_at, t.updated_at), INTERVAL 1 DAY) > NOW()
           )
         )
       ORDER BY
         CASE t.status
           WHEN 'started' THEN 1
           WHEN 'checkin' THEN 2
           WHEN 'open' THEN 3
           WHEN 'finished' THEN 4
           ELSE 5
         END,
         t.id DESC
       LIMIT 50`,
      [uid]
    );
  },

  async getTournamentChatMessages(tournamentId, userId, userRole, { limit = 50, before = null } = {}) {
    const acc = await this.canAccessTournamentChat(tournamentId, userId, userRole);
    if (!acc.ok) {
      const err = new Error(acc.reason || 'forbidden');
      err.code = acc.reason;
      throw err;
    }

    const safeLimit = Math.min(Math.max(parseInt(String(limit), 10) || 50, 1), 100);
    const bid = before != null ? parseInt(String(before), 10) : null;
    const useBefore = Number.isInteger(bid) && bid > 0;

    let sql = `
      SELECT tm.id, tm.tournament_id, tm.message, tm.created_at,
             u.id AS uid, u.username, u.avatar
      FROM tournament_messages tm
      JOIN usuarios u ON u.id = tm.user_id
      WHERE tm.tournament_id = ? AND tm.deleted_at IS NULL`;
    const params = [Number(tournamentId)];
    if (useBefore) {
      sql += ' AND tm.id < ?';
      params.push(bid);
    }
    sql += ` ORDER BY tm.id DESC LIMIT ${safeLimit}`;

    const rows = await query(sql, params);
    return rows
      .reverse()
      .map((r) => ({
        id:            r.id,
        tournament_id: r.tournament_id,
        text:          r.message,
        createdAt:     r.created_at,
        from:          { id: r.uid, username: r.username, avatar: r.avatar || null },
      }));
  },

  async createTournamentChatMessage(tournamentId, userId, userRole, rawText) {
    const acc = await this.canAccessTournamentChat(tournamentId, userId, userRole);
    if (!acc.ok) {
      const err = new Error(acc.reason || 'forbidden');
      err.code = acc.reason;
      throw err;
    }

    const text = String(rawText || '').trim().substring(0, 500);
    if (!text) {
      const err = new Error('empty');
      err.code = 'empty';
      throw err;
    }

    const ins = await query(
      `INSERT INTO tournament_messages (tournament_id, user_id, message) VALUES (?, ?, ?)`,
      [Number(tournamentId), userId, text]
    );
    const mid = ins.insertId;

    const rows = await query(
      `SELECT tm.id, tm.tournament_id, tm.message, tm.created_at,
              u.id AS uid, u.username, u.avatar
       FROM tournament_messages tm
       JOIN usuarios u ON u.id = tm.user_id
       WHERE tm.id = ?`,
      [mid]
    );
    const r = rows[0];
    return {
      id:            r.id,
      tournament_id: r.tournament_id,
      text:          r.message,
      createdAt:     r.created_at,
      from:          { id: r.uid, username: r.username, avatar: r.avatar || null },
    };
  },
};

module.exports = TournamentService;
