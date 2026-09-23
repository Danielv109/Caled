import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, readFile, rename, stat, rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contained, root } from './desktop.mjs';

export async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function loadOllamaLock(workspace = root) {
  const lock = JSON.parse(await readFile(path.join(workspace, 'product/ollama.lock.json'), 'utf8'));
  if (!/^v\d+\.\d+\.\d+$/.test(lock.version) || !/^[a-f0-9]{64}$/.test(lock.sha256)
    || !Number.isSafeInteger(lock.size) || lock.size < 1
    || lock.url !== `https://github.com/ollama/ollama/releases/download/${lock.version}/ollama-windows-amd64.zip`) {
    throw new Error('Invalid Ollama lock. Only pinned official Windows x64 releases are supported.');
  }
  return lock;
}

export function archivePath(lock, workspace = root) {
  return path.join(workspace, '.cache', `ollama-${lock.version}-windows-amd64.zip`);
}

export async function verifyArchive(archive, lock) {
  if ((await stat(archive)).size !== lock.size || await digest(archive) !== lock.sha256) {
    throw new Error('Ollama archive failed integrity verification. It was not extracted.');
  }
}

/** Importing this module never downloads anything. */
export async function downloadOllama(workspace = root) {
  const lock = await loadOllamaLock(workspace);
  const archive = await contained(archivePath(lock, workspace), workspace);
  await mkdir(path.dirname(archive), { recursive: true });
  if (await access(archive).then(() => true, () => false)) {
    await verifyArchive(archive, lock);
    console.log('Cached Ollama archive verified.');
    return archive;
  }
  const response = await fetch(lock.url, { signal: AbortSignal.timeout(600_000) });
  if (!response.ok || !response.body) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error(`Ollama download failed: HTTP ${response.status}`);
  }
  const partial = await contained(`${archive}.partial-${process.pid}-${Date.now()}`, workspace);
  try {
    console.log(`Downloading Ollama ${lock.version} (${Math.round(lock.size / 1e6)} MB); verifying before extraction.`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(partial, { flags: 'wx' }));
    await verifyArchive(partial, lock);
    await rename(partial, archive);
  } catch (error) {
    await rm(partial, { force: true }).catch(() => undefined);
    throw error;
  }
  return archive;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await downloadOllama();
