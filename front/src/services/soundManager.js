/**
 * Sonidos locales: cantos con voz (variantes m/f + legacy) y efectos UI en /sounds/sfx/.
 * Sin ElevenLabs en runtime.
 *
 * Los MP3 viejos tipo notification-m-1.mp3 / turno-f-2.mp3 ya no se usan (solo SFX en /sounds/sfx/).
 * Para borrarlos: npm run generate:sounds -- --clean-unused-voices --yes
 */

const LS_ENABLED = 'trucofx.sound.enabled';
const LS_VOLUME = 'trucofx.sound.volume';

export const MAX_VARIANTS_PER_GENDER = 5;

/**
 * Rutas que no deben reproducirse (TTS problemático). Set: playSound nunca las elige.
 * Si regenerás y suenan bien, borrá la entrada manualmente.
 */
export const BAD_SOUND_FILES = new Set([
  '/sounds/envido-m-1.mp3',
  '/sounds/envido-m-2.mp3',
  '/sounds/falta-envido-m-1.mp3',
  '/sounds/real-envido-f-1.mp3',
  // TTS: "Lo quiero." suena a "no quiero" en esta variante.
  '/sounds/quiero-m-4.mp3',
]);

/** Para envido / real envido / falta envido: con gender "any", probar primero variantes -f-. */
const VOICE_KEYS_FEMALE_FIRST = new Set(['envido', 'realEnvido', 'faltaEnvido']);

/** Keys que usan voces ElevenLabs (variantes -m- / -f- + legacy en /sounds/). */
const VOICE_CAMEL_KEYS = [
  'truco',
  'retruco',
  'valeCuatro',
  'envido',
  'realEnvido',
  'faltaEnvido',
  'quiero',
  'noQuiero',
  'flor',
  'contraFlor',
  'sonBuenas',
  'alMazo',
];

/** Keys de efecto corto (un solo archivo bajo /sounds/sfx/). */
const SFX_CAMEL_KEYS = [
  'notification',
  'turno',
  'manoGanada',
  'manoPerdida',
  'partidaGanada',
  'partidaPerdida',
];

const SFX_KEYS_SET = new Set(SFX_CAMEL_KEYS);

const SLUG_BY_VOICE_KEY = {
  truco: 'truco',
  retruco: 'retruco',
  valeCuatro: 'vale-cuatro',
  envido: 'envido',
  realEnvido: 'real-envido',
  faltaEnvido: 'falta-envido',
  quiero: 'quiero',
  noQuiero: 'no-quiero',
  flor: 'flor',
  contraFlor: 'contra-flor',
  sonBuenas: 'son-buenas',
  alMazo: 'al-mazo',
};

/** Legacy solo para cantos con voz (sin género en el nombre). */
const LEGACY_VOICE_PATHS = {
  truco: ['/sounds/truco-1.mp3', '/sounds/truco-2.mp3', '/sounds/truco-3.mp3'],
  retruco: ['/sounds/retruco-1.mp3', '/sounds/retruco-2.mp3'],
  valeCuatro: ['/sounds/vale-cuatro-1.mp3', '/sounds/vale-cuatro-2.mp3'],
  envido: ['/sounds/envido-1.mp3', '/sounds/envido-2.mp3', '/sounds/envido-3.mp3'],
  realEnvido: ['/sounds/real-envido-1.mp3', '/sounds/real-envido-2.mp3'],
  faltaEnvido: ['/sounds/falta-envido-1.mp3', '/sounds/falta-envido-2.mp3'],
  quiero: ['/sounds/quiero-1.mp3', '/sounds/quiero-2.mp3', '/sounds/quiero-3.mp3'],
  noQuiero: ['/sounds/no-quiero-1.mp3', '/sounds/no-quiero-2.mp3'],
  flor: ['/sounds/flor-1.mp3'],
  contraFlor: ['/sounds/contra-flor-1.mp3'],
  sonBuenas: ['/sounds/son-buenas-1.mp3'],
  alMazo: ['/sounds/al-mazo-1.mp3'],
};

const SFX_FILENAME_BY_KEY = {
  notification: 'notification.mp3',
  turno: 'turno.mp3',
  manoGanada: 'mano-ganada.mp3',
  manoPerdida: 'mano-perdida.mp3',
  partidaGanada: 'partida-ganada.mp3',
  partidaPerdida: 'partida-perdida.mp3',
};

function genderPrefixedPaths(slug) {
  const out = [];
  for (const g of ['m', 'f']) {
    for (let i = 1; i <= MAX_VARIANTS_PER_GENDER; i++) {
      out.push(`/sounds/${slug}-${g}-${i}.mp3`);
    }
  }
  return out;
}

function buildVoicePaths(camelKey) {
  const slug = SLUG_BY_VOICE_KEY[camelKey];
  if (!slug) return [];
  const pref = genderPrefixedPaths(slug);
  const leg = LEGACY_VOICE_PATHS[camelKey] || [];
  return [...pref, ...leg];
}

function buildSfxPaths(camelKey) {
  const fn = SFX_FILENAME_BY_KEY[camelKey];
  if (!fn) return [];
  return [`/sounds/sfx/${fn}`];
}

/** @type {Record<string, string[]>} */
export const SOUND_MAP = {
  ...Object.fromEntries(VOICE_CAMEL_KEYS.map(k => [k, buildVoicePaths(k)])),
  ...Object.fromEntries(SFX_CAMEL_KEYS.map(k => [k, buildSfxPaths(k)])),
};

export const SOUND_KEYS = Object.freeze(Object.keys(SOUND_MAP));

const audioByUrl = new Map();
const lastPlayByKey = new Map();
const SAME_KEY_DEBOUNCE_MS = 480;

function parseBool(v, defaultVal) {
  if (v === null || v === undefined) return defaultVal;
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return defaultVal;
}

export function getSoundEnabled() {
  try {
    return parseBool(localStorage.getItem(LS_ENABLED), true);
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled) {
  try {
    localStorage.setItem(LS_ENABLED, enabled ? 'true' : 'false');
  } catch {
    /* ignore */
  }
}

export function toggleSound() {
  const next = !getSoundEnabled();
  setSoundEnabled(next);
  return next;
}

export function getSoundVolume() {
  try {
    const v = parseFloat(localStorage.getItem(LS_VOLUME));
    if (Number.isFinite(v)) return Math.min(1, Math.max(0, v));
  } catch {
    /* ignore */
  }
  return 0.75;
}

export function setSoundVolume(volume) {
  const v = Math.min(1, Math.max(0, Number(volume) || 0));
  try {
    localStorage.setItem(LS_VOLUME, String(v));
  } catch {
    /* ignore */
  }
}

let unlockDone = false;

export function unlockAudio() {
  if (unlockDone) return;
  unlockDone = true;
  try {
    const a = new Audio(
      'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA',
    );
    a.volume = 0.001;
    const p = a.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch {
    /* ignore */
  }
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Legacy de cantos: sin `-m-` ni `-f-` en la ruta. */
function isLegacyGenderlessVoiceUrl(url) {
  if (url.includes('/sounds/sfx/')) return false;
  return !url.includes('-m-') && !url.includes('-f-');
}

/**
 * @param {string[]} paths
 * @param {'male' | 'female' | 'any'} gender
 */
function filterVoicePathsByGender(paths, gender) {
  if (gender === 'male') {
    return paths.filter(u => u.includes('-m-') || isLegacyGenderlessVoiceUrl(u));
  }
  if (gender === 'female') {
    return paths.filter(u => u.includes('-f-') || isLegacyGenderlessVoiceUrl(u));
  }
  return [...paths];
}

/**
 * Con gender "any", para envido/realEnvido/faltaEnvido: orden f → m → legacy (cada grupo aleatorio).
 * Con gender male/female, solo baraja.
 */
function orderVoiceCandidates(key, urls, gender) {
  if (gender === 'male' || gender === 'female' || !VOICE_KEYS_FEMALE_FIRST.has(key)) {
    shuffleInPlace(urls);
    return urls;
  }
  const fem = urls.filter(u => u.includes('-f-'));
  const mas = urls.filter(u => u.includes('-m-'));
  const leg = urls.filter(u => isLegacyGenderlessVoiceUrl(u));
  shuffleInPlace(fem);
  shuffleInPlace(mas);
  shuffleInPlace(leg);
  return [...fem, ...mas, ...leg];
}

export function preloadSounds() {
  unlockAudio();
  for (const [key, urls] of Object.entries(SOUND_MAP)) {
    for (const url of urls) {
      if (!SFX_KEYS_SET.has(key) && BAD_SOUND_FILES.has(url)) continue;
      if (audioByUrl.has(url)) continue;
      try {
        const a = new Audio(url);
        a.preload = 'auto';
        a.load();
        audioByUrl.set(url, a);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * @param {string} key  Una de SOUND_MAP
 * @param {{ gender?: 'male' | 'female' | 'any' }} [opts]  default any; solo aplica a cantos con voz
 */
export function playSound(key, opts = {}) {
  if (!getSoundEnabled()) return;
  const gender = opts.gender === 'male' || opts.gender === 'female' ? opts.gender : 'any';

  const allPaths = SOUND_MAP[key];
  if (!allPaths?.length) return;

  const isSfx = SFX_KEYS_SET.has(key);
  let candidates = isSfx ? [...allPaths] : filterVoicePathsByGender(allPaths, gender);
  if (!candidates.length) candidates = [...allPaths];
  if (!isSfx) {
    candidates = candidates.filter(u => !BAD_SOUND_FILES.has(u));
  }
  if (!candidates.length) return;

  const now = Date.now();
  const last = lastPlayByKey.get(key) || 0;
  if (now - last < SAME_KEY_DEBOUNCE_MS) return;
  lastPlayByKey.set(key, now);

  candidates = orderVoiceCandidates(key, candidates, gender);

  const maxAttempts = Math.min(2, candidates.length);

  void (async () => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const url = candidates[attempt];
      const ok = await tryPlayUrlOnce(url, getSoundVolume());
      if (ok) return;
    }
  })();
}

/**
 * @param {string} url
 * @param {number} volume
 * @returns {Promise<boolean>}
 */
async function tryPlayUrlOnce(url, volume) {
  let audio = audioByUrl.get(url);
  if (!audio) {
    try {
      audio = new Audio(url);
      audio.preload = 'auto';
      audioByUrl.set(url, audio);
    } catch {
      return false;
    }
  }

  return new Promise(resolve => {
    let settled = false;
    let tid = 0;

    const finish = ok => {
      if (settled) return;
      settled = true;
      if (tid) clearTimeout(tid);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('error', onError);
      resolve(ok);
    };

    const onPlaying = () => finish(true);
    const onError = () => finish(false);

    audio.addEventListener('playing', onPlaying, { once: true });
    audio.addEventListener('error', onError, { once: true });

    try {
      audio.volume = volume;
      audio.currentTime = 0;
      const p = audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => finish(false));
      }
    } catch {
      finish(false);
      return;
    }

    tid = setTimeout(() => finish(false), 900);
  });
}
