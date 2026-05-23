import { useEffect, useState } from 'react';

export const MOBILE_LITE_MQ = '(max-width: 768px)';

/** SSR-safe: false en servidor. */
export function getIsMobileLite() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(MOBILE_LITE_MQ).matches;
}

/** Pantallas <=768px: animaciones y efectos reducidos. */
export function useIsMobileLite() {
  const [mobile, setMobile] = useState(getIsMobileLite);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_LITE_MQ);
    const sync = () => setMobile(mql.matches);
    sync();
    mql.addEventListener('change', sync);
    return () => mql.removeEventListener('change', sync);
  }, []);

  return mobile;
}
