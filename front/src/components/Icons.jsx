/**
 * Clean SVG icon set — replaces all emoji usage in the UI.
 * All icons use currentColor so they inherit from CSS.
 */

export function UserIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
      <circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.6"/>
      <path d="M3 17c0-3.866 3.134-7 7-7s7 3.134 7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  );
}

export function UsersIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
      <circle cx="7.5" cy="6.5" r="2.8" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M1 16.5c0-3.038 2.91-5.5 6.5-5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="13.5" cy="6.5" r="2.8" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M19 16.5c0-3.038-2.91-5.5-6.5-5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M7.5 11c1-.4 2-.6 3-.5 1 .1 2 .4 3 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M4 16.5c0-3.038 2.686-5.5 6-5.5s6 2.462 6 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export function CoinIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.6"/>
      <circle cx="10" cy="10" r="4.5" stroke="currentColor" strokeWidth="1.2" opacity="0.5"/>
      <text x="10" y="14" textAnchor="middle" fontSize="8" fontWeight="700" fill="currentColor">$</text>
    </svg>
  );
}

export function SwordsIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
      {/* Sword 1: top-left to bottom-right */}
      <line x1="3" y1="3" x2="17" y2="17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="3" y1="7" x2="7" y2="3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="14" y1="17.5" x2="17" y2="14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      {/* Sword 2: top-right to bottom-left */}
      <line x1="17" y1="3" x2="3" y2="17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="17" y1="7" x2="13" y2="3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="6" y1="17.5" x2="3" y2="14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

export function BookIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
      <path d="M4 3h5.5a2.5 2.5 0 0 1 2.5 2.5V17a2 2 0 0 0-2-2H4V3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M16 3h-5.5A2.5 2.5 0 0 0 8 5.5V17a2 2 0 0 1 2-2h6V3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  );
}

export function TrophyIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
      <path d="M6 2h8v6a4 4 0 0 1-8 0V2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
      <path d="M6 5H3.5A1.5 1.5 0 0 0 2 6.5c0 1.5 1 2.5 2.5 2.5H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M14 5h2.5A1.5 1.5 0 0 1 18 6.5c0 1.5-1 2.5-2.5 2.5H14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="10" y1="12" x2="10" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="7" y1="18" x2="13" y2="18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}

export function BellIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
      <path d="M10 2a6 6 0 0 1 6 6c0 3 1 4 1.5 5h-15C3 12 4 11 4 8a6 6 0 0 1 6-6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
      <path d="M8 15a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export function ChatIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
      <path d="M3 3h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6l-4 3V4a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  );
}

export function GameIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
      {/* Playing card shape */}
      <rect x="4" y="2" width="12" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      {/* Suit in center */}
      <path d="M10 6 L8 9 L12 9 Z" fill="currentColor" opacity="0.7"/>
      <line x1="10" y1="9" x2="10" y2="13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="8" y1="13" x2="12" y2="13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

export function DepositIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="10" y1="7" x2="10" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      <polyline points="7,11 10,14 13,11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function WithdrawIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="10" y1="7" x2="10" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      <polyline points="7,9 10,6 13,9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
