import { afterAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = path.resolve('.');
const temporaryRoot = path.join(root, '.cache', 'launcher-tests');
const fixtures: string[] = [];
const psLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;
const powershell = (source: string) => exec('powershell.exe', [
  '-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(source, 'utf16le').toString('base64'),
], { windowsHide: true, timeout: 15000 });
async function fixture() {
  await mkdir(temporaryRoot, { recursive: true });
  const directory = await mkdtemp(path.join(temporaryRoot, 'shortcut espa\u00f1ol & (test) '));
  fixtures.push(directory);
  return directory;
}

afterAll(async () => {
  for (const directory of fixtures) {
    if (!path.resolve(directory).startsWith(temporaryRoot + path.sep)) throw new Error('Unsafe launcher fixture cleanup');
    await rm(directory, { recursive: true, force: true });
  }
});

describe('desktop identity and accessibility', () => {
  const luminance = (hex: string) => {
    const rgb = hex.match(/[a-f\d]{2}/gi)!.map(value => parseInt(value, 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const contrast = (a: string, b: string) => {
    const one = luminance(a), two = luminance(b);
    return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
  };
  it.each(['dark', 'light'])('keeps main readable text and button labels at 4.5:1 contrast in %s mode', async mode => {
    const { colors } = JSON.parse(await readFile(path.join(root, 'themes', `caled-${mode}.json`), 'utf8'));
    for (const [foreground, background] of [
      ['editor.foreground', 'editor.background'], ['descriptionForeground', 'editor.background'],
      ['button.foreground', 'button.background'], ['button.secondaryForeground', 'button.secondaryBackground'],
      ['input.foreground', 'input.background'], ['input.placeholderForeground', 'input.background'],
      ['statusBar.foreground', 'statusBar.background'], ['sideBar.foreground', 'sideBar.background'],
      ['textLink.foreground', 'editor.background'],
    ]) {
      expect(contrast(colors[foreground], colors[background]), `${mode} ${foreground}/${background}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('ships a complete ICO with seven embedded PNG sizes, including high DPI', async () => {
    const ico = await readFile(path.join(root, 'media', 'caled.ico'));
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(7);
    const sizes: number[] = [];
    for (let entry = 0; entry < 7; entry++) {
      const start = 6 + entry * 16;
      const size = ico.readUInt32LE(start + 8), offset = ico.readUInt32LE(start + 12);
      sizes.push(ico[start] || 256);
      expect(offset + size).toBeLessThanOrEqual(ico.length);
      expect(ico.subarray(offset, offset + 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(ico.readUInt32BE(offset + 16)).toBe(ico[start] || 256);
    }
    expect(sizes).toEqual([16, 24, 32, 48, 64, 128, 256]);
  });
});

describe.skipIf(process.platform !== 'win32')('native Windows app shortcut', () => {
  it('creates and reloads a real Unicode shortcut with the hidden launcher, icon and no global Node', async () => {
    const directory = await fixture();
    const script = path.join(root, 'scripts', 'desktop-shortcuts.ps1');
    const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Destination', directory];
    await exec('powershell.exe', args, { windowsHide: true, timeout: 15000 });
    await exec('powershell.exe', [...args, '-VerifyOnly'], { windowsHide: true, timeout: 15000 });
    const shortcutFile = path.join(directory, 'Caled.lnk');
    const { stdout } = await powershell(`$ErrorActionPreference='Stop'; $s=(New-Object -ComObject WScript.Shell).CreateShortcut(${psLiteral(shortcutFile)}); @{ target=$s.TargetPath; arguments=$s.Arguments; icon=$s.IconLocation } | ConvertTo-Json -Compress`);
    const shortcut = JSON.parse(stdout);
    expect(shortcut.target.toLowerCase()).toContain('powershell.exe');
    expect(shortcut.arguments).toContain('-WindowStyle Hidden');
    expect(shortcut.arguments).toContain(path.join(root, 'scripts', 'launch-desktop.ps1'));
    expect(shortcut.icon).toBe(path.join(root, 'media', 'caled.ico') + ',0');
    expect(shortcut.arguments).not.toContain('node.exe');
  }, 30000);
  it('preserves a shortcut owned by another installation', async () => {
    const directory = await fixture(), shortcutFile = path.join(directory, 'Caled.lnk');
    await powershell(`$s=(New-Object -ComObject WScript.Shell).CreateShortcut(${psLiteral(shortcutFile)}); $s.TargetPath=Join-Path $env:WINDIR 'notepad.exe'; $s.Description='preserve this shortcut'; $s.Save()`);
    const before = await readFile(shortcutFile);
    await expect(exec('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
      path.join(root, 'scripts', 'desktop-shortcuts.ps1'), '-Destination', directory], { windowsHide: true, timeout: 15000 })).rejects.toThrow('different shortcut');
    expect(await readFile(shortcutFile)).toEqual(before);
  }, 30000);
});
