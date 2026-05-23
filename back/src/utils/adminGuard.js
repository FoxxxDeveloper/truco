const { query } = require('../config/database');
const { ForbiddenError } = require('../middleware/errorHandler');

const ADMIN_MSG = 'Los administradores no pueden participar como jugadores.';

function isAdminUser(userOrRow) {
  const role = userOrRow?.role;
  return role === 'admin' || role === 'administrador';
}

/** Bloquea participación como jugador (matchmaking, salas, retos, batallas, torneos). */
function assertPlayerParticipationAllowed(user) {
  if (isAdminUser(user)) {
    throw new ForbiddenError(ADMIN_MSG);
  }
}

async function assertPlayerParticipationAllowedById(userId) {
  const [row] = await query('SELECT role FROM usuarios WHERE id = ? LIMIT 1', [userId]);
  if (row && isAdminUser(row)) {
    throw new ForbiddenError(ADMIN_MSG);
  }
}

module.exports = {
  isAdminUser,
  assertPlayerParticipationAllowed,
  assertPlayerParticipationAllowedById,
  ADMIN_MSG,
};
