/**
 * Local batch generator: ElevenLabs TTS -> MP3 en public/sounds (solo cantos con voz).
 * Uso (desde front/): npm run generate:sounds
 *
 * Env:
 *   ELEVENLABS_API_KEY
 *   ELEVENLABS_VOICE_ID_MALE, ELEVENLABS_VOICE_ID_FEMALE (recomendado)
 *   ELEVENLABS_VOICE_ID (fallback si falta MALE o FEMALE)
 *   ELEVENLABS_MODEL_ID (default eleven_multilingual_v2)
 *   ELEVENLABS_OUTPUT_FORMAT (opcional)
 *   SOUND_VARIANTS_PER_GENDER (default 3, máximo 5)
 *
 * Flags:
 *   --dry-run              sin API ni créditos
 *   --force                en batch completo, regenerar aunque exista el archivo
 *   --stable               voice_settings fijos conservadores (ver voiceSettingsForJob)
 *   --clear                claridad seca (stability 0.90, similarity_boost 0.92, style 0.00); prioridad sobre --argento y --stable
 *   --phonetic             textos alternativos separados (PHONETIC_FILE_OVERRIDES; solo esos basenames)
 *   --argento              voice_settings sobrios (stability 0.75, similarity_boost 0.88, style 0.15); sin texto extra en el API
 *   --files=a,b            solo esos basenames (con o sin .mp3); siempre sobrescribe
 *   --clean-unused-voices  borra MP3 de voz UI viejos (notification/turno/mano/partida); requiere --yes
 *
 * Efectos UI: no se generan con ElevenLabs; usar /public/sounds/sfx/*.mp3
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONT_ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(FRONT_ROOT, 'public', 'sounds');

const DEFAULT_MODEL = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
const OUTPUT_FORMAT = process.env.ELEVENLABS_OUTPUT_FORMAT || 'mp3_44100_128';

/** Solo cantos con voz (12 keys). VOICE_KEYS_SORTED = más largo primero (parse --files). */
const VOICE_KEYS = [
  'truco',
  'retruco',
  'vale-cuatro',
  'envido',
  'real-envido',
  'falta-envido',
  'quiero',
  'no-quiero',
  'flor',
  'contra-flor',
  'son-buenas',
  'al-mazo',
  'puntos-en-mesa',
];

const VOICE_KEYS_SORTED = [...VOICE_KEYS].sort((a, b) => b.length - a.length);

/** @type {Record<string, string[]>} */
const PHRASES_BY_KEY = {
  truco: [
    'Truco.',
    'Te canto truco.',
    'Quiero truco.',
    'A ver ese truco.',
    'Vamos con truco.',
  ],
  retruco: [
    'Retruco.',
    'Canto retruco.',
    'Te subo, retruco.',
    'Vamos con retruco.',
    'Retruco, a ver.',
  ],
  'vale-cuatro': [
    'Vale cuatro.',
    'Canto vale cuatro.',
    'Te subo a vale cuatro.',
    'Vamos a vale cuatro.',
    'Vale cuatro.',
  ],
  envido: [
    'Envido.',
    'Canto envido.',
    'Cómo te ves para el envido.',
    'Vamos con envido.',
    'A ver ese envido.',
  ],
  'real-envido': [
    'Real envido.',
    'Canto real envido.',
    'Vamos con real envido.',
    'A ver ese real envido.',
    'Real envido.',
  ],
  'falta-envido': [
    'Falta envido.',
    'Canto falta envido.',
    'Vamos con falta envido.',
    'Falta envido, a ver qué tenés.',
    'Cómo te ves para falta envido.',
  ],
  quiero: ['Quiero.', 'Quiero, dale.', 'Sí, quiero.', 'Quiero, sí.', 'Quiero, jugá.'],
  'no-quiero': [
    'No quiero.',
    'No quiero, paso.',
    'No, no quiero.',
    'Paso, no quiero.',
    'No quiero, seguí.',
  ],
  flor: ['Flor.', 'Tengo flor.', 'Canto flor.', 'Flor en mano.', 'Vengo con flor.'],
  'contra-flor': [
    'Contra flor.',
    'Canto contra flor.',
    'Contra flor al resto.',
    'Vamos con contra flor.',
    'Contra flor, quiero ver.',
  ],
  'son-buenas': [
    'Son buenas.',
    'Las tuyas son buenas.',
    'Está bien, son buenas.',
    'Son buenas, seguí.',
    'Son buenas.',
  ],
  'al-mazo': [
    'Al mazo.',
    'Me voy al mazo.',
    'Paso, al mazo.',
    'No hay nada que hacer, al mazo.',
    'Al mazo, seguí.',
  ],
  'puntos-en-mesa': ['Puntos en mesa.', 'Puntos en mesa, mirá.', 'Te muestro los puntos en mesa.'],
};

/**
 * Texto TTS por archivo (basename sin .mp3). Mejora pronunciación sin renombrar el MP3.
 */
const FILE_TEXT_OVERRIDES = {
  'contra-flor-m-1': 'Contra flor.',
  'contra-flor-m-2': 'Contra flor.',
  'envido-m-1': 'Envido.',
  'envido-m-2': 'En-vi-do.',
  'falta-envido-m-1': 'Falta envido.',
  'real-envido-f-1': 'Real envido.',
  'real-envido-m-1': 'Real envido.',
  'retruco-f-1': 'Re truco.',
  'retruco-m-1': 'Re truco.',
  // Evitar "Lo quiero." (variante 4): el TTS lo confunde con "no quiero".
  'quiero-m-4': 'Quiero, sí.',
};

/** Solo con flag --phonetic (prueba de pronunciación). */
const PHONETIC_FILE_OVERRIDES = {
  'envido-m-1': 'En vi do.',
  'envido-m-2': 'Envido, quiero ver.',
  'falta-envido-m-1': 'Falta en vi do.',
  'real-envido-f-1': 'Real en vi do.',
};

/** @type {Record<string, string>} */
const PRESET_BY_KEY = Object.fromEntries(
  VOICE_KEYS.map(k => {
    if (['truco', 'retruco', 'vale-cuatro'].includes(k)) return [k, 'truco'];
    if (k === 'quiero') return [k, 'quiero'];
    if (k === 'no-quiero') return [k, 'noQuiero'];
    return [k, 'default'];
  }),
);

const VOICE_PRESETS = {
  default: { stability: 0.55, similarity_boost: 0.82, style: 0.32 },
  truco: { stability: 0.5, similarity_boost: 0.8, style: 0.38 },
  quiero: { stability: 0.52, similarity_boost: 0.86, style: 0.28 },
  noQuiero: { stability: 0.58, similarity_boost: 0.78, style: 0.26 },
};

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function loadLocalEnv() {
  parseEnvFile(path.join(FRONT_ROOT, '.env.local'));
  parseEnvFile(path.join(FRONT_ROOT, '.env'));
}

function resolveVoices() {
  const legacy = process.env.ELEVENLABS_VOICE_ID?.trim() || '';
  const male = process.env.ELEVENLABS_VOICE_ID_MALE?.trim() || legacy;
  const female = process.env.ELEVENLABS_VOICE_ID_FEMALE?.trim() || legacy;
  return { male, female, legacy };
}

function maskVoiceId(id) {
  if (!id || typeof id !== 'string') return '(sin id)';
  if (id.length <= 8) return `${id.slice(0, 4)}…`;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function parseVariantsPerGender() {
  const raw = process.env.SOUND_VARIANTS_PER_GENDER;
  const n = raw != null && String(raw).trim() !== '' ? parseInt(String(raw), 10) : 3;
  if (!Number.isFinite(n) || n < 1) return 3;
  return Math.min(5, Math.max(1, n));
}

function parseFilesArg(argv) {
  for (const a of argv) {
    if (a.startsWith('--files=')) {
      return a
        .slice('--files='.length)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    }
  }
  const idx = argv.indexOf('--files');
  if (idx !== -1 && argv[idx + 1] && !argv[idx + 1].startsWith('--')) {
    return argv[idx + 1]
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }
  return null;
}

/**
 * @param {string} token basename sin ruta
 * @returns {{ key: string, gender: 'm'|'f', n: number } | null}
 */
function parseFileToken(token) {
  const t = token.replace(/\.mp3$/i, '').trim();
  for (const key of VOICE_KEYS_SORTED) {
    const pm = `${key}-m-`;
    const pf = `${key}-f-`;
    if (t.startsWith(pm)) {
      const n = parseInt(t.slice(pm.length), 10);
      if (Number.isFinite(n) && n >= 1) return { key, gender: 'm', n };
    }
    if (t.startsWith(pf)) {
      const n = parseInt(t.slice(pf.length), 10);
      if (Number.isFinite(n) && n >= 1) return { key, gender: 'f', n };
    }
  }
  return null;
}

function voiceSettingsForJob(presetKey, variantIndex, variantsPerGender, stable, clear, argento) {
  if (clear) {
    return {
      stability: 0.9,
      similarity_boost: 0.92,
      style: 0,
      use_speaker_boost: true,
    };
  }
  if (argento) {
    return {
      stability: 0.75,
      similarity_boost: 0.88,
      style: 0.15,
      use_speaker_boost: true,
    };
  }
  if (stable) {
    return {
      stability: 0.75,
      similarity_boost: 0.9,
      style: 0.12,
      use_speaker_boost: true,
    };
  }
  const p = VOICE_PRESETS[presetKey] || VOICE_PRESETS.default;
  const t = variantsPerGender <= 1 ? 0.5 : variantIndex / (variantsPerGender - 1);
  const stability = Math.min(0.65, Math.max(0.45, 0.45 + t * 0.2));
  const similarity_boost = Math.min(0.9, Math.max(0.75, p.similarity_boost + (variantIndex % 2) * 0.04));
  const style = Math.min(0.45, Math.max(0.25, p.style + (variantIndex % 2) * 0.07));
  return {
    stability,
    similarity_boost,
    style,
    use_speaker_boost: true,
  };
}

function buildJobsBatch(variantsPerGender) {
  const jobs = [];
  for (const key of VOICE_KEYS) {
    const phrases = PHRASES_BY_KEY[key] || [''];
    const preset = PRESET_BY_KEY[key] || 'default';
    for (const gender of ['m', 'f']) {
      for (let n = 1; n <= variantsPerGender; n++) {
        const phraseIdx = (n - 1) % phrases.length;
        jobs.push({
          file: `${key}-${gender}-${n}`,
          text: phrases[phraseIdx],
          gender,
          genderLabel: gender === 'm' ? 'male' : 'female',
          preset,
          variantIndex: n - 1,
        });
      }
    }
  }
  return jobs;
}

/** Aplica overrides de texto (--phonetic gana sobre mapa base para esos archivos). */
function applyFileTextOverrides(jobs, phonetic) {
  for (const j of jobs) {
    if (phonetic && Object.prototype.hasOwnProperty.call(PHONETIC_FILE_OVERRIDES, j.file)) {
      j.text = PHONETIC_FILE_OVERRIDES[j.file];
    } else if (Object.prototype.hasOwnProperty.call(FILE_TEXT_OVERRIDES, j.file)) {
      j.text = FILE_TEXT_OVERRIDES[j.file];
    }
  }
}

const UNUSED_UI_VOICE_BASES = [
  'notification',
  'turno',
  'mano-ganada',
  'mano-perdida',
  'partida-ganada',
  'partida-perdida',
];

function collectUnusedUiVoiceMp3s() {
  if (!fs.existsSync(OUT_DIR)) return [];
  const escaped = UNUSED_UI_VOICE_BASES.map(b => b.replace(/-/g, '\\-')).join('|');
  const reMf = new RegExp(`^(${escaped})-[mf]-\\d+\\.mp3$`, 'i');
  const reLegacy = new RegExp(`^(${escaped})-\\d+\\.mp3$`, 'i');
  return fs.readdirSync(OUT_DIR).filter(name => reMf.test(name) || reLegacy.test(name));
}

/**
 * @param {Array<{ key: string, gender: 'm'|'f', n: number }>} parsed
 */
function buildJobsFromFilesList(parsed, variantsPerGender) {
  const jobs = [];
  for (const { key, gender, n } of parsed) {
    const phrases = PHRASES_BY_KEY[key];
    if (!phrases?.length) continue;
    const preset = PRESET_BY_KEY[key] || 'default';
    const phraseIdx = (n - 1) % phrases.length;
    jobs.push({
      file: `${key}-${gender}-${n}`,
      text: phrases[phraseIdx],
      gender,
      genderLabel: gender === 'm' ? 'male' : 'female',
      preset,
      variantIndex: Math.min(n - 1, Math.max(0, variantsPerGender - 1)),
    });
  }
  return jobs;
}

function assignVoiceIds(jobs, voiceMale, voiceFemale) {
  for (const j of jobs) {
    j.voiceId = j.gender === 'm' ? voiceMale : voiceFemale;
  }
}

async function synthesizeToFile({ apiKey, voiceId, modelId, text, voiceSettings, outPath, outputFormat }) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`;
  const body = {
    text,
    model_id: modelId,
    voice_settings: voiceSettings,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      Accept: 'audio/mpeg',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const err = new Error(`ElevenLabs HTTP ${res.status}${errText ? `: ${errText.slice(0, 200)}` : ''}`);
    err.status = res.status;
    throw err;
  }

  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
}

async function main() {
  loadLocalEnv();

  const argv = process.argv.slice(2);
  const force = argv.includes('--force');
  const dryRun = argv.includes('--dry-run');
  const stable = argv.includes('--stable');
  const clear = argv.includes('--clear');
  const phonetic = argv.includes('--phonetic');
  const argento = argv.includes('--argento');
  const cleanUnused = argv.includes('--clean-unused-voices');
  const yes = argv.includes('--yes');
  const filesList = parseFilesArg(argv);
  const variantsPerGender = parseVariantsPerGender();
  const { male, female, legacy } = resolveVoices();

  if (cleanUnused) {
    const victims = collectUnusedUiVoiceMp3s();
    console.log('--- Limpiar voces UI no usadas (notification / turno / mano / partida) ---');
    console.log(`Carpeta: ${OUT_DIR}`);
    console.log(`Archivos encontrados: ${victims.length}\n`);
    for (const name of victims) console.log(`  ${name}`);
    if (dryRun) {
      console.log('\n[dry-run] No se borró ningún archivo.');
      process.exit(0);
    }
    if (!yes) {
      console.error('\nAgregá --yes para confirmar el borrado, o --dry-run para solo listar.');
      process.exit(1);
    }
    let removed = 0;
    for (const name of victims) {
      try {
        fs.unlinkSync(path.join(OUT_DIR, name));
        removed++;
      } catch (e) {
        console.error(`No se pudo borrar ${name}: ${e?.message || e}`);
      }
    }
    console.log(`\nBorrados: ${removed}/${victims.length}`);
    process.exit(victims.length > 0 && removed < victims.length ? 1 : 0);
  }

  let jobs;
  let filesMode = false;

  if (filesList?.length) {
    filesMode = true;
    const parsed = [];
    const invalid = [];
    for (const raw of filesList) {
      const p = parseFileToken(raw);
      if (p) parsed.push(p);
      else invalid.push(raw);
    }
    if (invalid.length) {
      console.error('Tokens inválidos para --files (esperado: <key>-m-<n> o <key>-f-<n>):');
      for (const x of invalid) console.error(`  - ${x}`);
      process.exit(1);
    }
    jobs = buildJobsFromFilesList(parsed, variantsPerGender);
  } else {
    jobs = buildJobsBatch(variantsPerGender);
  }

  applyFileTextOverrides(jobs, phonetic);

  const keysCount = VOICE_KEYS.length;
  const total = jobs.length;

  console.log('--- ElevenLabs sound generation (solo cantos con voz) ---');
  if (phonetic) {
    console.log('Opción: --phonetic (textos en PHONETIC_FILE_OVERRIDES para los basenames listados allí)');
  }
  if (clear) {
    console.log(
      'Opción: --clear (stability 0.90, similarity_boost 0.92, style 0.00, use_speaker_boost true); prioridad sobre --argento',
    );
  } else if (argento) {
    console.log(
      'Opción: --argento (stability 0.75, similarity_boost 0.88, style 0.15, use_speaker_boost true)',
    );
  } else if (stable) {
    console.log('Opción: --stable (stability 0.75, similarity_boost 0.9, style 0.12, use_speaker_boost true)');
  }
  if (filesMode) {
    console.log(`Modo: --files (${total} archivo(s))`);
  } else {
    console.log(`Keys de voz: ${keysCount}  Variantes por género: ${variantsPerGender}`);
    console.log(`Total archivos planeados: ${total} (${keysCount} × 2 × ${variantsPerGender})`);
  }
  console.log(
    `Voces: male=${male ? `(configurada ${maskVoiceId(male)})` : '(falta)'}  female=${female ? `(configurada ${maskVoiceId(female)})` : '(falta)'}  legacy ELEVENLABS_VOICE_ID=${legacy ? '(sí)' : '(no)'}`,
  );
  if (male && female && male === female) {
    console.log('Nota: misma voice ID para male y female (fallback único).');
  }
  console.log('');

  if (dryRun) {
    let i = 0;
    for (const j of jobs) {
      i++;
      const hasPhonetic =
        phonetic && Object.prototype.hasOwnProperty.call(PHONETIC_FILE_OVERRIDES, j.file);
      const hasFileOverride = Object.prototype.hasOwnProperty.call(FILE_TEXT_OVERRIDES, j.file);
      const ov = hasPhonetic ? '  [phonetic]' : hasFileOverride ? '  [override]' : '';
      const vs = voiceSettingsForJob(j.preset, j.variantIndex, variantsPerGender, stable, clear, argento);
      const modeTag = clear
        ? '  [voice: clear]'
        : argento
          ? '  [voice: argento]'
          : stable
            ? '  [voice: stable]'
            : '';
      console.log(`  [${i}/${jobs.length}] ${j.file}.mp3  [${j.genderLabel}]  "${j.text}"${ov}${modeTag}`);
    }
    const vs = voiceSettingsForJob('default', 0, variantsPerGender, stable, clear, argento);
    const modeLabel = clear ? 'clear' : argento ? 'argento' : stable ? 'stable' : 'default (preset por canto)';
    console.log(
      `\nVoice settings de esta corrida (${modeLabel}): stability=${vs.stability} similarity_boost=${vs.similarity_boost} style=${vs.style} use_speaker_boost=${vs.use_speaker_boost}`,
    );
    console.log('');
    console.log(`[dry-run] Output dir: ${OUT_DIR}`);
    console.log('[dry-run] Sin llamadas a la API.');
    process.exit(0);
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey || !String(apiKey).trim()) {
    console.error('Falta ELEVENLABS_API_KEY (definila en .env.local o en el entorno).');
    process.exit(1);
  }
  if (!male || !female) {
    console.error(
      'Falta al menos una voz: definí ELEVENLABS_VOICE_ID_MALE y ELEVENLABS_VOICE_ID_FEMALE, o ELEVENLABS_VOICE_ID como fallback.',
    );
    process.exit(1);
  }

  assignVoiceIds(jobs, male, female);

  const modelId = DEFAULT_MODEL;
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`Model: ${modelId}  Output: ${OUTPUT_FORMAT}`);
  console.log(`Destination: ${OUT_DIR}\n`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const outPath = path.join(OUT_DIR, `${job.file}.mp3`);
    const label = `${job.file}.mp3`;
    const overwrite = filesMode || force;

    if (!overwrite && fs.existsSync(outPath)) {
      console.log(`[${i + 1}/${jobs.length}] skip (exists): ${label}`);
      skipped++;
      continue;
    }

    const voiceSettings = voiceSettingsForJob(job.preset, job.variantIndex, variantsPerGender, stable, clear, argento);
    const quoted = JSON.stringify(job.text);
    const vidLabel = maskVoiceId(job.voiceId);
    const hasPhonetic =
      phonetic && Object.prototype.hasOwnProperty.call(PHONETIC_FILE_OVERRIDES, job.file);
    const hasFileOverride = Object.prototype.hasOwnProperty.call(FILE_TEXT_OVERRIDES, job.file);
    const ovTag = hasPhonetic ? ' [phonetic]' : hasFileOverride ? ' [override]' : '';
    const modeTag = clear
      ? ` [clear st=${voiceSettings.stability} sim=${voiceSettings.similarity_boost} style=${voiceSettings.style}]`
      : argento
        ? ` [argento st=${voiceSettings.stability} sim=${voiceSettings.similarity_boost} style=${voiceSettings.style}]`
        : stable
          ? ` [stable st=${voiceSettings.stability} sim=${voiceSettings.similarity_boost} style=${voiceSettings.style}]`
          : '';
    process.stdout.write(
      `[${i + 1}/${jobs.length}] Generating ${label} [${job.genderLabel}] voz ${vidLabel} - ${quoted}${ovTag}${modeTag} ... `,
    );

    try {
      await synthesizeToFile({
        apiKey,
        voiceId: job.voiceId,
        modelId,
        text: job.text,
        voiceSettings,
        outPath,
        outputFormat: OUTPUT_FORMAT,
      });
      console.log('ok');
      ok++;
    } catch (e) {
      console.log('FAIL');
      const msg = e?.message || String(e);
      console.error(`  Error: ${msg}`);
      if (e?.status === 401) console.error('  (comprobá la API key; no se imprimen valores sensibles)');
      failed++;
    }

    await new Promise(r => setTimeout(r, 250));
  }

  console.log(`\nDone. ok=${ok} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error(err?.message || err);
  process.exit(1);
});
