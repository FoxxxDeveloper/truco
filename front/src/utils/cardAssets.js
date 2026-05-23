import { publicPath } from './publicPath';

/** Carpetas bajo public/ (rutas absolutas sin base; usar publicPath()). */
export const CARD_SVG_DIR = '/cartas';
export const CARD_WEBP_DIR = '/cartas-webp';

const SUIT_FILE = {
  espada: 'swords',
  basto: 'clubs',
  oro: 'coins',
  copa: 'cups',
};

const VALUES = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
const SUIT_FILES = ['swords', 'clubs', 'coins', 'cups'];

/** Nombre de archivo sin extensión, p. ej. card_coins_01 */
export function cardBaseName(suit, value) {
  const s = SUIT_FILE[suit] || suit;
  const n = String(value).padStart(2, '0');
  return `card_${s}_${n}`;
}

export function getCardWebpUrl(suit, value) {
  return publicPath(`${CARD_WEBP_DIR}/${cardBaseName(suit, value)}.webp`);
}

export function getCardSvgUrl(suit, value) {
  return publicPath(`${CARD_SVG_DIR}/${cardBaseName(suit, value)}.svg`);
}

export function getCardBackWebpUrl() {
  return publicPath(`${CARD_WEBP_DIR}/card_back.webp`);
}

export function getCardBackSvgUrl() {
  return publicPath(`${CARD_SVG_DIR}/card_back.svg`);
}

/** URLs WebP para precarga (dorso + 48 cartas). */
export function getAllCardWebpUrls() {
  const urls = [getCardBackWebpUrl()];
  for (const file of SUIT_FILES) {
    for (const v of VALUES) {
      urls.push(publicPath(`${CARD_WEBP_DIR}/card_${file}_${String(v).padStart(2, '0')}.webp`));
    }
  }
  return urls;
}
