/**
 * Resolve stored avatar to a usable <img src>, or null for presets / trucofx / invalid.
 */
export function resolveAvatarSrc(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (s.startsWith('avataaars:')) return null;
  if (s.startsWith('trucofx-avatar:')) return null;
  if (s.startsWith('trucofx:')) return null;
  if (s.startsWith('default:')) return null;
  if (s.startsWith('/uploads/')) {
    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    const origin = API_BASE.replace(/\/api\/?$/, '');
    return origin + s;
  }
  if (/^https?:\/\//i.test(s)) return s;
  return null;
}

export function parseDefaultAvatarKey(raw) {
  if (raw == null || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s.startsWith('default:')) return null;
  return s.slice('default:'.length).toLowerCase();
}
