import { useEffect, useRef, useState } from 'react';
import {
  isPerfEnabled,
  perfLog,
  perfRegistry,
  summarizeCardPlayLatency,
} from '../utils/perf';

/**
 * FPS + long tasks + resumen periódico (solo ?perf=1).
 */
export function usePerfMonitor(gameState, lastEvent) {
  const [snapshot, setSnapshot] = useState(null);
  const framesRef = useRef(0);
  const lastFpsTs = useRef(performance.now());

  useEffect(() => {
    if (!isPerfEnabled()) return undefined;

    let raf = 0;
    const loop = now => {
      framesRef.current += 1;
      const elapsed = now - lastFpsTs.current;
      if (elapsed >= 1000) {
        perfRegistry.fps = Math.round((framesRef.current * 1000) / elapsed);
        framesRef.current = 0;
        lastFpsTs.current = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    let observer;
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            if (entry.duration >= 50) {
              perfRegistry.longTasks.push({
                duration: Math.round(entry.duration),
                startTime: Math.round(entry.startTime),
                name: entry.name,
              });
              if (perfRegistry.longTasks.length > 40) perfRegistry.longTasks.shift();
            }
          }
        });
        observer.observe({ entryTypes: ['longtask'] });
      } catch {
        /* longtask no soportado */
      }
    }

    const interval = setInterval(() => {
      const lat = summarizeCardPlayLatency();
      const summary = {
        fps: perfRegistry.fps,
        renders: { ...perfRegistry.renders },
        longTasks: perfRegistry.longTasks.slice(-5),
        latency: lat,
        lastEventType: lastEvent?.type ?? null,
        state: gameState?.state ?? null,
      };
      perfRegistry.lastSummary = summary;
      setSnapshot(summary);
      perfLog('tick', summary);
    }, 3000);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(interval);
      observer?.disconnect();
    };
  }, [gameState?.state, lastEvent?.type]);

  return snapshot;
}
