/**
 * toastOnce — shows a toast but deduplicates identical messages.
 * A message with the same text won't fire again for `cooldownMs` (default 3 s).
 */
import toast from 'react-hot-toast';

const shown = new Map(); // message → timestamp

export function toastOnce(message, { type = 'error', cooldownMs = 3000, ...opts } = {}) {
  const now = Date.now();
  const last = shown.get(message);
  if (last && now - last < cooldownMs) return;
  shown.set(message, now);

  if (type === 'error')   return toast.error(message, opts);
  if (type === 'success') return toast.success(message, opts);
  return toast(message, opts);
}

export function toastErrorOnce(msg, opts) {
  return toastOnce(msg, { type: 'error', ...opts });
}

export function toastSuccessOnce(msg, opts) {
  return toastOnce(msg, { type: 'success', ...opts });
}
