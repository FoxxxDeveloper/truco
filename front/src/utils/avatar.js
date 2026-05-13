/**
 * Avatares TrucoFX — formato guardado: trucofx:<theme>:<seed>:<variant>
 * Sin fotos, sin URLs externas, sin uploads.
 */

export const AVATAR_THEMES = [
  'mate',
  'espada',
  'basto',
  'copa',
  'oro',
  'zorro',
  'naipe',
  'sol',
  'bandera',
  'truco',
];

const THEME_LABELS = {
  mate: 'Mate',
  espada: 'Espada',
  basto: 'Basto',
  copa: 'Copa',
  oro: 'Oro',
  zorro: 'Zorro',
  naipe: 'Naipe',
  sol: 'Sol',
  bandera: 'Bandera',
  truco: 'Truco',
};

const TRUCOFX_RE =
  /^trucofx:(mate|espada|basto|copa|oro|zorro|naipe|sol|bandera|truco):([a-zA-Z0-9_-]{1,40}):([1-9]|1[0-2])$/;

const LEGACY_DEFAULT_MAP = {
  fox: 'zorro',
  sword: 'espada',
  cup: 'copa',
  oro: 'oro',
  bastos: 'basto',
  trucofx: 'truco',
};

export function hashString(s) {
  let h = 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function isTrucoAvatar(value) {
  if (value == null || typeof value !== 'string') return false;
  return TRUCOFX_RE.test(value.trim());
}

export function parseTrucoAvatar(value) {
  if (!isTrucoAvatar(value)) return null;
  const m = value.trim().match(TRUCOFX_RE);
  if (!m) return null;
  return {
    theme: m[1],
    seed: m[2],
    variant: parseInt(m[3], 10),
  };
}

export function normalizeAvatarSeed(value) {
  const s = String(value || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 40);
  return s || 'x';
}

export function getAvatarThemeLabel(theme) {
  return THEME_LABELS[theme] || theme;
}

/** Deterministic trucofx string for empty / unknown generado avatar. */
export function generateRandomTrucoAvatar(username) {
  const u = normalizeAvatarSeed(String(username || '?').slice(0, 24));
  const h = hashString(`trucofx|fallback|${u}`);
  const theme = AVATAR_THEMES[h % AVATAR_THEMES.length];
  const variant = (h % 12) + 1;
  const seed = normalizeAvatarSeed(`fb_${h.toString(36)}`);
  return `trucofx:${theme}:${seed}:${variant}`;
}

/**
 * Genera `count` candidatos distintos (salt distinto = distinta tanda).
 */
export function generateAvatarOptions(username, count = 8, salt = null) {
  const s0 = salt != null ? Number(salt) : Math.floor(Math.random() * 2147483647);
  const u = String(username || '?').slice(0, 32);
  const out = [];
  const seen = new Set();
  let saltCursor = s0;
  let guard = 0;
  while (out.length < count && guard < count * 20) {
    guard++;
    const h = hashString(`${u}|opt|${saltCursor}|${out.length}`);
    saltCursor = (saltCursor + 1103515245) | 0;
    const theme = AVATAR_THEMES[h % AVATAR_THEMES.length];
    const variant = (h % 12) + 1;
    const seed = normalizeAvatarSeed(`g${(h >>> 3).toString(36)}_${out.length}_${Math.abs(saltCursor).toString(36)}`);
    const key = `${theme}:${seed}:${variant}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`trucofx:${theme}:${seed}:${variant}`);
  }
  return out;
}

/** default:fox → trucofx equivalente solo para render (no escribe DB). */
export function legacyDefaultToTrucoAvatar(raw, username) {
  if (raw == null || typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t.startsWith('default:')) return null;
  const key = t.slice('default:'.length).toLowerCase();
  const theme = LEGACY_DEFAULT_MAP[key];
  if (!theme) return null;
  const seed = normalizeAvatarSeed(username || 'user');
  return `trucofx:${theme}:${seed}:1`;
}

/** Valor efectivo para renderizar con TrucoAvatar (trucofx o mapeo legacy o fallback). */
export function resolveDisplayTrucoAvatar(avatar, username) {
  if (avatar && isTrucoAvatar(avatar)) return avatar.trim();
  const legacy = legacyDefaultToTrucoAvatar(avatar, username);
  if (legacy) return legacy;
  return generateRandomTrucoAvatar(username);
}
