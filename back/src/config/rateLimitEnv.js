/**
 * Centraliza detección de entorno para rate limits.
 * En desarrollo los límites son más permisivos; en producción se mantienen estrictos.
 */
const isProduction = process.env.NODE_ENV === 'production';

module.exports = { isProduction };
