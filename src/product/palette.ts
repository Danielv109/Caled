export type Accent = 'sage' | 'ocean' | 'clay';

type Mode = 'light' | 'dark';
type AccentPalette = {
  button: string;
  buttonText: string;
  buttonHover: string;
  focus: string;
  link: string;
  linkActive: string;
  progress: string;
  selection: string;
  selectionText: string;
  badge: string;
  badgeText: string;
};

const palettes: Record<Accent, Record<Mode, AccentPalette>> = {
  sage: {
    light: {
      button: '#286c52', buttonText: '#ffffff', buttonHover: '#1b563f', focus: '#286c52',
      link: '#216646', linkActive: '#174c32', progress: '#3e8053',
      selection: '#c7dfc8', selectionText: '#1e4a2b', badge: '#d0e4d0', badgeText: '#295739',
    },
    dark: {
      button: '#9bd5b8', buttonText: '#142c20', buttonHover: '#b4e4c6', focus: '#88c7a9',
      link: '#9bd5b8', linkActive: '#c4ecd5', progress: '#92cca9',
      selection: '#355340', selectionText: '#f0f4ed', badge: '#355540', badgeText: '#deefdf',
    },
  },
  ocean: {
    light: {
      button: '#245c78', buttonText: '#ffffff', buttonHover: '#194963', focus: '#2e6984',
      link: '#255e7a', linkActive: '#194760', progress: '#356d89',
      selection: '#d4e5ec', selectionText: '#173f52', badge: '#dce9ef', badgeText: '#264e62',
    },
    dark: {
      button: '#9bc4d8', buttonText: '#142a35', buttonHover: '#b9d8e6', focus: '#8dbcd3',
      link: '#aacfe0', linkActive: '#cce5ef', progress: '#91bdd2',
      selection: '#2d4656', selectionText: '#f0f3f5', badge: '#304d5e', badgeText: '#dcecf4',
    },
  },
  clay: {
    light: {
      button: '#884b32', buttonText: '#ffffff', buttonHover: '#6f3a26', focus: '#92573d',
      link: '#854932', linkActive: '#683723', progress: '#9a5d40',
      selection: '#f0ded1', selectionText: '#623d2d', badge: '#efddcc', badgeText: '#65402c',
    },
    dark: {
      button: '#dfb397', buttonText: '#322216', buttonHover: '#eec7ae', focus: '#d4a082',
      link: '#e6baa0', linkActive: '#f1d5c2', progress: '#d5a384',
      selection: '#573f30', selectionText: '#f5eee7', badge: '#5e4533', badgeText: '#f3e4d7',
    },
  },
};

/** Accent ownership is deliberately limited: backgrounds, syntax and other themes stay untouched. */
export function accentColors(accent: Accent, mode: Mode): Record<string, string> {
  const selected = accent === 'ocean' || accent === 'clay' ? accent : 'sage';
  const palette = palettes[selected][mode === 'light' ? 'light' : 'dark'];
  return {
    'button.background': palette.button,
    'button.foreground': palette.buttonText,
    'button.hoverBackground': palette.buttonHover,
    'badge.background': palette.badge,
    'badge.foreground': palette.badgeText,
    focusBorder: palette.focus,
    'textLink.foreground': palette.link,
    'textLink.activeForeground': palette.linkActive,
    'progressBar.background': palette.progress,
    'list.activeSelectionBackground': palette.selection,
    'list.activeSelectionForeground': palette.selectionText,
  };
}

const unsafeKeys = new Set(['__proto__', 'constructor', 'prototype']);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Copy setting data without invoking accessors, retaining prototypes or sharing mutable values. */
function copySetting(value: unknown, seen = new WeakMap<object, unknown>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  const result = Array.isArray(value) ? [] : {};
  seen.set(value, result);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (unsafeKeys.has(key) || !descriptor.enumerable || !('value' in descriptor)) continue;
    Object.defineProperty(result, key, {
      value: copySetting(descriptor.value, seen), enumerable: true, writable: true, configurable: true,
    });
  }
  return result;
}

/** Merge only Caled's accent tokens into workbench.colorCustomizations. */
export function mergeAccentOverrides(existing: unknown, accent: Accent): Record<string, unknown> {
  const result = isRecord(existing) ? copySetting(existing) as Record<string, unknown> : {};
  for (const mode of ['light', 'dark'] as const) {
    const key = mode === 'light' ? '[Caled Light]' : '[Caled Dark]';
    const current = result[key];
    result[key] = { ...(isRecord(current) ? current : {}), ...accentColors(accent, mode) };
  }
  return result;
}
