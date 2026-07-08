/**
 * Feature flags de producto (reactivar ranked sin redeploy de lógica).
 */
function isRankedEnabled() {
  return process.env.RANKED_ENABLED === 'true';
}

module.exports = { isRankedEnabled };
