export const ADMIN_MSG = 'Los administradores no pueden participar como jugadores.';

export function isAdminUser(user) {
  const role = user?.role;
  return role === 'admin' || role === 'administrador';
}
