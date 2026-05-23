/**
 * Ejecuta una pasada de cleanup (sin levantar servidor).
 * Uso: node scripts/run-stale-cleanup-once.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const staleGameCleanup = require('../src/services/staleGameCleanup');
const { getActiveGameForUser } = require('../src/utils/activeGame');

async function main() {
  const result = await staleGameCleanup.runAdminCleanupStaleGames(null, {
    orphanStaleMinutes: 60,
  });
  console.log('cleanup result:', JSON.stringify(result, null, 2));
  for (const uid of [3, 6]) {
    const active = await getActiveGameForUser(uid);
    console.log(`user ${uid} active after cleanup:`, active ? active.id : null);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
