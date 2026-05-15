/**
 * Avatares sociales estilo Avataaars (DiceBear @dicebear/avataaars, local).
 * Formato guardado: avataaars:<base64url(JSON)>
 */

export const AVATAAARS_STORE_KEYS = [
  'style',
  'top',
  'accessories',
  'accessoriesProbability',
  'hairColor',
  'facialHair',
  'facialHairColor',
  'facialHairProbability',
  'clothing',
  'clothingGraphic',
  'clothesColor',
  'eyes',
  'eyebrows',
  'mouth',
  'skinColor',
];

export const AVATAAARS_OPTIONS = {
  style: ['circle', 'default'],
  top: [
    'hat',
    'hijab',
    'turban',
    'winterHat1',
    'winterHat02',
    'winterHat03',
    'winterHat04',
    'bob',
    'bun',
    'curly',
    'curvy',
    'dreads',
    'frida',
    'fro',
    'froBand',
    'longButNotTooLong',
    'miaWallace',
    'shavedSides',
    'straight02',
    'straight01',
    'straightAndStrand',
    'dreads01',
    'dreads02',
    'frizzle',
    'shaggy',
    'shaggyMullet',
    'shortCurly',
    'shortFlat',
    'shortRound',
    'shortWaved',
    'sides',
    'theCaesar',
    'theCaesarAndSidePart',
    'bigHair',
  ],
  accessories: ['kurt', 'prescription01', 'prescription02', 'round', 'sunglasses', 'wayfarers', 'eyepatch'],
  hairColor: [
    'a55728',
    '2c1b18',
    'b58143',
    'd6b370',
    '724133',
    '4a312c',
    'f59797',
    'ecdcbf',
    'c93305',
    'e8e1e1',
  ],
  facialHair: ['beardLight', 'beardMajestic', 'beardMedium', 'moustacheFancy', 'moustacheMagnum'],
  facialHairColor: ['a55728', '2c1b18', 'b58143', 'd6b370', '724133', '4a312c', 'f59797', 'ecdcbf', 'c93305', 'e8e1e1'],
  clothing: [
    'blazerAndShirt',
    'blazerAndSweater',
    'collarAndSweater',
    'graphicShirt',
    'hoodie',
    'overall',
    'shirtCrewNeck',
    'shirtScoopNeck',
    'shirtVNeck',
  ],
  clothingGraphic: ['bat', 'bear', 'cumbia', 'deer', 'diamond', 'hola', 'pizza', 'resist', 'skull', 'skullOutline'],
  clothesColor: [
    '262e33',
    '65c9ff',
    '5199e4',
    '25557c',
    'e6e6e6',
    '929598',
    '3c4f5c',
    'b1e2ff',
    'a7ffc4',
    'ffafb9',
    'ffffb1',
    'ff488e',
    'ff5c5c',
    'ffffff',
  ],
  eyes: ['closed', 'cry', 'default', 'eyeRoll', 'happy', 'hearts', 'side', 'squint', 'surprised', 'winkWacky', 'wink', 'xDizzy'],
  eyebrows: [
    'angryNatural',
    'defaultNatural',
    'flatNatural',
    'frownNatural',
    'raisedExcitedNatural',
    'sadConcernedNatural',
    'unibrowNatural',
    'upDownNatural',
    'angry',
    'default',
    'raisedExcited',
    'sadConcerned',
    'upDown',
  ],
  mouth: ['concerned', 'default', 'disbelief', 'eating', 'grimace', 'sad', 'screamOpen', 'serious', 'smile', 'tongue', 'twinkle', 'vomit'],
  skinColor: ['614335', 'd08b5b', 'ae5d29', 'edb98a', 'ffdbb4', 'fd9841', 'f8d25c'],
};

const HEX6 = /^[a-fA-F0-9]{6}$/;
const TRUCOFX_BADGE_RE =
  /^trucofx-badge:(espada|basto|copa|oro|naipes|truco|zorro|sol|argentina|campeon|mate|facon):(verde|madera|cuero|argentina|oro):(medallon|escudo|aro|doble)$/;
const TRUCOFX_AVATAR_READ_RE =
  /^trucofx-avatar:(beam|marble|ring|sunset|pixel|bauhaus):([a-zA-Z0-9_-]{1,50})$/;
const LEGACY_TRUCOFX_RE =
  /^trucofx:(mate|espada|basto|copa|oro|zorro|naipe|sol|bandera|truco):([a-zA-Z0-9_-]{1,40}):([1-9]|1[0-2])$/;

export function hashString(s) {
  let h = 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rand, arr) {
  return arr[Math.floor(rand() * arr.length) % arr.length];
}

function validateAvataaarsConfigObject(obj) {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const keys = Object.keys(obj);
  if (keys.length !== AVATAAARS_STORE_KEYS.length) return false;
  for (const k of AVATAAARS_STORE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(obj, k)) return false;
  }
  for (const k of keys) {
    if (!AVATAAARS_STORE_KEYS.includes(k)) return false;
  }
  if (!AVATAAARS_OPTIONS.style.includes(obj.style)) return false;
  if (!AVATAAARS_OPTIONS.top.includes(obj.top)) return false;
  if (!AVATAAARS_OPTIONS.accessories.includes(obj.accessories)) return false;
  if (!Number.isInteger(obj.accessoriesProbability) || obj.accessoriesProbability < 0 || obj.accessoriesProbability > 100) {
    return false;
  }
  if (!HEX6.test(String(obj.hairColor))) return false;
  if (!AVATAAARS_OPTIONS.facialHair.includes(obj.facialHair)) return false;
  if (!HEX6.test(String(obj.facialHairColor))) return false;
  if (!Number.isInteger(obj.facialHairProbability) || obj.facialHairProbability < 0 || obj.facialHairProbability > 100) {
    return false;
  }
  if (!AVATAAARS_OPTIONS.clothing.includes(obj.clothing)) return false;
  if (!AVATAAARS_OPTIONS.clothingGraphic.includes(obj.clothingGraphic)) return false;
  if (!HEX6.test(String(obj.clothesColor))) return false;
  if (!AVATAAARS_OPTIONS.eyes.includes(obj.eyes)) return false;
  if (!AVATAAARS_OPTIONS.eyebrows.includes(obj.eyebrows)) return false;
  if (!AVATAAARS_OPTIONS.mouth.includes(obj.mouth)) return false;
  if (!HEX6.test(String(obj.skinColor))) return false;
  return true;
}

/** Convierte config guardada a opciones de createAvatar (arrays + seed). */
export function configToDicebearOptions(config, seedExtra = '') {
  const seed = `trucofx-${hashString(JSON.stringify(config) + seedExtra)}`;
  return {
    seed,
    style: [config.style],
    top: [config.top],
    accessories: [config.accessories],
    accessoriesProbability: config.accessoriesProbability,
    hairColor: [config.hairColor],
    facialHair: [config.facialHair],
    facialHairColor: [config.facialHairColor],
    facialHairProbability: config.facialHairProbability,
    clothing: [config.clothing],
    clothingGraphic: [config.clothingGraphic],
    clothesColor: [config.clothesColor],
    eyes: [config.eyes],
    eyebrows: [config.eyebrows],
    mouth: [config.mouth],
    skinColor: [config.skinColor],
  };
}

export function generateRandomAvataaarsConfig(username, salt = '') {
  const rand = mulberry32(hashString(`${String(username || 'u')}|${salt}|av`));
  return {
    style: pick(rand, AVATAAARS_OPTIONS.style),
    top: pick(rand, AVATAAARS_OPTIONS.top),
    accessories: pick(rand, AVATAAARS_OPTIONS.accessories),
    accessoriesProbability: Math.floor(rand() * 101),
    hairColor: pick(rand, AVATAAARS_OPTIONS.hairColor),
    facialHair: pick(rand, AVATAAARS_OPTIONS.facialHair),
    facialHairColor: pick(rand, AVATAAARS_OPTIONS.facialHairColor),
    facialHairProbability: Math.floor(rand() * 101),
    clothing: pick(rand, AVATAAARS_OPTIONS.clothing),
    clothingGraphic: pick(rand, AVATAAARS_OPTIONS.clothingGraphic),
    clothesColor: pick(rand, AVATAAARS_OPTIONS.clothesColor),
    eyes: pick(rand, AVATAAARS_OPTIONS.eyes),
    eyebrows: pick(rand, AVATAAARS_OPTIONS.eyebrows),
    mouth: pick(rand, AVATAAARS_OPTIONS.mouth),
    skinColor: pick(rand, AVATAAARS_OPTIONS.skinColor),
  };
}

export function encodeAvatarConfig(config) {
  if (!validateAvataaarsConfigObject(config)) return null;
  const ordered = {};
  for (const k of AVATAAARS_STORE_KEYS) ordered[k] = config[k];
  const json = JSON.stringify(ordered);
  const utf8 = new TextEncoder().encode(json);
  let bin = '';
  utf8.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `avataaars:${b64}`;
}

function base64UrlToUint8Array(payload) {
  let b64 = String(payload).replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  if (pad) b64 += '='.repeat(4 - pad);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Acepta `avataaars:<payload>` completo o solo payload; devuelve objeto o null. */
export function decodeAvatarConfig(value) {
  if (value == null || typeof value !== 'string') return null;
  const t = value.trim();
  const payload = t.startsWith('avataaars:') ? t.slice('avataaars:'.length) : t;
  if (!payload || payload.length > 2600) return null;
  try {
    const bytes = base64UrlToUint8Array(payload);
    const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (/https?:|\/uploads|data:image|base64|<\s*svg|<\s*html/i.test(json)) return null;
    const obj = JSON.parse(json);
    if (!validateAvataaarsConfigObject(obj)) return null;
    return obj;
  } catch {
    return null;
  }
}

export function isAvataaarsAvatar(value) {
  if (value == null || typeof value !== 'string') return false;
  const t = value.trim();
  if (!t.startsWith('avataaars:')) return false;
  if (t.length > 2800) return false;
  return decodeAvatarConfig(t) !== null;
}

export const isStorableTrucoFxAvatar = isAvataaarsAvatar;

export function generateAvatarOptions(username, count = 8, salt = null) {
  const s0 = salt != null ? Number(salt) : Date.now();
  const u = String(username || 'u');
  const seen = new Set();
  const out = [];
  let i = 0;
  while (out.length < count && i < count * 25) {
    const cfg = generateRandomAvataaarsConfig(u, `${s0}|${i}`);
    const enc = encodeAvatarConfig(cfg);
    i += 1;
    if (!enc || seen.has(enc)) continue;
    seen.add(enc);
    out.push(enc);
  }
  return out;
}

/**
 * Config determinístico para cualquier avatar legacy (boring, badge, uploads, vacío).
 */
export function legacyAvatarToAvataaars(value, username) {
  const raw = value == null ? '' : String(value).trim();
  const u = String(username || 'jugador').slice(0, 40);
  const h = hashString(`${raw}|${u}|legacyAA`);
  return generateRandomAvataaarsConfig(u, `leg_${h}`);
}

export function resolveAvataaarsConfig(avatar, username) {
  const decoded = avatar && typeof avatar === 'string' && avatar.trim().startsWith('avataaars:')
    ? decodeAvatarConfig(avatar.trim())
    : null;
  if (decoded) return decoded;
  const t = avatar == null ? '' : String(avatar).trim();
  if (t.startsWith('avataaars:')) return legacyAvatarToAvataaars(t, username);
  if (TRUCOFX_BADGE_RE.test(t) || TRUCOFX_AVATAR_READ_RE.test(t) || LEGACY_TRUCOFX_RE.test(t)) {
    return legacyAvatarToAvataaars(t, username);
  }
  if (t.startsWith('default:')) return legacyAvatarToAvataaars(t, username);
  if (t.startsWith('/uploads/') || /^https?:\/\//i.test(t)) return legacyAvatarToAvataaars(t, username);
  if (!t) return legacyAvatarToAvataaars('', username);
  return legacyAvatarToAvataaars(t, username);
}

export function getAvatarLabel(avatar) {
  if (!isAvataaarsAvatar(avatar)) return 'Avatar TrucoFX';
  return 'Personaje TrucoFX';
}
