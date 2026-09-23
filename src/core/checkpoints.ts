import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { MAX_FILE_BYTES, validateRelativePath } from '../index/policy';
import type { PreparedFile } from './edits';

export interface CheckpointFile { path: string; before: string; after: string; exists: boolean }
export interface Checkpoint { id: string; summary: string; createdAt: string; root: string; files: CheckpointFile[] }
export interface CheckpointSummary { id: string; summary: string; createdAt: string; files: string[] }
const validId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const rootKey = (root: string) => process.platform === 'win32' ? path.resolve(root).toLowerCase() : path.resolve(root);
const MAX_BYTES = 4 * 1024 * 1024;
export class CheckpointStore {
  private queue = Promise.resolve();
  constructor(private readonly directory: string, private readonly root: string) {}
  async create(summary: string, files: PreparedFile[]): Promise<Checkpoint> {
    const checkpoint: Checkpoint = { id: randomUUID(), summary: summary.slice(0, 2000), createdAt: new Date().toISOString(), root: rootKey(this.root), files: files.map(({ path, before, after, exists }) => ({ path, before, after, exists })) };
    this.validate(checkpoint);
    const data = JSON.stringify(checkpoint);
    const envelope = JSON.stringify({ version: 1, sha256: digest(data), data });
    if (Buffer.byteLength(envelope) > MAX_BYTES) throw new Error('El punto de recuperación supera 4 MiB. Reduce el número de cambios.');
    const task = this.queue.then(async () => {
      await mkdir(this.directory, { recursive: true });
      const temp = path.join(this.directory, `${checkpoint.id}.tmp`);
      await writeFile(temp, envelope, { flag: 'wx', mode: 0o600 });
      await rename(temp, path.join(this.directory, `${checkpoint.id}.json`));
      await this.prune();
    });
    this.queue = task.catch(() => undefined);
    await task;
    return checkpoint;
  }
  async load(id: string): Promise<Checkpoint> {
    if (!validId(id)) throw new Error('Identificador de recuperación no válido.');
    const filename = path.join(this.directory, `${id}.json`);
    const info = await lstat(filename);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) throw new Error('Punto de recuperación no válido.');
    const serialized = await readFile(filename, 'utf8');
    if (Buffer.byteLength(serialized) > MAX_BYTES) throw new Error('Punto de recuperación demasiado grande.');
    const envelope = JSON.parse(serialized) as { version: number; data: string; sha256: string };
    if (envelope.version !== 1 || typeof envelope.data !== 'string' || digest(envelope.data) !== envelope.sha256) throw new Error('El punto de recuperación está dañado.');
    const checkpoint = JSON.parse(envelope.data) as Checkpoint;
    this.validate(checkpoint);
    if (checkpoint.id !== id) throw new Error('Identificador de recuperación inconsistente.');
    return checkpoint;
  }
  async list(): Promise<CheckpointSummary[]> {
    const names = await readdir(this.directory).catch(error => { if (error.code === 'ENOENT') return [] as string[]; throw error; });
    const rows: CheckpointSummary[] = [];
    for (const name of names.filter(name => name.endsWith('.json') && validId(name.slice(0, -5))).slice(0, 200)) {
      try { const checkpoint = await this.load(name.slice(0, -5)); rows.push({ id: checkpoint.id, summary: checkpoint.summary, createdAt: checkpoint.createdAt, files: checkpoint.files.map(file => file.path) }); }
      catch { /* A damaged record is never restored and must not hide valid records. */ }
    }
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
  }
  async remove(id: string): Promise<void> {
    if (!validId(id)) throw new Error('Identificador no válido.');
    await unlink(path.join(this.directory, `${id}.json`)).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
  private validate(checkpoint: Checkpoint): void {
    if (!checkpoint || !validId(checkpoint.id) || checkpoint.root !== rootKey(this.root) || typeof checkpoint.summary !== 'string' || checkpoint.summary.length > 2000 || typeof checkpoint.createdAt !== 'string' || !Number.isFinite(Date.parse(checkpoint.createdAt)) || !Array.isArray(checkpoint.files) || checkpoint.files.length < 1 || checkpoint.files.length > 12) throw new Error('Punto de recuperación ajeno o no válido.');
    const paths = new Set<string>();
    for (const file of checkpoint.files) {
      const relative = validateRelativePath(file.path);
      if (paths.has(relative.toLowerCase())) throw new Error('Archivo duplicado en el punto de recuperación.');
      paths.add(relative.toLowerCase());
      if (typeof file.exists !== 'boolean' || typeof file.before !== 'string' || typeof file.after !== 'string' || (!file.exists && file.before !== '') || [file.before, file.after].some(text => text.includes('\0') || Buffer.byteLength(text) > MAX_FILE_BYTES)) throw new Error('Contenido de recuperación no válido.');
    }
  }
  private async prune(): Promise<void> {
    const names = await readdir(this.directory);
    const rows: { name: string; time: number; size: number }[] = [];
    for (const name of names) {
      if (!name.endsWith('.json') || !validId(name.slice(0, -5))) continue;
      const info = await lstat(path.join(this.directory, name));
      if (info.isFile() && !info.isSymbolicLink()) rows.push({ name, time: info.mtimeMs, size: info.size });
    }
    rows.sort((a, b) => b.time - a.time);
    let total = 0;
    for (const [i, row] of rows.entries()) {
      total += row.size;
      if (i >= 20 || total > 20 * 1024 * 1024) await unlink(path.join(this.directory, row.name));
    }
  }
}
