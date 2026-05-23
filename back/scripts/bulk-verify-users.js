/**
 * Aprueba verificaciones pendientes (18+) y opcionalmente marca como verificados
 * a usuarios sin solicitud (solo entornos de prueba / lanzamiento controlado).
 *
 * Uso:
 *   node scripts/bulk-verify-users.js              # solo pending
 *   node scripts/bulk-verify-users.js --grant-missing  # pending + usuarios sin fila
 *
 * ADMIN_ID: primer admin en DB, o variable ADMIN_USER_ID
 */
require('dotenv').config();
const { query } = require('../src/config/database');
const VerificationService = require('../src/services/verificationService');

const grantMissing = process.argv.includes('--grant-missing');

function calcAge(dob) {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

(async () => {
  const admins = await query("SELECT id, username FROM usuarios WHERE role = 'admin' ORDER BY id LIMIT 1");
  const adminId = Number(process.env.ADMIN_USER_ID) || admins[0]?.id;
  if (!adminId) {
    console.error('No hay usuario admin');
    process.exit(1);
  }
  console.log('Admin:', adminId, admins[0]?.username);

  const pending = await query(
    `SELECT user_id, date_of_birth FROM user_verifications WHERE identity_status = 'pending'`
  );
  let approved = 0;
  let failed = 0;
  for (const row of pending) {
    try {
      await VerificationService.approveVerification(adminId, row.user_id);
      approved++;
      console.log('OK pending -> verified user_id=', row.user_id);
    } catch (e) {
      failed++;
      console.error('FAIL user_id=', row.user_id, e.message);
    }
  }

  let granted = 0;
  if (grantMissing) {
    const missing = await query(`
      SELECT u.id, u.username
      FROM usuarios u
      LEFT JOIN user_verifications uv ON uv.user_id = u.id
      WHERE uv.user_id IS NULL
    `);
    const defaultDob = '1990-01-01';
    for (const u of missing) {
      await query(
        `INSERT INTO user_verifications
           (user_id, identity_status, age_verified, date_of_birth,
            legal_first_name, legal_last_name, document_type, document_number,
            country, province, reviewed_by, reviewed_at)
         VALUES (?, 'verified', 1, ?, ?, ?, 'dni', 'ADMIN-BULK', 'AR', NULL, ?, NOW())`,
        [
          u.id,
          defaultDob,
          String(u.username).substring(0, 100),
          'Usuario',
          adminId,
        ]
      );
      granted++;
      console.log('OK granted verified user_id=', u.id, u.username);
    }
  }

  const summary = await query(`
    SELECT COALESCE(uv.identity_status, 'sin_fila') AS st, COUNT(*) AS c
    FROM usuarios u
    LEFT JOIN user_verifications uv ON uv.user_id = u.id
    GROUP BY st
  `);
  console.log('\nResumen:');
  console.log('  pending aprobados:', approved, 'fallos:', failed);
  if (grantMissing) console.log('  sin fila verificados (bulk):', granted);
  console.log('  estados:', summary);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
