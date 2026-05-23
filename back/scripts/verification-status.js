require('dotenv').config();
const { query } = require('../src/config/database');

(async () => {
  const users = await query('SELECT COUNT(*) AS c FROM usuarios');
  const ver = await query(`
    SELECT COALESCE(uv.identity_status, 'sin_fila') AS st, COUNT(*) AS c
    FROM usuarios u
    LEFT JOIN user_verifications uv ON uv.user_id = u.id
    GROUP BY st
  `);
  const pending = await query(`
    SELECT u.id, u.username, uv.date_of_birth, uv.identity_status
    FROM user_verifications uv
    JOIN usuarios u ON u.id = uv.user_id
    WHERE uv.identity_status = 'pending'
  `);
  console.log('usuarios:', users[0].c);
  console.log('por estado:', ver);
  console.log('pending:', pending.length);
  pending.forEach((p) => console.log(' -', p.id, p.username, p.date_of_birth));
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
