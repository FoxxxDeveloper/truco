import { useRef } from 'react';
import { bumpRenderCount, isPerfEnabled } from '../utils/perf';

/**
 * Cuenta renders por componente (solo con ?perf=1).
 * @param {string} name
 */
export function useRenderCount(name) {
  const n = useRef(0);
  if (isPerfEnabled()) {
    n.current += 1;
    bumpRenderCount(name);
  }
}
