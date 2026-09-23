import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { MAX_FILE_BYTES } from '../index/policy';

/** The caller must first resolve the path with safeWorkspacePath. */
export async function readBoundedFile(absolute: string): Promise<string> {
  const before = await lstat(absolute);
  if (before.isSymbolicLink() || !before.isFile() || before.size > MAX_FILE_BYTES) throw new Error('Archivo no regular, enlace o demasiado grande.');
  const handle = await open(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size > MAX_FILE_BYTES || before.ino !== opened.ino || (process.platform !== 'win32' && before.dev !== opened.dev)) throw new Error('El archivo cambió durante la lectura.');
    const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(buffer, size, buffer.length - size, size);
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > MAX_FILE_BYTES) throw new Error('Archivo demasiado grande.');
    const content = buffer.subarray(0, size).toString('utf8');
    const after = await handle.stat();
    if (opened.size !== after.size || opened.mtimeMs !== after.mtimeMs || opened.ctimeMs !== after.ctimeMs) throw new Error('El archivo cambió durante la lectura.');
    if (content.includes('\0') || content.includes('\uFFFD')) throw new Error('El archivo no es texto UTF-8 válido.');
    return content;
  } finally { await handle.close(); }
}
