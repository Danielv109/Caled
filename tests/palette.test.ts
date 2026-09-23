import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { accentColors, mergeAccentOverrides, type Accent } from '../src/product/palette';

const accents: Accent[] = ['sage', 'ocean', 'clay'];
const modes = ['light', 'dark'] as const;
const luminance = (hex: string) => {
  const rgb = hex.match(/[a-f\d]{2}/gi)!.map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
const contrast = (foreground: string, background: string) => {
  const one = luminance(foreground), two = luminance(background);
  return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
};

describe('Caled accent accessibility', () => {
  for (const accent of accents) {
    it.each(modes)(`${accent} keeps text at 4.5:1 in %s mode, including hover and selected items`, mode => {
      const { colors: theme } = JSON.parse(readFileSync(new URL(`../themes/caled-${mode}.json`, import.meta.url), 'utf8'));
      const colors = accentColors(accent, mode);
      for (const [foreground, background] of [
        ['button.foreground', 'button.background'], ['button.foreground', 'button.hoverBackground'],
        ['badge.foreground', 'badge.background'], ['list.activeSelectionForeground', 'list.activeSelectionBackground'],
      ]) {
        expect(contrast(colors[foreground], colors[background]), `${foreground}/${background}`).toBeGreaterThanOrEqual(4.5);
      }
      for (const background of ['editor.background', 'sideBar.background', 'panel.background', 'editorWidget.background']) {
        for (const foreground of ['textLink.foreground', 'textLink.activeForeground']) {
          expect(contrast(colors[foreground], theme[background]), `${foreground}/${background}`).toBeGreaterThanOrEqual(4.5);
        }
        expect(contrast(colors.focusBorder, theme[background]), `focusBorder/${background}`).toBeGreaterThanOrEqual(3);
      }
    });
  }

  it.each(modes)('restores the original Caled brand colors when choosing sage in %s mode', mode => {
    const { colors: theme } = JSON.parse(readFileSync(new URL(`../themes/caled-${mode}.json`, import.meta.url), 'utf8'));
    for (const [token, value] of Object.entries(accentColors('sage', mode))) expect(value).toBe(theme[token]);
  });

  it('returns independent palettes and falls back safely for an invalid stored accent', () => {
    const colors = accentColors('ocean', 'dark');
    colors['button.background'] = '#000000';
    expect(accentColors('ocean', 'dark')['button.background']).not.toBe('#000000');
    expect(accentColors('__proto__' as Accent, 'light')).toEqual(accentColors('sage', 'light'));
    expect(new Set(accents.map(accent => accentColors(accent, 'light')['button.background'])).size).toBe(3);
  });
});

describe('Caled accent settings merge', () => {
  it('preserves global colors, other themes and unrelated Caled overrides through repeated changes', () => {
    const existing = {
      'editor.background': '#123456',
      '[A different theme]': { 'button.background': '#654321' },
      '[Caled Light]': { 'terminal.background': '#e0e0e0', 'button.background': '#ff0000' },
      '[Caled Dark]': { 'editor.lineHighlightBackground': '#202020', 'focusBorder': '#000000' },
      '[Caled Light][A different theme]': { 'editor.foreground': '#333333' },
    };
    const snapshot = structuredClone(existing);
    const result = mergeAccentOverrides(mergeAccentOverrides(existing, 'ocean'), 'clay');
    expect(existing).toEqual(snapshot);
    expect(result['editor.background']).toBe('#123456');
    expect(result['[A different theme]']).toEqual(existing['[A different theme]']);
    expect(result['[Caled Light][A different theme]']).toEqual(existing['[Caled Light][A different theme]']);
    expect(result['[Caled Light]']).toEqual({ 'terminal.background': '#e0e0e0', ...accentColors('clay', 'light') });
    expect(result['[Caled Dark]']).toEqual({ 'editor.lineHighlightBackground': '#202020', ...accentColors('clay', 'dark') });
    expect(Object.keys(result).sort()).toEqual(Object.keys(existing).sort());
    (result['[A different theme]'] as Record<string, unknown>)['button.background'] = '#000000';
    expect(existing).toEqual(snapshot);
  });

  it.each([undefined, null, false, 42, 'broken settings', []])('accepts absent or malformed settings: %s', input => {
    const result = mergeAccentOverrides(input, 'ocean');
    expect(result).toEqual({ '[Caled Light]': accentColors('ocean', 'light'), '[Caled Dark]': accentColors('ocean', 'dark') });
  });

  it('replaces malformed theme overrides while retaining settings data elsewhere', () => {
    const existing = { '[Caled Light]': [], '[Caled Dark]': null, custom: [null, true, '#123456'] };
    const result = mergeAccentOverrides(existing, 'sage');
    expect(result.custom).toEqual(existing.custom);
    expect(result.custom).not.toBe(existing.custom);
    expect(result['[Caled Light]']).toEqual(accentColors('sage', 'light'));
    expect(result['[Caled Dark]']).toEqual(accentColors('sage', 'dark'));
  });

  it('drops unsafe keys at every level and neither inherits nor invokes untrusted properties', () => {
    const existing = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"[Caled Light]":{"__proto__":{"polluted":true},"editor.background":"#eeeeee"},"[Other]":{"prototype":{},"safe":"#112233"}}');
    let getterCalled = false;
    Object.defineProperty(existing, 'unexpected', { enumerable: true, get() { getterCalled = true; throw new Error('must not execute'); } });
    Object.setPrototypeOf(existing, { inherited: '#000000' });
    const result = mergeAccentOverrides(existing, 'sage');
    expect(getterCalled).toBe(false);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.hasOwn(result, '__proto__')).toBe(false);
    expect(Object.hasOwn(result, 'constructor')).toBe(false);
    expect(Object.hasOwn(result, 'inherited')).toBe(false);
    expect(Object.hasOwn(result, 'unexpected')).toBe(false);
    expect(Object.hasOwn(result['[Caled Light]'] as object, '__proto__')).toBe(false);
    expect(result['[Other]']).toEqual({ safe: '#112233' });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
