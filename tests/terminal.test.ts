import { mkdtemp, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runApprovedCommand } from '../src/agent/terminal';

const command = (windows: string, posix: string) => process.platform === 'win32' ? windows : posix;

describe('approved terminal command', () => {
  it('uses the exact working directory and returns stdout plus the exit code', async () => {
    const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'caled-terminal-')));
    const result = await runApprovedCommand(
      command("Write-Output ((Get-Location).Path); exit 7", 'pwd; exit 7'),
      directory,
      new AbortController().signal,
      10_000,
    );
    expect(result.exitCode).toBe(7);
    expect(path.resolve(result.output.trim())).toBe(path.resolve(directory));
    expect(result.timedOut).toBe(false);
    expect(result.cancelled).toBe(false);
  });

  it('terminates a running process tree when the request is cancelled', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'caled-terminal-cancel-'));
    const controller = new AbortController();
    const pending = runApprovedCommand(
      command('Start-Sleep -Seconds 20', 'sleep 20'),
      directory,
      controller.signal,
      30_000,
    );
    setTimeout(() => controller.abort(), 250);
    const result = await pending;
    expect(result.cancelled).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(result.durationMs).toBeLessThan(10_000);
  });

  it('rejects empty and oversized commands before starting a shell', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'caled-terminal-invalid-'));
    await expect(runApprovedCommand('   ', directory, new AbortController().signal)).rejects.toThrow(/válido/);
    await expect(runApprovedCommand('x'.repeat(4001), directory, new AbortController().signal)).rejects.toThrow(/válido/);
  });
});
