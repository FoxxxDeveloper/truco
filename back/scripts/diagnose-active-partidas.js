/**
 * Diagnóstico MySQL: partidas que bloquean retos/batallas/matchmaking.
 * Uso: node scripts/diagnose-active-partidas.js [userId]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { query, testConnection } = require('../src/config/database');
const {
  ACTIVE_PARTIDA_SQL,
  ACTIVE_PARTIDA_PARAMS,
  getActiveGameForUser,
} = require('../src/utils/activeGame');

const USER_ID = parseInt(process.argv[2], 10) || null;

async function main() {
  const ok = await testConnection();
  if (!ok) {
    console.error('MySQL connection failed');
    process.exit(1);
  }

  console.log('=== active/paused (últimas 30) ===');
  const allActive = await query(
    `SELECT id, room_id, player1_id, player2_id, winner_id, state, status,
            finished_at, finish_reason, requires_admin_resolution,
            p1_reconnect_deadline_at, p2_reconnect_deadline_at,
            created_at, started_at
     FROM partidas
     WHERE status IN ('active', 'paused')
     ORDER BY created_at DESC
     LIMIT 30`
  );
  console.log(JSON.stringify(allActive, null, 2));

  console.log('\n=== inconsistentes (active/paused pero deberían estar cerradas) ===');
  const inconsistent = await query(
    `SELECT id, room_id, player1_id, player2_id, winner_id, state, status,
            finished_at, finish_reason, requires_admin_resolution,
            p1_reconnect_deadline_at, p2_reconnect_deadline_at,
            created_at, started_at
     FROM partidas
     WHERE status IN ('active', 'paused')
       AND (
         winner_id IS NOT NULL
         OR finished_at IS NOT NULL
         OR state IN ('finished', 'cancelled')
         OR IFNULL(requires_admin_resolution, 0) = 1
         OR finish_reason IN (
           'both_disconnected',
           'afk_abandon',
           'stale_active_cleanup',
           'abandon_disconnect',
           'abandon_disconnect_stale',
           'manual_admin_cancel',
           'cancelled',
           'normalized_inconsistent',
           'normalized_admin_resolution'
         )
       )
     ORDER BY created_at DESC
     LIMIT 50`
  );
  console.log(JSON.stringify(inconsistent, null, 2));

  if (USER_ID) {
    console.log(`\n=== usuario ${USER_ID}: recientes ===`);
    const recent = await query(
      `SELECT id, room_id, player1_id, player2_id, winner_id, state, status,
              finished_at, finish_reason, requires_admin_resolution,
              p1_reconnect_deadline_at, p2_reconnect_deadline_at,
              created_at, started_at
       FROM partidas
       WHERE (player1_id = ? OR player2_id = ?)
       ORDER BY created_at DESC
       LIMIT 50`,
      [USER_ID, USER_ID]
    );
    console.log(JSON.stringify(recent, null, 2));

    console.log(`\n=== usuario ${USER_ID}: getActiveGameForUser() ===`);
    const blocking = await getActiveGameForUser(USER_ID);
    console.log(JSON.stringify(blocking, null, 2));

    console.log(`\n=== usuario ${USER_ID}: status active/paused (raw) ===`);
    const rawActive = await query(
      `SELECT id, room_id, player1_id, player2_id, winner_id, state, status,
              finished_at, finish_reason, requires_admin_resolution,
              p1_reconnect_deadline_at, p2_reconnect_deadline_at,
              created_at, started_at
       FROM partidas
       WHERE (player1_id = ? OR player2_id = ?)
         AND status IN ('active', 'paused')
       ORDER BY created_at DESC`,
      [USER_ID, USER_ID]
    );
    console.log(JSON.stringify(rawActive, null, 2));
  } else {
    console.log('\n(Sin userId: pasar node scripts/diagnose-active-partidas.js USER_ID)');
    const blockers = await query(
      `SELECT p.id, p.room_id, p.player1_id, p.player2_id, p.state, p.status,
              p.winner_id, p.finished_at, p.finish_reason, p.created_at
       FROM partidas p
       WHERE (p.player1_id IS NOT NULL OR p.player2_id IS NOT NULL)
         ${ACTIVE_PARTIDA_SQL.replace(/\n/g, ' ')}
       ORDER BY p.created_at DESC
       LIMIT 20`,
      [...ACTIVE_PARTIDA_PARAMS]
    );
    console.log('\n=== usuarios bloqueados por ACTIVE_PARTIDA_SQL (muestra) ===');
    console.log(JSON.stringify(blockers, null, 2));
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
