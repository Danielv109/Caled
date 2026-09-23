import * as vscode from 'vscode';
import type { AppLanguage } from '../agent/profiles';
import { validatePersonalization, type Personalization } from './studio';
import { mergeAccentOverrides } from './palette';

export type Appearance = 'system' | 'light' | 'dark';
export function personalization(): Personalization {
  try { return validatePersonalization(vscode.workspace.getConfiguration('caled').get('studio.personalization', { displayName: '', experience: 'guided', accent: 'sage' })); }
  catch { return { displayName: '', experience: 'guided', accent: 'sage' }; }
}
let accentUpdate = Promise.resolve();
export function applyAccent(): Promise<void> {
  accentUpdate = accentUpdate.catch(() => undefined).then(async () => {
    const config = vscode.workspace.getConfiguration('workbench');
    const existing = config.inspect<Record<string, unknown>>('colorCustomizations')?.globalValue;
    const next = mergeAccentOverrides(existing, personalization().accent);
    if (JSON.stringify(existing) !== JSON.stringify(next)) await config.update('colorCustomizations', next, vscode.ConfigurationTarget.Global);
  });
  return accentUpdate;
}
export function appLanguage(): AppLanguage {
  const selected = vscode.workspace.getConfiguration('caled').get<string>('language', 'es');
  if (selected === 'en' || selected === 'es') return selected;
  return vscode.env.language.toLowerCase().startsWith('es') ? 'es' : 'en';
}
let appearanceUpdate = Promise.resolve();
export function applyAppearance(): Promise<void> {
  appearanceUpdate = appearanceUpdate.catch(() => undefined).then(updateAppearance);
  return appearanceUpdate;
}
async function updateAppearance(): Promise<void> {
  const mode = vscode.workspace.getConfiguration('caled').get<Appearance>('appearance', 'system');
  if (!['system', 'light', 'dark'].includes(mode)) throw new Error('Unsupported appearance setting.');
  const config = vscode.workspace.getConfiguration('workbench');
  const target = vscode.ConfigurationTarget.Global;
  await config.update('preferredDarkColorTheme', 'Caled Dark', target);
  await config.update('preferredLightColorTheme', 'Caled Light', target);
  await config.update('colorTheme', mode === 'light' ? 'Caled Light' : mode === 'dark' ? 'Caled Dark' : vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light ? 'Caled Light' : 'Caled Dark', target);
  await vscode.workspace.getConfiguration('window').update('autoDetectColorScheme', mode === 'system', target);
  await applyAccent();
}

export async function showPreferences(): Promise<void> {
  const en = appLanguage() === 'en';
  const selection = await vscode.window.showQuickPick([
    { label: en ? 'Appearance' : 'Apariencia', description: en ? 'Light, dark or match your system' : 'Claro, oscuro o como tu sistema', id: 'appearance' },
    { label: en ? 'Language' : 'Idioma', description: 'Español / English', id: 'language' },
  ], { title: en ? 'Make Caled yours' : 'Caled a tu manera' });
  if (!selection) return;
  if (selection.id === 'language') {
    const language = await vscode.window.showQuickPick([
      { label: 'Español', id: 'es' }, { label: 'English', id: 'en' },
      { label: en ? 'Match the editor language' : 'Usar idioma del editor', id: 'system' },
    ], { title: en ? 'Caled language' : 'Idioma de Caled' });
    if (language) {
      await vscode.workspace.getConfiguration('caled').update('language', language.id, vscode.ConfigurationTarget.Global);
      void vscode.window.showInformationMessage(language.id === 'en' ? 'Caled now uses English. Reopen Caled to update the native editor menus.' : 'El idioma de Caled ya cambió. Vuelve a abrir Caled para actualizar los menús del editor.');
    }
  } else {
    const appearance = await vscode.window.showQuickPick([
      { label: en ? 'System' : 'Sistema', id: 'system' },
      { label: en ? 'Light · Paper' : 'Claro · Papel', id: 'light' },
      { label: en ? 'Dark · Graphite' : 'Oscuro · Grafito', id: 'dark' },
    ], { title: en ? 'Editor appearance' : 'Apariencia del editor' });
    if (appearance) {
      await vscode.workspace.getConfiguration('caled').update('appearance', appearance.id, vscode.ConfigurationTarget.Global);
      await applyAppearance();
    }
  }
}
