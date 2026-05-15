/**
 * Validación server-side para avatares `avataaars:<base64url JSON>`.
 * Allowlists alineadas con front/src/utils/avatar.js (DiceBear avataaars).
 */

const AVATAAARS_STORE_KEYS = [
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

const AVATAAARS_OPTIONS = {
  style: ['circle', 'default'],
  top: [
    'hat', 'hijab', 'turban', 'winterHat1', 'winterHat02', 'winterHat03', 'winterHat04',
    'bob', 'bun', 'curly', 'curvy', 'dreads', 'frida', 'fro', 'froBand', 'longButNotTooLong',
    'miaWallace', 'shavedSides', 'straight02', 'straight01', 'straightAndStrand', 'dreads01',
    'dreads02', 'frizzle', 'shaggy', 'shaggyMullet', 'shortCurly', 'shortFlat', 'shortRound',
    'shortWaved', 'sides', 'theCaesar', 'theCaesarAndSidePart', 'bigHair',
  ],
  accessories: ['kurt', 'prescription01', 'prescription02', 'round', 'sunglasses', 'wayfarers', 'eyepatch'],
  hairColor: ['a55728', '2c1b18', 'b58143', 'd6b370', '724133', '4a312c', 'f59797', 'ecdcbf', 'c93305', 'e8e1e1'],
  facialHair: ['beardLight', 'beardMajestic', 'beardMedium', 'moustacheFancy', 'moustacheMagnum'],
  facialHairColor: ['a55728', '2c1b18', 'b58143', 'd6b370', '724133', '4a312c', 'f59797', 'ecdcbf', 'c93305', 'e8e1e1'],
  clothing: [
    'blazerAndShirt', 'blazerAndSweater', 'collarAndSweater', 'graphicShirt', 'hoodie', 'overall',
    'shirtCrewNeck', 'shirtScoopNeck', 'shirtVNeck',
  ],
  clothingGraphic: ['bat', 'bear', 'cumbia', 'deer', 'diamond', 'hola', 'pizza', 'resist', 'skull', 'skullOutline'],
  clothesColor: [
    '262e33', '65c9ff', '5199e4', '25557c', 'e6e6e6', '929598', '3c4f5c', 'b1e2ff', 'a7ffc4',
    'ffafb9', 'ffffb1', 'ff488e', 'ff5c5c', 'ffffff',
  ],
  eyes: ['closed', 'cry', 'default', 'eyeRoll', 'happy', 'hearts', 'side', 'squint', 'surprised', 'winkWacky', 'wink', 'xDizzy'],
  eyebrows: [
    'angryNatural', 'defaultNatural', 'flatNatural', 'frownNatural', 'raisedExcitedNatural',
    'sadConcernedNatural', 'unibrowNatural', 'upDownNatural', 'angry', 'default', 'raisedExcited',
    'sadConcerned', 'upDown',
  ],
  mouth: ['concerned', 'default', 'disbelief', 'eating', 'grimace', 'sad', 'screamOpen', 'serious', 'smile', 'tongue', 'twinkle', 'vomit'],
  skinColor: ['614335', 'd08b5b', 'ae5d29', 'edb98a', 'ffdbb4', 'fd9841', 'f8d25c'],
};

const HEX6 = /^[a-fA-F0-9]{6}$/;

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

function base64UrlToUtf8(payload) {
  let b64 = String(payload).replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  if (pad) b64 += '='.repeat(4 - pad);
  return Buffer.from(b64, 'base64').toString('utf8');
}

/**
 * @param {string} avatar trimmed full value
 * @returns {boolean}
 */
function validateAvataaarsAvatarString(avatar) {
  if (avatar == null || typeof avatar !== 'string') return false;
  const t = avatar.trim();
  if (!t.startsWith('avataaars:')) return false;
  if (t.length > 2500) return false;
  if (/^https?:\/\//i.test(t) || t.includes('/uploads') || t.startsWith('trucofx-') || t.startsWith('default:')) {
    return false;
  }
  const payload = t.slice('avataaars:'.length);
  if (!payload || /<\s*svg|<\s*html|data:image/i.test(payload)) return false;
  let json;
  try {
    json = base64UrlToUtf8(payload);
  } catch {
    return false;
  }
  if (/https?:\/\/|\/uploads\/|data:image|base64,|<\s*svg|<\s*html/i.test(json)) return false;
  let obj;
  try {
    obj = JSON.parse(json);
  } catch {
    return false;
  }
  return validateAvataaarsConfigObject(obj);
}

module.exports = {
  validateAvataaarsAvatarString,
};
