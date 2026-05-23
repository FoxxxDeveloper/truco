/**
 * Prefix absolute public asset paths with Vite base (e.g. /test/ in production).
 */
export function publicPath(absPath) {
  if (!absPath || typeof absPath !== 'string') return absPath;
  if (!absPath.startsWith('/')) return absPath;
  const base = import.meta.env.BASE_URL || '/';
  if (base === '/') return absPath;
  const root = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${root}${absPath}`;
}
