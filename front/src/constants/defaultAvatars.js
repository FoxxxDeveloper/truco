/**
 * Preset avatars stored in DB as default:{key} (must match back/src/routes/profile.js).
 */
import { Cat, Swords, Wine, Coins, Club, Sparkles } from 'lucide-react';

export const DEFAULT_AVATAR_OPTIONS = [
  { key: 'fox', label: 'Zorro', Icon: Cat, hue: 28 },
  { key: 'sword', label: 'Espada', Icon: Swords, hue: 210 },
  { key: 'cup', label: 'Copa', Icon: Wine, hue: 330 },
  { key: 'oro', label: 'Oro', Icon: Coins, hue: 48 },
  { key: 'bastos', label: 'Bastos', Icon: Club, hue: 136 },
  { key: 'trucofx', label: 'TrucoFX', Icon: Sparkles, hue: 43 },
];

export const DEFAULT_AVATAR_KEYS = new Set(DEFAULT_AVATAR_OPTIONS.map((o) => o.key));
