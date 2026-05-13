/**
 * Seed local MVP: 4 usuarios de prueba + torneo listo para "Iniciar torneo" desde Admin.
 *
 * Uso (desde la carpeta back/):
 *   node src/scripts/seedTournamentTest.js
 *
 * Seguridad:
 *   - No ejecuta en NODE_ENV=production salvo ALLOW_TOURNAMENT_SEED=1
 *   - Elimina solo un torneo previo con nombre exacto "Torneo Test 4 Jugadores" (CASCADE en DB)
 */
'use strict';

const path = require('path');

// Cargar .env desde la raíz del backend (cwd suele ser back/)
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const { query, getPool } = require('../config/database');
const User = require('../models/User');
const TournamentService = require('../services/tournamentService');

const TOURNAMENT_NAME = 'Torneo Test 4 Jugadores';

const TEST_USERS = [
  { username: 'test1', email: 'test1@mail.com' },
  { username: 'test2', email: 'test2@mail.com' },
  { username: 'test3', email: 'test3@mail.com' },
  { username: 'test4', email: 'test4@mail.com' },
];
const TEST_PASSWORD = '123456';

function assertNotProduction() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_TOURNAMENT_SEED !== '1') {
    console.error(
      '[seed] Abortado: NODE_ENV=production. Para forzar (no recomendado), definí ALLOW_TOURNAMENT_SEED=1'
    );
    process.exit(1);
  }
}

async function findAdminId() {
  const rows = await query(
    `SELECT id, username FROM usuarios WHERE role = 'admin' AND (status = 'active' OR status IS NULL) ORDER BY id ASC LIMIT 1`
  );
  return rows[0] || null;
}

async function ensureTestUser({ username, email }) {
  const existing = await User.findByEmail(email);
  if (existing) {
    console.log(`[seed] Usuario ya existe: ${username} (id=${existing.id})`);
    return existing.id;
  }
  const id = await User.create({ username, email, password: TEST_PASSWORD });
  console.log(`[seed] Usuario creado: ${username} (id=${id})`);
  return id;
}

async function removePriorTestTournament() {
  const rows = await query('SELECT id FROM tournaments WHERE name = ? LIMIT 1', [TOURNAMENT_NAME]);
  if (!rows.length) return;
  const id = rows[0].id;
  await query('DELETE FROM tournaments WHERE id = ?', [id]);
  console.log(`[seed] Torneo previo eliminado (id=${id}, nombre exacto).`);
}

async function main() {
  assertNotProduction();

  const admin = await findAdminId();
  if (!admin) {
    console.error(
      '[seed] No hay ningún usuario con role=admin. Creá uno (registro + UPDATE usuarios SET role = \'admin\' WHERE id=...) y volvé a ejecutar.'
    );
    process.exit(1);
  }
  console.log(`[seed] Admin: ${admin.username} (id=${admin.id})`);

  const userIds = [];
  for (const u of TEST_USERS) {
    userIds.push(await ensureTestUser(u));
  }

  await removePriorTestTournament();

  const createRes = await TournamentService.createTournament(admin.id, {
    name: TOURNAMENT_NAME,
    description: 'Seed local — 4 jugadores, single elimination, fase general.',
    prize_text: null,
    max_players: 4,
    format: 'single_elimination',
    phase: 'general',
    puntos_maximos: 15,
    flor_habilitada: false,
    turn_seconds: 30,
    reconnect_seconds: 60,
    starts_at: null,
    checkin_starts_at: null,
    registration_closes_at: null,
  });

  const tournamentId = createRes.tournamentId;
  console.log(`[seed] Torneo creado en draft (id=${tournamentId})`);

  await TournamentService.setTournamentStatus(tournamentId, admin.id, 'open');
  console.log('[seed] Estado: open');

  for (const uid of userIds) {
    try {
      await TournamentService.register(tournamentId, uid);
      console.log(`[seed] Inscripto user_id=${uid}`);
    } catch (e) {
      console.error(`[seed] Error inscribiendo user_id=${uid}: ${e.message}`);
      throw e;
    }
  }

  await TournamentService.setTournamentStatus(tournamentId, admin.id, 'checkin');
  console.log('[seed] Estado: checkin');

  for (const uid of userIds) {
    await TournamentService.checkin(tournamentId, uid);
    console.log(`[seed] Check-in user_id=${uid}`);
  }

  const bracketRes = await TournamentService.generateBracket(tournamentId, admin.id);
  console.log('[seed] Bracket generado:', bracketRes);

  console.log('\n=== Listo ===');
  console.log(`Torneo id: ${tournamentId} — "${TOURNAMENT_NAME}"`);
  console.log(
    '[seed] Nota: generateBracket() en el backend deja el torneo en estado **started** ' +
      '(no hace falta pulsar "Iniciar torneo" en Admin salvo que lo hubieras dejado en checkin sin bracket).'
  );
  console.log('\nLogins de prueba (misma contraseña):');
  for (const u of TEST_USERS) {
    console.log(`  ${u.email} / ${TEST_PASSWORD}`);
  }
  console.log('\nFront admin: http://localhost:5173/admin → Torneos (gestión de cruces).');
  console.log('Front jugadores: http://localhost:5173/torneos → detalle → Estoy listo (cada usuario).\n');
}

main()
  .catch((err) => {
    console.error('[seed] Falló:', err.message);
    process.exit(1);
  })
  .finally(() => {
    try {
      const p = getPool();
      if (p && typeof p.end === 'function') p.end();
    } catch (_) {
      /* ignore */
    }
  });
