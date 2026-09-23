import os from 'node:os';
import { readFile, access, statfs } from 'node:fs/promises';
import path from 'node:path';
import { root } from './desktop.mjs';
import { localStatus, verifyRuntime } from './local-ai.mjs';
const result = { node: process.version, platform: `${process.platform}-${process.arch}`, ramGiB: +(os.totalmem() / 1024 ** 3).toFixed(1), freeMemoryGiB: +(os.freemem() / 1024 ** 3).toFixed(1) };
const storage = await statfs(root); result.freeDiskGiB = +(storage.bavail * storage.bsize / 1024 ** 3).toFixed(1);
result.desktop = await access(path.join(root, '.runtime/Caled/Caled.cmd')).then(() => 'prepared', () => 'missing');
result.source = await access(path.join(root, '.upstream/vscode/package.json')).then(() => 'prepared', () => 'missing');
try {
  result.ollama = await localStatus();
} catch { result.ollama = { status: 'unavailable or invalid response', next: 'npm run ai:status' }; }
try { const runtime = await verifyRuntime(); result.ollamaRuntime = { status: 'verified', version: runtime.version, files: runtime.files.length }; }
catch (error) { result.ollamaRuntime = { status: 'not verified', note: error.message, next: 'npm run ai:prepare' }; }
try { const pinned = JSON.parse(await readFile(path.join(root, 'product/upstream.lock.json'), 'utf8')); result.upstream = pinned.release; } catch {}
console.log(JSON.stringify(result, null, 2));
