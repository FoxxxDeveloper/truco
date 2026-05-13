/**
 * Append a message if its id is not already present (socket + fetch dedupe).
 */
export function appendMessageDeduped(prev, msg) {
  if (msg?.id != null && prev.some((m) => m.id === msg.id)) return prev;
  return [...prev, msg];
}
