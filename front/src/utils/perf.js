/**
 * Instrumentación de rendimiento — activar con ?perf=1 en /game
 * o sessionStorage.setItem('truco_perf', '1')
 */

const PERF_SESSION_KEY = 'truco_perf';

export const perfRegistry = {
  renders: {},
  marks: [],
  longTasks: [],
  fps: 0,
  lastSummary: null,
};

let perfEnabled = null;

export function isPerfEnabled() {
  if (perfEnabled !== null) return perfEnabled;
  if (typeof window === 'undefined') {
    perfEnabled = false;
    return false;
  }
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get('perf') === '1') {
      sessionStorage.setItem(PERF_SESSION_KEY, '1');
    }
    perfEnabled =
      q.get('perf') === '1' || sessionStorage.getItem(PERF_SESSION_KEY) === '1';
  } catch {
    perfEnabled = false;
  }
  return perfEnabled;
}

export function setPerfEnabled(on) {
  perfEnabled = !!on;
  try {
    if (on) sessionStorage.setItem(PERF_SESSION_KEY, '1');
    else sessionStorage.removeItem(PERF_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function perfLog(...args) {
  if (!isPerfEnabled()) return;
  console.info('[TrucoFX perf]', ...args);
}

export function perfMark(name, detail = {}) {
  if (!isPerfEnabled()) return;
  const entry = { name, t: performance.now(), detail };
  perfRegistry.marks.push(entry);
  if (perfRegistry.marks.length > 200) perfRegistry.marks.shift();
  performance.mark?.(`truco:${name}`);
}

export function perfMeasure(name, startMark, endMark) {
  if (!isPerfEnabled()) return null;
  try {
    performance.measure(`truco:${name}`, `truco:${startMark}`, `truco:${endMark}`);
    const m = performance.getEntriesByName(`truco:${name}`).pop();
    return m?.duration ?? null;
  } catch {
    return null;
  }
}

/** Latencia entre dos marcas por nombre (última ocurrencia de cada una). */
export function perfDeltaMs(fromName, toName) {
  const marks = perfRegistry.marks;
  let from = null;
  let to = null;
  for (let i = marks.length - 1; i >= 0; i--) {
    if (!to && marks[i].name === toName) to = marks[i].t;
    if (!from && marks[i].name === fromName) from = marks[i].t;
    if (from && to) break;
  }
  if (from == null || to == null) return null;
  return Math.round(to - from);
}

export function bumpRenderCount(componentName) {
  if (!isPerfEnabled()) return;
  perfRegistry.renders[componentName] = (perfRegistry.renders[componentName] || 0) + 1;
}

export function resetPerfSession() {
  perfRegistry.renders = {};
  perfRegistry.marks = [];
  perfRegistry.longTasks = [];
  perfRegistry.fps = 0;
  perfRegistry.lastSummary = null;
  try {
    performance.clearMarks?.();
    performance.clearMeasures?.();
  } catch {
    /* ignore */
  }
}

export function logBuildInfo() {
  const version = import.meta.env.VITE_BUILD_VERSION || 'unknown';
  const base = import.meta.env.BASE_URL || '/';
  if (isPerfEnabled() || import.meta.env.DEV) {
    console.info('[TrucoFX build]', { version, base, mode: import.meta.env.MODE });
  }
}

/** Resumen de latencia CARD_PLAYED (última jugada registrada). */
export function summarizeCardPlayLatency() {
  const clickToRecv = perfDeltaMs('playCard_click', 'cardPlayed_recv');
  const recvToState = perfDeltaMs('cardPlayed_recv', 'game_state_recv');
  const stateToPaint = perfDeltaMs('game_state_recv', 'board_painted');
  const clickToPaint = perfDeltaMs('playCard_click', 'board_painted');
  return {
    clickToRecv,
    recvToState,
    stateToPaint,
    clickToPaint,
  };
}
