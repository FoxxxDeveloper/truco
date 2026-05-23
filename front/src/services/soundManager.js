import { publicPath } from '../utils/publicPath';

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
const BAD_SOUND_FILES_RAW = [
  '/sounds/envido-m-1.mp3',
  '/sounds/envido-m-2.mp3',
  '/sounds/falta-envido-m-1.mp3',
  '/sounds/real-envido-f-1.mp3',
  // TTS: "Lo quiero." suena a "no quiero" en esta variante.
  '/sounds/quiero-m-4.mp3',
];
export const BAD_SOUND_FILES = new Set(BAD_SOUND_FILES_RAW.map(publicPath));

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
  'puntosEnMesa',
];

/** Keys de efecto corto (un solo archivo bajo /sounds/sfx/). */
const SFX_CAMEL_KEYS = [
  'notification',
  'turno',
  'manoGanada',
  'manoPerdida',
  'partidaGanada',
  'partidaPerdida',
  'cardInit',
  'cardPlay',
  'cardPlaySelf',
  'cardPlayOpponent',
  'victory',
  'defeat',
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
  puntosEnMesa: 'puntos-en-mesa',
};

function mapLegacy(paths) {
  return paths.map(publicPath);
}

/** Legacy solo para cantos con voz (sin género en el nombre). */
const LEGACY_VOICE_PATHS = {
  truco: mapLegacy(['/sounds/truco-1.mp3', '/sounds/truco-2.mp3', '/sounds/truco-3.mp3']),
  retruco: mapLegacy(['/sounds/retruco-1.mp3', '/sounds/retruco-2.mp3']),
  valeCuatro: mapLegacy(['/sounds/vale-cuatro-1.mp3', '/sounds/vale-cuatro-2.mp3']),
  envido: mapLegacy(['/sounds/envido-1.mp3', '/sounds/envido-2.mp3', '/sounds/envido-3.mp3']),
  realEnvido: mapLegacy(['/sounds/real-envido-1.mp3', '/sounds/real-envido-2.mp3']),
  faltaEnvido: mapLegacy(['/sounds/falta-envido-1.mp3', '/sounds/falta-envido-2.mp3']),
  quiero: mapLegacy(['/sounds/quiero-1.mp3', '/sounds/quiero-2.mp3', '/sounds/quiero-3.mp3']),
  noQuiero: mapLegacy(['/sounds/no-quiero-1.mp3', '/sounds/no-quiero-2.mp3']),
  flor: mapLegacy(['/sounds/flor-1.mp3']),
  contraFlor: mapLegacy(['/sounds/contra-flor-1.mp3']),
  sonBuenas: mapLegacy(['/sounds/son-buenas-1.mp3']),
  alMazo: mapLegacy(['/sounds/al-mazo-1.mp3']),
  puntosEnMesa: mapLegacy([
    '/sounds/puntos-en-mesa-m-1.mp3',
    '/sounds/puntos-en-mesa-f-1.mp3',
    '/sounds/puntos-en-mesa-1.mp3',
  ]),
};

/** @type {Record<string, string | string[]>} Rutas bajo /sounds/sfx/ (orden = prioridad). */
const SFX_FILENAME_BY_KEY = {
  notification: 'notification.mp3',
  turno: 'turno.mp3',
  manoGanada: 'mano-ganada.mp3',
  manoPerdida: 'mano-perdida.mp3',
  partidaGanada: 'partida-ganada.mp3',
  partidaPerdida: 'partida-perdida.mp3',
  cardInit: ['card-init.ogg', 'card-init.mp3'],
  cardPlaySelf: ['card-play-me.ogg', 'card-play-me.mp3'],
  cardPlayOpponent: ['card-play-vs.ogg', 'card-play-vs.mp3'],
  cardPlay: ['card-play-me.ogg', 'card-play-vs.ogg', 'card-play.mp3'],
  victory: ['victory.mp3', 'victory.ogg'],
  defeat: ['defeat.mp3', 'defeat.ogg'],
};

function genderPrefixedPaths(slug) {
  const out = [];
  for (const g of ['m', 'f']) {
    for (let i = 1; i <= MAX_VARIANTS_PER_GENDER; i++) {
      out.push(publicPath(`/sounds/${slug}-${g}-${i}.mp3`));
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

const SFX_FALLBACK_BY_KEY = {
  victory: ['mano-ganada.mp3', 'partida-ganada.mp3'],
  defeat: ['mano-perdida.mp3', 'partida-perdida.mp3'],
};

function buildSfxPaths(camelKey) {
  const primary = SFX_FILENAME_BY_KEY[camelKey];
  const fallbacks = SFX_FALLBACK_BY_KEY[camelKey] || [];
  const files = [
    ...(Array.isArray(primary) ? primary : primary ? [primary] : []),
    ...fallbacks,
  ].filter((f, i, arr) => f && arr.indexOf(f) === i);
  if (!files.length) return [];
  return files.map((f) => publicPath(`/sounds/sfx/${f}`));
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

let voicePreloadScheduled = false;

function cacheAudioUrl(url) {
  if (audioByUrl.has(url)) return;
  try {
    const a = new Audio(url);
    a.preload = 'auto';
    a.load();
    audioByUrl.set(url, a);
  } catch {
    /* ignore */
  }
}

/** SFX cortos: prioridad al primer gesto (no bloquean UI). */
function preloadSfxOnly() {
  for (const key of SFX_CAMEL_KEYS) {
    const urls = SOUND_MAP[key] || [];
    for (const url of urls) cacheAudioUrl(url);
  }
}

/** Voces: diferidas para no competir con cartas/UI en mobile. */
function preloadVoiceSounds() {
  for (const key of VOICE_CAMEL_KEYS) {
    const urls = SOUND_MAP[key] || [];
    for (const url of urls) {
      if (BAD_SOUND_FILES.has(url)) continue;
      cacheAudioUrl(url);
    }
  }
}

export function preloadSounds() {
  unlockAudio();
  preloadSfxOnly();
  if (voicePreloadScheduled) return;
  voicePreloadScheduled = true;
  const runVoice = () => preloadVoiceSounds();
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(runVoice, { timeout: 4000 });
  } else {
    setTimeout(runVoice, 600);
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
  if (!audioByUrl.has(url)) cacheAudioUrl(url);

  let audio;
  try {
    audio = new Audio(url);
    audio.preload = 'auto';
  } catch {
    return false;
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
