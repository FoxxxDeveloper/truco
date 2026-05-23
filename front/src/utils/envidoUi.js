/**
 * ¿Mostrar modal grande de comparación de Envido?
 * Rechazos (no querido) solo actualizan marcador vía gameState.
 */
export function shouldShowEnvidoResultModal(lastEvent) {
  if (!lastEvent || lastEvent.type !== 'ENVIDO_RESULT') return false;

  const ev = lastEvent.event;
  if (ev === 'ENVIDO_REJECTED') return false;
  if (lastEvent.accepted === false) return false;
  if (lastEvent.reason === 'rejected') return false;
  if (lastEvent.response === 'reject') return false;

  const reveal = lastEvent.envidoReveal ?? lastEvent.envidoTableReveal;
  if (reveal?.reason === 'rejected') return false;
  if (reveal?.wasAccepted === false && reveal?.reason !== 'accepted') return false;

  return ev === 'ENVIDO_RESOLVED';
}
