/**
 * Automatización de torneos por horario (check-in, cierre, bracket, inicio, ready deadline).
 * Tick cada 30s; usa TournamentService como fuente de verdad; emite por Socket.IO cuando corresponde.
 */
'use strict';

const logger = require('../config/logger');
const { query } = require('../config/database');
const TournamentService = require('./tournamentService');
const { startTournamentMatch } = require('../socket/handlers/tournamentHandler');

let timer = null;
let isRunning = false;

function nowMs() {
  return Date.now();
}

async function runTick(io) {
  if (isRunning) return;
  isRunning = true;
  const t0 = nowMs();

  try {
    const active = await query(
      `SELECT * FROM tournaments
       WHERE status IN ('draft','open','checkin','started')`
    );

    const now = new Date();

    for (const t of active) {
      if (t.status === 'open' && Number(t.auto_checkin_enabled) === 1 && t.checkin_starts_at) {
        if (new Date(t.checkin_starts_at) <= now) {
          try {
            await TournamentService.setTournamentStatus(t.id, null, 'checkin', {
              eventTypeOverride: 'checkin_auto_started',
            });
            io?.to(`tournament:${t.id}`)?.emit('tournament:updated', {
              tournamentId: t.id,
              reason: 'checkin_auto_started',
            });
          } catch (e) {
            /* ya en otro estado */
          }
        }
      }
    }

    const active2 = await query(
      `SELECT * FROM tournaments
       WHERE status IN ('draft','open','checkin','started')`
    );

    for (const t of active2) {
      if (t.status === 'checkin' && t.registration_closes_at && !t.checkin_closed_at) {
        if (new Date(t.registration_closes_at) <= now) {
          try {
            await TournamentService.closeCheckinAndPromoteSubstitutes(t.id, null);
            io?.to(`tournament:${t.id}`)?.emit('tournament:updated', { tournamentId: t.id });
          } catch (e) {
            logger.warn(`scheduler closeCheckin ${t.id}: ${e.message}`);
          }
        }
      }
    }

    const forBracket = await query(
      `SELECT * FROM tournaments WHERE status = 'checkin'`
    );
    for (const t of forBracket) {
      if (!t.checkin_closed_at || t.bracket_generated_at) continue;
      const cnt = await query(
        'SELECT COUNT(*) AS c FROM tournament_matches WHERE tournament_id = ?',
        [t.id]
      );
      if (Number(cnt[0].c) > 0) continue;
      try {
        await TournamentService.generateBracket(t.id, null);
        io?.to(`tournament:${t.id}`)?.emit('tournament:updated', { tournamentId: t.id });
      } catch (e) {
        logger.warn(`scheduler generateBracket ${t.id}: ${e.message}`);
      }
    }

    const autoStartRows = await query(
      `SELECT * FROM tournaments
       WHERE auto_start_enabled = 1
         AND starts_at IS NOT NULL
         AND starts_at <= NOW()
         AND status IN ('open','checkin')`
    );

    for (const t of autoStartRows) {
      try {
        let cur = (await query('SELECT * FROM tournaments WHERE id = ?', [t.id]))[0];
        if (cur.status === 'open' && Number(cur.auto_checkin_enabled) === 1
            && cur.checkin_starts_at && new Date(cur.checkin_starts_at) <= now) {
          try {
            await TournamentService.setTournamentStatus(cur.id, null, 'checkin', {
              eventTypeOverride: 'checkin_auto_started',
            });
          } catch (_) { /* noop */ }
          cur = (await query('SELECT * FROM tournaments WHERE id = ?', [t.id]))[0];
        }

        if (cur.status === 'checkin' && !cur.checkin_closed_at && cur.registration_closes_at
            && new Date(cur.registration_closes_at) <= now) {
          await TournamentService.closeCheckinAndPromoteSubstitutes(cur.id, null).catch(() => {});
          cur = (await query('SELECT * FROM tournaments WHERE id = ?', [t.id]))[0];
        }

        const mc = await query(
          'SELECT COUNT(*) AS c FROM tournament_matches WHERE tournament_id = ?',
          [t.id]
        );
        if (Number(mc[0].c) === 0 && cur.checkin_closed_at) {
          await TournamentService.generateBracket(t.id, null).catch(() => {});
        }

        const mc2 = await query(
          'SELECT COUNT(*) AS c FROM tournament_matches WHERE tournament_id = ?',
          [t.id]
        );
        if (Number(mc2[0].c) > 0) {
          const st = (await query('SELECT status FROM tournaments WHERE id = ?', [t.id]))[0];
          if (st && st.status !== 'started') {
            await TournamentService.startTournament(t.id, null, {
              eventTypeOverride: 'tournament_auto_started',
            });
            io?.to(`tournament:${t.id}`)?.emit('tournament:updated', {
              tournamentId: t.id,
              reason: 'tournament_auto_started',
            });
          }
        }
      } catch (e) {
        logger.warn(`scheduler autoStart ${t.id}: ${e.message}`);
      }
    }

    const rw = await TournamentService.applyReadyDeadlineWalkovers();
    for (const ev of rw) {
      const tid = ev.tournamentId;
      if (!tid) continue;
      io?.to(`tournament:${tid}`)?.emit('tournament:updated', { tournamentId: tid });
      if (ev.winnerId) {
        io?.to(`tournament:${tid}`)?.emit('tournament:matchFinished', {
          tournamentId: tid,
          matchId:  ev.matchId,
          winnerId: ev.winnerId,
        });
      }
    }

    if (io) {
      const mids = await TournamentService.getMatchesBothReadyWithoutRoom();
      for (const mid of mids) {
        await startTournamentMatch(io, mid).catch((e) => {
          logger.warn(`scheduler startTournamentMatch ${mid}: ${e.message}`);
        });
      }
    }
  } catch (e) {
    logger.error('tournamentScheduler tick: ' + e.message);
  } finally {
    isRunning = false;
    logger.debug(`tournamentScheduler tick done in ${nowMs() - t0}ms`);
  }
}

function startTournamentScheduler(io) {
  stopTournamentScheduler();
  timer = setInterval(() => {
    runTick(io).catch((e) => logger.error('tournamentScheduler: ' + e.message));
  }, 30000);
  runTick(io).catch((e) => logger.error('tournamentScheduler initial: ' + e.message));
}

function stopTournamentScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { startTournamentScheduler, stopTournamentScheduler };
