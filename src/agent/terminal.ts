import { spawn } from 'node:child_process';
import { realpath } from 'node:fs/promises';

export interface TerminalResult { exitCode: number | null; output: string; timedOut: boolean; cancelled: boolean; truncated: boolean; durationMs: number }
/** Call only AFTER the exact command and cwd have been approved by the user. This is not a sandbox. */
export async function runApprovedCommand(command: string, cwd: string, signal: AbortSignal, timeoutMs = 60000): Promise<TerminalResult> {
  if (!command.trim() || command.length > 4000 || command.includes('\0')) throw new Error('Comando no válido.');
  signal.throwIfAborted();
  const directory = await realpath(cwd);
  const timeout = Math.min(120000, Math.max(1000, timeoutMs));
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const windows = process.platform === 'win32';
    const child = spawn(windows ? 'powershell.exe' : '/bin/sh', windows ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command] : ['-c', command], { cwd: directory, windowsHide: true, detached: !windows, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', timedOut = false, cancelled = false, truncated = false, settled = false, stopping = false;
    const stop = () => {
      if (settled || stopping) return; stopping = true;
      if (windows && child.pid) { const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); killer.on('error', () => child.kill()); }
      else if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
    };
    const onAbort = () => { cancelled = true; stop(); };
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeout);
    const collect = (chunk: string) => {
      if (output.length >= 24000) return;
      if (output.length + chunk.length > 24000) { truncated = true; output += chunk.slice(0, 24000 - output.length); stop(); }
      else output += chunk;
    };
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    const cleanup = () => { settled = true; clearTimeout(timer); signal.removeEventListener('abort', onAbort); };
    child.once('error', error => { cleanup(); reject(error); });
    child.once('close', exitCode => { if (settled) return; cleanup(); resolve({ exitCode, output, timedOut, cancelled, truncated, durationMs: Date.now() - started }); });
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}
