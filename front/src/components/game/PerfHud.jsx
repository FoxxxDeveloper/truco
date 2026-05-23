import { isPerfEnabled, setPerfEnabled, perfRegistry } from '../../utils/perf';

/**
 * Overlay mínimo de métricas — solo con ?perf=1
 */
export default function PerfHud({ snapshot }) {
  if (!isPerfEnabled() || !snapshot) return null;

  const renders = Object.entries(snapshot.renders || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, v]) => `${k}:${v}`)
    .join(' ');

  const lat = snapshot.latency || {};
  const lt = (snapshot.longTasks || [])
    .map(t => `${t.duration}ms`)
    .join(', ');

  return (
    <div className="perf-hud" aria-live="polite">
      <div className="perf-hud__title">Perf</div>
      <div>FPS ~{snapshot.fps}</div>
      <div className="perf-hud__renders">{renders || '—'}</div>
      <div>
        Δ click→recv: {lat.clickToRecv ?? '—'}ms | recv→state: {lat.recvToState ?? '—'}ms
      </div>
      <div>
        Δ state→paint: {lat.stateToPaint ?? '—'}ms | click→paint: {lat.clickToPaint ?? '—'}ms
      </div>
      {lt ? <div>Long: {lt}</div> : null}
      <button
        type="button"
        className="perf-hud__btn"
        onClick={() => {
          perfRegistry.renders = {};
          perfRegistry.marks = [];
        }}
      >
        Reset contadores
      </button>
      <button
        type="button"
        className="perf-hud__btn"
        onClick={() => {
          setPerfEnabled(false);
          window.location.reload();
        }}
      >
        Salir perf
      </button>
    </div>
  );
}
