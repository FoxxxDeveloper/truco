/**
 * Avatar TrucoFX — SVG local (trucofx:…), legacy default/upload/https con fallback.
 */
import { useId, useState } from 'react';
import {
  isTrucoAvatar,
  parseTrucoAvatar,
  resolveDisplayTrucoAvatar,
  hashString,
} from '../../utils/avatar';
import { resolveAvatarSrc } from '../../utils/avatarUrl';

const C = {
  pano: '#004B23',
  pano2: '#06351f',
  gold: '#D4AF37',
  goldSoft: '#F3D686',
  wood: '#2B1B12',
  leather: '#1A1A1A',
  cream: '#FFF2CC',
  celeste: '#75AADB',
};

function shieldPath(variant) {
  const skew = (variant % 3) * 0.4;
  return `M 50 6 Q 88 ${10 + skew} 92 48 Q 92 78 50 94 Q 8 78 8 48 Q 12 ${10 + skew} 50 6 Z`;
}

function ThemeSymbol({ theme, variant, h }) {
  const rot = (variant * 3 + (h % 7)) % 360;
  const sc = 0.88 + (h % 5) * 0.02;

  switch (theme) {
    case 'mate':
      return (
        <g transform={`translate(50,52) scale(${sc})`}>
          <ellipse rx="22" ry="16" fill={C.wood} stroke={C.gold} strokeWidth="1.2" />
          <path d="M -8 -18 L 8 -18 L 6 18 L -6 18 Z" fill={C.leather} stroke={C.goldSoft} strokeWidth="0.8" opacity="0.95" />
          <line x1="0" y1="-14" x2="0" y2="16" stroke={C.gold} strokeWidth="1.4" strokeLinecap="round" />
        </g>
      );
    case 'espada':
      return (
        <g transform={`translate(50,54) rotate(${rot * 0.15}) scale(${sc * 0.9})`}>
          <path d="M 0 -32 L 4 -28 L 4 22 L 0 28 L -4 22 L -4 -28 Z" fill={C.cream} stroke={C.gold} strokeWidth="1.2" />
          <path d="M 0 -32 L 10 -24 L 6 -20 L 0 -26 Z" fill={C.goldSoft} stroke={C.gold} strokeWidth="0.6" />
        </g>
      );
    case 'basto':
      return (
        <g transform={`translate(50,56) scale(${sc * 0.85})`}>
          <path
            d="M 0 -28 C 18 -18 22 8 0 26 C -22 8 -18 -18 0 -28 Z"
            fill={C.leather}
            stroke={C.gold}
            strokeWidth="1.3"
          />
          <ellipse cx="0" cy="-8" rx="10" ry="8" fill={C.pano2} opacity="0.85" />
        </g>
      );
    case 'copa':
      return (
        <g transform={`translate(50,56) scale(${sc * 0.9})`}>
          <path d="M -16 12 Q 0 -22 16 12 L 12 18 L -12 18 Z" fill={C.cream} stroke={C.gold} strokeWidth="1.2" />
          <rect x="-4" y="18" width="8" height="10" rx="1" fill={C.gold} />
        </g>
      );
    case 'oro':
      return (
        <g transform={`translate(50,52) scale(${sc})`}>
          <circle r="26" fill={C.goldSoft} stroke={C.gold} strokeWidth="2" />
          <circle r="18" fill={C.pano} opacity="0.35" />
          <circle r="10" fill="none" stroke={C.gold} strokeWidth="1.4" />
          <path d="M 0 -11 L 11 0 L 0 11 L -11 0 Z" fill={C.gold} opacity="0.92" />
          <path d="M 0 -6 L 6 0 L 0 6 L -6 0 Z" fill={C.pano2} opacity="0.5" />
        </g>
      );
    case 'zorro':
      return (
        <g transform={`translate(50,50) scale(${sc * 0.95})`}>
          <path d="M -22 -4 L -8 -22 L 8 -22 L 22 -4 L 18 18 L -18 18 Z" fill={C.wood} stroke={C.gold} strokeWidth="1.2" />
          <circle cx="-8" cy="2" r="4" fill={C.cream} />
          <circle cx="8" cy="2" r="4" fill={C.cream} />
          <ellipse cx="0" cy="14" rx="6" ry="4" fill={C.leather} />
        </g>
      );
    case 'naipe':
      return (
        <g transform={`translate(50,52) rotate(${rot * 0.08}) scale(${sc * 0.88})`}>
          <rect x="-18" y="-26" width="36" height="52" rx="4" fill={C.cream} stroke={C.gold} strokeWidth="1.5" />
          <rect x="-12" y="-18" width="24" height="36" rx="2" fill={C.pano} opacity="0.25" />
          <path d="M 0 -8 L 6 4 L -6 4 Z" fill={C.gold} />
        </g>
      );
    case 'sol':
      return (
        <g transform={`translate(50,52) scale(${sc * 0.85})`}>
          <circle r="14" fill={C.goldSoft} stroke={C.gold} strokeWidth="1.5" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <line
              key={a}
              x1="0"
              y1="0"
              x2="0"
              y2="-30"
              stroke={C.gold}
              strokeWidth="2"
              strokeLinecap="round"
              transform={`rotate(${a + rot * 0.1})`}
            />
          ))}
        </g>
      );
    case 'bandera':
      return (
        <g transform={`translate(50,54) scale(${sc * 0.9})`}>
          <rect x="-22" y="-18" width="44" height="12" fill={C.celeste} stroke={C.gold} strokeWidth="0.6" />
          <rect x="-22" y="-6" width="44" height="12" fill={C.cream} stroke={C.gold} strokeWidth="0.6" />
          <rect x="-22" y="6" width="44" height="12" fill={C.celeste} stroke={C.gold} strokeWidth="0.6" />
        </g>
      );
    case 'truco':
      return (
        <g transform={`translate(50,54) scale(${sc * 0.75})`}>
          <path d="M -26 -8 L 0 -28 L 26 -8 L 18 24 L -18 24 Z" fill={C.leather} stroke={C.gold} strokeWidth="1.8" />
          <path d="M -14 0 L 0 -14 L 14 0 L 8 16 L -8 16 Z" fill={C.goldSoft} opacity="0.9" stroke={C.gold} strokeWidth="0.8" />
        </g>
      );
    default:
      return (
        <g transform={`translate(50,52)`}>
          <circle r="20" fill={C.pano2} stroke={C.gold} strokeWidth="1.5" />
        </g>
      );
  }
}

function TrucoSvg({ trucoValue, size }) {
  const uid = useId().replace(/:/g, '');
  const parsed = parseTrucoAvatar(trucoValue);
  if (!parsed) return null;
  const h = hashString(`${parsed.theme}|${parsed.seed}|${parsed.variant}`);
  const gradId = `tg-${uid}`;
  const strokeW = 1.2 + (parsed.variant % 3) * 0.35;
  const panoShift = (h % 30) - 15;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className="truco-avatar-svg"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={C.pano} />
          <stop offset="55%" stopColor={C.pano2} />
          <stop offset="100%" stopColor={C.wood} />
        </linearGradient>
        <radialGradient id={`${gradId}-in`} cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor={C.pano} stopOpacity="0.95" />
          <stop offset="100%" stopColor={C.leather} stopOpacity="0.9" />
        </radialGradient>
      </defs>
      <path d={shieldPath(parsed.variant)} fill={`url(#${gradId})`} stroke={C.gold} strokeWidth={strokeW} />
      <path
        d={shieldPath(parsed.variant)}
        fill={`url(#${gradId}-in)`}
        opacity="0.35"
        transform={`translate(${panoShift * 0.06}, ${(h % 8) * 0.05}) scale(0.88)`}
      />
      <ThemeSymbol theme={parsed.theme} variant={parsed.variant} h={h} />
    </svg>
  );
}

export default function TrucoAvatar({ avatar, username, size = 40, className = '' }) {
  const [imgFailed, setImgFailed] = useState(false);
  const src = !imgFailed && avatar ? resolveAvatarSrc(avatar) : null;
  const isNew = avatar && isTrucoAvatar(avatar);
  const displayTruco = resolveDisplayTrucoAvatar(avatar, username);

  if (src && !isNew) {
    return (
      <span
        className={`truco-avatar-root truco-avatar-root--legacy ${className}`.trim()}
        style={{ width: size, height: size }}
      >
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          className="truco-avatar-legacy-img"
          onError={() => setImgFailed(true)}
          draggable={false}
        />
      </span>
    );
  }

  return (
    <span
      className={`truco-avatar-root truco-avatar-root--svg ${className}`.trim()}
      style={{ width: size, height: size }}
    >
      <TrucoSvg trucoValue={displayTruco} size={size} />
    </span>
  );
}
