/**
 * Auditoría temporal de emits socket por acción de juego.
 * Activar: SOCKET_PERF_AUDIT=1 en .env del backend
 */
const logger = require('./logger');

const enabled = () => process.env.SOCKET_PERF_AUDIT === '1';

/** @type {Map<string, { action: string, roomId: string, events: object[], t0: number }>} */
const batches = new Map();

function beginAction(roomId, action, meta = {}) {
  if (!enabled()) return null;
  const id = `${roomId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  batches.set(id, {
    roomId,
    action,
    meta,
    events: [],
    t0: Date.now(),
  });
  return id;
}

function recordEmit(batchId, eventName, extra = {}) {
  if (!batchId || !enabled()) return;
  const b = batches.get(batchId);
  if (!b) return;
  b.events.push({
    event: eventName,
    ms: Date.now() - b.t0,
    ...extra,
  });
}

function endAction(batchId) {
  if (!batchId || !enabled()) return;
  const b = batches.get(batchId);
  batches.delete(batchId);
  if (!b) return;

  const counts = {};
  for (const e of b.events) {
    counts[e.event] = (counts[e.event] || 0) + 1;
  }

  logger.info('socket_perf_action', {
    roomId: b.roomId,
    action: b.action,
    totalMs: Date.now() - b.t0,
    emitCounts: counts,
    sequence: b.events,
    meta: b.meta,
  });
}

module.exports = { beginAction, recordEmit, endAction, isSocketPerfAuditEnabled: enabled };
