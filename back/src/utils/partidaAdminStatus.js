/**
 * Estado de partida para admin / resolución manual.
 * Evita mostrar "Resolver" cuando la fila ya está terminada pero `status` quedó desactualizado (p. ej. state=finished + status=paused).
 */

function hasWinner(p) {
  const w = p.winner_id;
  if (w == null || String(w).trim() === '') return false;
  const n = Number(w);
  return Number.isFinite(n) && n > 0;
}

function hasFinishedAt(p) {
  return p.finished_at != null && String(p.finished_at).trim() !== '';
}

function partidaIsFinished(p) {
  return (
    hasWinner(p)
    || hasFinishedAt(p)
    || p.state === 'finished'
    || p.status === 'finished'
    || p.status === 'abandoned'
    || p.status === 'cancelled'
  );
}

/** Solo partidas en pausa reales, sin ganador ni cierre en DB. */
function partidaNeedsAdminResolution(p) {
  if (partidaIsFinished(p)) return false;
  return p.status === 'paused';
}

function partidaComputedStatus(p) {
  if (partidaIsFinished(p)) {
    if (p.status === 'abandoned') return 'abandoned';
    if (p.status === 'cancelled') return 'cancelled';
    return 'finished';
  }
  if (partidaNeedsAdminResolution(p)) return 'paused_needs_resolution';
  if (p.status === 'active' || p.state === 'playing') return 'active';
  if (p.state === 'waiting') return 'waiting';
  return 'unknown';
}

/** Etiqueta corta para tabla admin (prioriza consistencia sobre raw status). */
function partidaDisplayStatus(p) {
  const c = partidaComputedStatus(p);
  if (c === 'finished') return 'finished';
  if (c === 'abandoned') return 'abandoned';
  if (c === 'cancelled') return 'cancelled';
  if (c === 'paused_needs_resolution') return 'paused';
  return p.status || p.state || '—';
}

function enrichPartidaAdminRow(p) {
  const computed_status = partidaComputedStatus(p);
  const needsResolution = partidaNeedsAdminResolution(p);
  const display_status = partidaDisplayStatus(p);
  return {
    ...p,
    computed_status,
    needsResolution,
    display_status,
  };
}

module.exports = {
  partidaIsFinished,
  partidaNeedsAdminResolution,
  partidaComputedStatus,
  partidaDisplayStatus,
  enrichPartidaAdminRow,
};
