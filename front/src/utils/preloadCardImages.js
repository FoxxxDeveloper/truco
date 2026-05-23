import { getAllCardWebpUrls } from './cardAssets';

let preloadPromise = null;

/** Precarga WebP optimizadas (dorso + naipes). No precarga SVG pesados. */
export function preloadCardImages() {
  if (preloadPromise) return preloadPromise;

  const urls = getAllCardWebpUrls();

  preloadPromise = Promise.all(
    urls.map(
      (src) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(src);
          img.onerror = () => resolve(null);
          img.src = src;
        }),
    ),
  );

  return preloadPromise;
}
