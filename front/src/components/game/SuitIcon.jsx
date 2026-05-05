/**
 * Suit icons for Argentine naipes españoles.
 * Drawn to match the classic Fournier/Vitoria deck style.
 */

/** ── ESPADA (blue steel sword) ─────────────────────────── */
function Espada({ size = 48 }) {
  return (
    <svg width={size} height={size * 1.5} viewBox="0 0 48 72" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Blade — gradient steel blue */}
      <defs>
        <linearGradient id="blade-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#8eb8d8"/>
          <stop offset="45%" stopColor="#d4eaf8"/>
          <stop offset="100%" stopColor="#6a9ab8"/>
        </linearGradient>
        <linearGradient id="blade-grad2" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#5580a0"/>
          <stop offset="50%" stopColor="#b0cfe0"/>
          <stop offset="100%" stopColor="#4a6f90"/>
        </linearGradient>
      </defs>
      {/* Main blade body */}
      <polygon points="24,4 21.5,62 24,65 26.5,62" fill="url(#blade-grad)" stroke="#4a6f90" strokeWidth="0.6"/>
      {/* Blade edge highlight */}
      <line x1="24" y1="5" x2="24" y2="62" stroke="rgba(255,255,255,0.6)" strokeWidth="0.8"/>
      {/* Cross-guard */}
      <path d="M8,52 C8,48 16,47 24,47 C32,47 40,48 40,52" fill="url(#blade-grad2)" stroke="#3a5c7a" strokeWidth="0.8"/>
      <path d="M8,52 C8,56 16,57 24,57 C32,57 40,56 40,52" fill="url(#blade-grad)" stroke="#3a5c7a" strokeWidth="0.8"/>
      {/* Quillon curls */}
      <path d="M8,52 Q2,50 3,46 Q4,43 7,44" stroke="#3a5c7a" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      <path d="M40,52 Q46,50 45,46 Q44,43 41,44" stroke="#3a5c7a" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      {/* Grip */}
      <rect x="21.5" y="56" width="5" height="10" rx="2.5" fill="#c8a060" stroke="#8a6030" strokeWidth="0.6"/>
      <rect x="21.5" y="66" width="5" height="3" rx="1.5" fill="#8a6030"/>
      {/* Tip */}
      <polygon points="24,4 22.5,10 25.5,10" fill="#d4eaf8"/>
    </svg>
  );
}

/** ── BASTO (green/brown club cudgel) ───────────────────── */
function Basto({ size = 48 }) {
  return (
    <svg width={size} height={size * 1.5} viewBox="0 0 48 72" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="basto-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#5a8030"/>
          <stop offset="40%" stopColor="#9fc050"/>
          <stop offset="100%" stopColor="#3d6020"/>
        </linearGradient>
        <linearGradient id="basto-knob" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#b0d860"/>
          <stop offset="100%" stopColor="#3d6020"/>
        </linearGradient>
      </defs>
      {/* Main shaft */}
      <path d="M20,68 C19,50 17,42 16,34 C15,26 14,20 18,14 C20,10 24,8 26,10 C30,14 28,22 28,34 C28,42 28,52 28,68 Z"
        fill="url(#basto-grad)" stroke="#2d5010" strokeWidth="0.7"/>
      {/* Shaft highlights */}
      <path d="M22,66 C22,48 21,40 21,30" stroke="rgba(200,240,100,0.45)" strokeWidth="1.2" strokeLinecap="round"/>
      {/* Knobs along the shaft */}
      {[22, 34, 46, 58].map((cy, i) => (
        <ellipse key={i} cx={i % 2 === 0 ? 22 : 26} cy={cy} rx="5" ry="3.5"
          fill="url(#basto-knob)" stroke="#2d5010" strokeWidth="0.6" transform={`rotate(${i * 15} ${i % 2 === 0 ? 22 : 26} ${cy})`}/>
      ))}
      {/* Decorative thorns/leaves */}
      <path d="M16,34 Q8,28 10,20 Q14,26 18,30" fill="#7ab030" stroke="#3d6020" strokeWidth="0.5"/>
      <path d="M30,40 Q38,32 36,24 Q32,30 28,36" fill="#7ab030" stroke="#3d6020" strokeWidth="0.5"/>
      {/* Base */}
      <ellipse cx="24" cy="68" rx="7" ry="2.5" fill="#3d6020" opacity="0.6"/>
    </svg>
  );
}

/** ── ORO (gold coin) ────────────────────────────────────── */
function Oro({ size = 48 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <radialGradient id="oro-fill" cx="38%" cy="32%">
          <stop offset="0%" stopColor="#ffe880"/>
          <stop offset="55%" stopColor="#f0a820"/>
          <stop offset="100%" stopColor="#b87010"/>
        </radialGradient>
        <radialGradient id="oro-inner" cx="40%" cy="35%">
          <stop offset="0%" stopColor="#fff4a0"/>
          <stop offset="100%" stopColor="#d49018"/>
        </radialGradient>
      </defs>
      {/* Outer rim */}
      <circle cx="24" cy="24" r="21" fill="url(#oro-fill)" stroke="#8a5c08" strokeWidth="1.2"/>
      {/* Inner ring */}
      <circle cx="24" cy="24" r="16" fill="url(#oro-inner)" stroke="#a07018" strokeWidth="0.8"/>
      {/* Cross-hatching detail (engraved look) */}
      {[0,60,120,180,240,300].map(deg => {
        const rad = deg * Math.PI / 180;
        return <line key={deg}
          x1={24 + 10 * Math.cos(rad)} y1={24 + 10 * Math.sin(rad)}
          x2={24 + 16 * Math.cos(rad)} y2={24 + 16 * Math.sin(rad)}
          stroke="#8a5c08" strokeWidth="1.2" strokeLinecap="round"/>;
      })}
      {/* Centre embossed circle */}
      <circle cx="24" cy="24" r="5.5" fill="#f8d840" stroke="#a07018" strokeWidth="0.7"/>
      <circle cx="24" cy="24" r="3" fill="#ffe060"/>
      {/* Highlight glint */}
      <ellipse cx="18" cy="18" rx="4" ry="2.5" fill="rgba(255,255,220,0.35)" transform="rotate(-30 18 18)"/>
    </svg>
  );
}

/** ── COPA (red/terracotta goblet) ──────────────────────── */
function Copa({ size = 48 }) {
  return (
    <svg width={size} height={size * 1.4} viewBox="0 0 48 68" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="copa-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e05030"/>
          <stop offset="45%" stopColor="#c03820"/>
          <stop offset="100%" stopColor="#801810"/>
        </linearGradient>
        <linearGradient id="copa-body2" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#d04020"/>
          <stop offset="40%" stopColor="#f07050"/>
          <stop offset="100%" stopColor="#a02810"/>
        </linearGradient>
        <linearGradient id="copa-base" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c03820"/>
          <stop offset="100%" stopColor="#801810"/>
        </linearGradient>
      </defs>
      {/* Foot/base platform */}
      <rect x="10" y="60" width="28" height="6" rx="3" fill="url(#copa-base)" stroke="#601008" strokeWidth="0.8"/>
      {/* Stem */}
      <path d="M21,60 L21,50 Q21,46 24,46 Q27,46 27,50 L27,60" fill="url(#copa-body)" stroke="#601008" strokeWidth="0.6"/>
      {/* Knop on stem */}
      <ellipse cx="24" cy="54" rx="4.5" ry="3" fill="url(#copa-body2)" stroke="#601008" strokeWidth="0.6"/>
      {/* Cup body */}
      <path d="M10,12 Q8,28 12,36 Q16,44 24,46 Q32,44 36,36 Q40,28 38,12 Z"
        fill="url(#copa-body)" stroke="#601008" strokeWidth="0.8"/>
      {/* Cup inner shadow */}
      <path d="M14,12 Q13,26 16,34 Q19,41 24,43 Q29,41 32,34 Q35,26 34,12 Z"
        fill="url(#copa-body2)" opacity="0.6"/>
      {/* Rim */}
      <ellipse cx="24" cy="12" rx="14" ry="4" fill="url(#copa-body2)" stroke="#601008" strokeWidth="0.8"/>
      {/* Highlight */}
      <path d="M14,18 Q13,28 15,34" stroke="rgba(255,180,140,0.5)" strokeWidth="2" strokeLinecap="round"/>
      {/* Decorative band */}
      <path d="M11,22 Q24,19 37,22" stroke="#f07050" strokeWidth="1" fill="none" opacity="0.7"/>
    </svg>
  );
}

const SUIT_COMPONENTS = { espada: Espada, basto: Basto, oro: Oro, copa: Copa };

export const SUIT_COLORS = {
  espada: '#2a4a6a',
  basto:  '#2d5010',
  oro:    '#a07018',
  copa:   '#801810',
};

export default function SuitIcon({ suit, size = 48 }) {
  const Component = SUIT_COMPONENTS[suit];
  if (!Component) return null;
  return <Component size={size} />;
}

