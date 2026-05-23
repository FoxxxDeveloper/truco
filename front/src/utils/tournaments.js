/** Origin for resolving relative avatar paths from API */
export function apiOrigin() {
  return (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace(/\/api\/?$/, '');
}

export function avatarUrl(path) {
  if (!path) return null;
  if (String(path).startsWith('http')) return path;
  const base = apiOrigin();
  return base + (String(path).startsWith('/') ? path : `/${path}`);
}

export function tournamentStatusLabel(s) {
  const map = {
    draft: 'Borrador',
    open: 'Inscripciones abiertas',
    checkin: 'Check-in',
    started: 'En curso',
    finished: 'Finalizado',
    cancelled: 'Cancelado',
  };
  return map[s] || s || '—';
}

export function tournamentFormatLabel(f) {
  const map = {
    single_elimination: 'Eliminación directa',
    qualifier: 'Clasificatorio',
    finals: 'Finales',
  };
  return map[f] || f || '—';
}

export function tournamentPhaseLabel(p) {
  const map = {
    general: 'General',
    qualifier_a: 'Clasificatorio A',
    qualifier_b: 'Clasificatorio B',
    finals: 'Finales',
  };
  return map[p] || p || '—';
}

export function matchStatusLabel(s) {
  const map = {
    pending: 'Pendiente',
    ready: 'Listo para jugar',
    waiting_ready: 'Esperando rival',
    active: 'En juego',
    finished: 'Finalizado',
    walkover: 'Walkover',
    cancelled: 'Cancelado',
  };
  return map[s] || s || '—';
}

/** Etiqueta de fase visible (lifecycle del API o status). */
export function tournamentLifecycleLabel(t) {
  if (t?.lifecycle?.phaseLabel) return t.lifecycle.phaseLabel;
  return tournamentStatusLabel(t?.status);
}

export function registrationStatusLabel(s) {
  const map = {
    registered: 'Titular (pendiente check-in)',
    checked_in: 'Titular (check-in OK)',
    substitute: 'Suplente',
    eliminated: 'Eliminado',
    qualified: 'Clasificado',
    winner: 'Campeón',
    no_show: 'No presente (check-in)',
  };
  return map[s] || s || '—';
}

/** Busca el cruce del usuario en estado pendiente de jugar o en juego */
export function findMyBracketMatch(tournament, userId) {
  if (!tournament?.bracket || !userId) return null;
  const rounds = tournament.bracket;
  const keys = Object.keys(rounds).sort((a, b) => Number(a) - Number(b));
  for (const k of keys) {
    const matches = rounds[k] || [];
    for (const m of matches) {
      const p1 = m.player1?.id;
      const p2 = m.player2?.id;
      const mine = p1 === userId || p2 === userId;
      if (!mine) continue;
      if (['ready', 'waiting_ready', 'active', 'pending'].includes(m.status)) return m;
    }
  }
  return null;
}

export function formatDate(d) {
  if (!d) return '—';
  try {
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return '—';
    return x.toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '—';
  }
}
