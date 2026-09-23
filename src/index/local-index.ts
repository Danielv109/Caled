import path from 'node:path';
import { lstat, mkdir, open, readdir, realpath } from 'node:fs/promises';
import { constants, type Stats } from 'node:fs';
import { createHash } from 'node:crypto';
import ignore from 'ignore';
import type { DatabaseSync } from 'node:sqlite';
import { BASE_IGNORES, MAX_FILE_BYTES, normalizePath, readIgnore, ignoredByLayers, type IgnoreLayer } from './policy';
import { readBoundedText } from '../core/sse';

export interface Snippet { path: string; startLine: number; endLine: number; text: string; score: number }
interface Chunk extends Snippet { terms: Map<string, number>; hash: string; length: number }
export interface IndexStats { files: number; chunks: number; bytes: number; truncated: boolean; storage: 'sqlite' | 'memory'; elapsedMs: number; readFiles: number; reusedFiles: number }
export interface IndexOptions { root: string; maxFiles?: number; storagePath?: string; semantic?: boolean; embeddingModel?: string }
interface CachedFile { fingerprint: string; bytes: number; hash: string; chunks: Chunk[] }
const MAX_INDEX_BYTES = 24 * 1024 * 1024;
const MAX_CHUNKS = 12000;
const MAX_ENTRIES = 50000;
const CACHE_VERSION = '2';
const SKIPPABLE_ERRORS = new Set(['ENOENT', 'EACCES', 'EPERM', 'ELOOP', 'EISDIR', 'ENOTDIR']);
// Windows reports dev differently for lstat and FileHandle.stat; ino + canonical path
// identify the file while ctime detects replacements that preserve mtime and size.
const fingerprint = (info: Stats) => [info.size, info.mtimeMs, info.ctimeMs, info.ino].join(':');
const sha256 = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
function makeChunk(relative: string, startLine: number, endLine: number, text: string): Chunk {
  const counts = new Map<string, number>();
  for (const word of terms(`${relative} ${text}`)) counts.set(word, (counts.get(word) ?? 0) + 1);
  return { path: relative, startLine, endLine, text, score: 0, terms: counts, length: [...counts.values()].reduce((sum, count) => sum + count, 0), hash: sha256(text) };
}
export function terms(value: string): string[] {
  return (value.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) ?? []).slice(0, 40000);
}
export class LocalIndex {
  private chunks: Chunk[] = [];
  private frequencies = new Map<string, number>();
  private db?: DatabaseSync;
  private dbPath?: string;
  private scanQueue: Promise<void> = Promise.resolve();
  private revision = 0;
  private closed = false;
  private options?: IndexOptions;
  private cacheRoot?: string;
  private cache = new Map<string, CachedFile>();
  async scan(options: IndexOptions, signal?: AbortSignal): Promise<IndexStats> {
    const task = this.scanQueue.then(() => this.performScan(options, signal));
    this.scanQueue = task.then(() => undefined, () => undefined);
    return task;
  }
  private check(signal?: AbortSignal): void {
    signal?.throwIfAborted();
    if (this.closed) throw new Error('El índice está cerrado.');
  }
  private async performScan(options: IndexOptions, signal?: AbortSignal): Promise<IndexStats> {
    this.check(signal);
    const started = Date.now();
    const root = await realpath(options.root);
    await this.openDatabase(options.storagePath);
    this.check(signal);
    const previous = this.cacheRoot === root ? this.cache : this.restoreCache(root);
    const next = new Map<string, CachedFile>();
    const chunks: Chunk[] = [];
    let files = 0, bytes = 0, entriesSeen = 0, truncated = false, readFiles = 0, reusedFiles = 0;
    const maxFiles = Number.isFinite(options.maxFiles) ? Math.min(Math.max(Math.floor(options.maxFiles!), 10), 10000) : 2500;
    const base = ignore().add(BASE_IGNORES);
    const walk = async (directory: string, ancestors: IgnoreLayer[]): Promise<void> => {
      this.check(signal);
      // Dirents are advisory: reject a directory replaced by a junction while walking.
      if ((await lstat(directory)).isSymbolicLink() || await realpath(directory) !== directory) return;
      const layers = [...ancestors, { root: directory, ignore: await readIgnore(directory) }];
      const entries = await readdir(directory, { withFileTypes: true });
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        this.check(signal);
        if (files >= maxFiles || bytes >= MAX_INDEX_BYTES || chunks.length >= MAX_CHUNKS || entriesSeen >= MAX_ENTRIES) { truncated = true; return; }
        entriesSeen++;
        if (entry.isSymbolicLink()) continue;
        const absolute = path.join(directory, entry.name);
        const relative = normalizePath(path.relative(root, absolute));
        const tail = entry.isDirectory() ? '/' : '';
        if (base.ignores(relative + tail) || ignoredByLayers(absolute, entry.isDirectory(), layers)) continue;
        if (entry.isDirectory()) {
          try { await walk(absolute, layers); }
          catch (error) { if (!SKIPPABLE_ERRORS.has((error as NodeJS.ErrnoException).code ?? '')) throw error; }
          continue;
        }
        if (!entry.isFile()) continue;
        try {
          const info = await lstat(absolute);
          if (!info.isFile() || !info.size || info.size > MAX_FILE_BYTES || await realpath(absolute) !== absolute) continue;
          const mark = fingerprint(info);
          const old = previous.get(relative);
          let file: CachedFile;
          if (old?.fingerprint === mark && old.bytes === info.size) { file = old; reusedFiles++; }
          else {
            const handle = await open(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
            let buffer: Buffer;
            try {
              if (fingerprint(await handle.stat()) !== mark) continue;
              // Fixed-size reads bound allocation even if another process grows the file.
              const limited = Buffer.alloc(MAX_FILE_BYTES + 1);
              let size = 0;
              readFiles++;
              while (size < limited.length) {
                this.check(signal);
                const read = await handle.read(limited, size, limited.length - size, size);
                if (!read.bytesRead) break;
                size += read.bytesRead;
              }
              if (fingerprint(await handle.stat()) !== mark || fingerprint(await lstat(absolute)) !== mark || await realpath(absolute) !== absolute) continue;
              buffer = limited.subarray(0, size);
            } finally { await handle.close(); }
            if (buffer.length !== info.size || buffer.includes(0) || buffer.length > MAX_FILE_BYTES) continue;
            const content = buffer.toString('utf8');
            if (content.includes('\uFFFD')) continue;
            const hash = sha256(buffer);
            let fileChunks: Chunk[];
            if (old?.hash === hash) fileChunks = old.chunks;
            else {
              fileChunks = [];
              const lines = content.split('\n');
              for (let start = 0; start < lines.length; start += 64) {
                const text = lines.slice(start, start + 80).join('\n');
                if (text.trim()) fileChunks.push(makeChunk(relative, start + 1, Math.min(start + 80, lines.length), text));
              }
            }
            file = { fingerprint: mark, bytes: buffer.length, hash, chunks: fileChunks };
          }
          if (bytes + file.bytes > MAX_INDEX_BYTES) { truncated = true; return; }
          bytes += file.bytes; files++;
          const remaining = MAX_CHUNKS - chunks.length;
          chunks.push(...file.chunks.slice(0, remaining));
          if (file.chunks.length > remaining) { truncated = true; return; }
          next.set(relative, file);
        } catch (error) { if (!SKIPPABLE_ERRORS.has((error as NodeJS.ErrnoException).code ?? '')) throw error; }
      }
    };
    await walk(root, []);
    this.check(signal);
    this.persistCache(root, next);
    this.options = { ...options, root };
    this.chunks = chunks;
    this.cacheRoot = root;
    this.cache = next;
    this.frequencies.clear();
    for (const chunk of chunks) for (const term of chunk.terms.keys()) this.frequencies.set(term, (this.frequencies.get(term) ?? 0) + 1);
    this.revision++;
    return { files, chunks: chunks.length, bytes, truncated, storage: this.db ? 'sqlite' : 'memory', elapsedMs: Date.now() - started, readFiles, reusedFiles };
  }
  private closeDatabase(): void { try { this.db?.close(); } catch {} this.db = undefined; this.dbPath = undefined; }
  private async openDatabase(storagePath?: string): Promise<void> {
    const databasePath = storagePath ? path.resolve(storagePath, 'context.sqlite') : undefined;
    if (databasePath === this.dbPath) return;
    this.closeDatabase();
    if (!databasePath) return;
    try {
      await mkdir(path.dirname(databasePath), { recursive: true });
      const { DatabaseSync: Database } = await import('node:sqlite');
      this.check();
      this.db = new Database(databasePath);
      this.dbPath = databasePath;
      this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS chunks(path TEXT, start INTEGER, end INTEGER, text TEXT, hash TEXT); CREATE INDEX IF NOT EXISTS chunks_path ON chunks(path); CREATE TABLE IF NOT EXISTS vectors(hash TEXT, model TEXT, vector TEXT, PRIMARY KEY(hash, model)); CREATE TABLE IF NOT EXISTS index_meta(key TEXT PRIMARY KEY, value TEXT); CREATE TABLE IF NOT EXISTS cached_files(path TEXT PRIMARY KEY, fingerprint TEXT, bytes INTEGER, hash TEXT, chunks TEXT);');
    } catch { this.closeDatabase(); }
  }
  private cacheMatches(root: string): boolean {
    return this.db?.prepare('SELECT value FROM index_meta WHERE key = ?').get('root')?.value === root && this.db?.prepare('SELECT value FROM index_meta WHERE key = ?').get('version')?.value === CACHE_VERSION;
  }
  private restoreCache(root: string): Map<string, CachedFile> {
    const restored = new Map<string, CachedFile>();
    if (!this.db) return restored;
    let totalBytes = 0, totalChunks = 0;
    try {
      if (!this.cacheMatches(root)) return restored;
      // Bound each serialized row and the aggregate before reconstructing term maps.
      // Page rows: Node 22 SQLite iterators can lose their Statement to GC during
      // expensive chunk reconstruction. all() over the whole DB would be unbounded.
      const select = this.db.prepare('SELECT path, fingerprint, bytes, hash, chunks FROM cached_files WHERE path > ? AND length(path) <= 4096 AND bytes > 0 AND bytes <= ? AND length(chunks) <= ? ORDER BY path LIMIT 32');
      let lastPath = '';
      for (let visited = 0; visited < 10000; visited += 32) {
        const rows = select.all(lastPath, MAX_FILE_BYTES, MAX_FILE_BYTES * 8);
        if (!rows.length) break;
        lastPath = String(rows[rows.length - 1].path);
        for (const row of rows) {
          const relative = String(row.path), fileBytes = Number(row.bytes);
          if (!relative || relative.length > 4096 || path.isAbsolute(relative) || relative.split(/[\\/]/).some(part => !part || part === '.' || part === '..') || !Number.isSafeInteger(fileBytes) || totalBytes + fileBytes > MAX_INDEX_BYTES || typeof row.hash !== 'string' || !/^[a-f0-9]{64}$/.test(row.hash) || typeof row.fingerprint !== 'string' || row.fingerprint.length > 256) continue;
          const values: unknown = JSON.parse(String(row.chunks));
          if (!Array.isArray(values) || totalChunks + values.length > MAX_CHUNKS) continue;
          const chunks: Chunk[] = [];
          let characters = 0;
          for (const value of values) {
            if (!value || typeof value.text !== 'string' || !Number.isSafeInteger(value.startLine) || !Number.isSafeInteger(value.endLine) || value.startLine < 1 || (value.startLine - 1) % 64 !== 0 || value.endLine > fileBytes + 1 || value.endLine < value.startLine || value.endLine - value.startLine >= 80 || value.text.split('\n').length !== value.endLine - value.startLine + 1 || value.text.includes('\0') || sha256(value.text) !== value.hash) throw new Error('Caché inválida.');
            characters += value.text.length;
            if (characters > fileBytes * 2) throw new Error('Caché demasiado grande.');
            chunks.push(makeChunk(relative, value.startLine, value.endLine, value.text));
          }
          totalBytes += fileBytes; totalChunks += chunks.length;
          restored.set(relative, { fingerprint: String(row.fingerprint), bytes: fileBytes, hash: String(row.hash), chunks });
        }
      }
    } catch {
      restored.clear();
      // Repair invalid rows on this scan instead of repeatedly restoring a damaged cache.
      try { this.db.exec('DELETE FROM index_meta'); } catch { this.closeDatabase(); }
    }
    return restored;
  }
  private persistCache(root: string, files: Map<string, CachedFile>): void {
    if (!this.db) return;
    try {
      this.db.exec('BEGIN');
      if (!this.cacheMatches(root)) this.db.exec('DELETE FROM cached_files; DELETE FROM chunks; DELETE FROM vectors; DELETE FROM index_meta;');
      const meta = this.db.prepare('INSERT OR REPLACE INTO index_meta VALUES (?, ?)');
      meta.run('root', root); meta.run('version', CACHE_VERSION);
      const removeFile = this.db.prepare('DELETE FROM cached_files WHERE path = ?');
      const removeChunks = this.db.prepare('DELETE FROM chunks WHERE path = ?');
      const existingFiles = this.db.prepare('SELECT path FROM cached_files WHERE path > ? ORDER BY path LIMIT 128');
      let lastPath = '';
      for (;;) {
        const rows = existingFiles.all(lastPath);
        if (!rows.length) break;
        lastPath = String(rows[rows.length - 1].path);
        for (const row of rows) if (!files.has(String(row.path))) { removeFile.run(row.path); removeChunks.run(row.path); }
      }
      const lookup = this.db.prepare('SELECT fingerprint, hash FROM cached_files WHERE path = ?');
      const insertFile = this.db.prepare('INSERT OR REPLACE INTO cached_files VALUES (?, ?, ?, ?, ?)');
      const insertChunk = this.db.prepare('INSERT INTO chunks VALUES (?, ?, ?, ?, ?)');
      for (const [relative, file] of files) {
        const existing = lookup.get(relative);
        if (existing?.fingerprint === file.fingerprint && existing.hash === file.hash) continue;
        const serial = file.chunks.map(({ startLine, endLine, text, hash }) => ({ startLine, endLine, text, hash }));
        insertFile.run(relative, file.fingerprint, file.bytes, file.hash, JSON.stringify(serial));
        removeChunks.run(relative);
        for (const chunk of file.chunks) insertChunk.run(relative, chunk.startLine, chunk.endLine, chunk.text, chunk.hash);
      }
      this.db.exec('DELETE FROM vectors WHERE hash NOT IN (SELECT hash FROM chunks); COMMIT');
    } catch { try { this.db?.exec('ROLLBACK'); } catch {} this.closeDatabase(); }
  }
  async search(query: string, maxChars = 18000, signal?: AbortSignal): Promise<Snippet[]> {
    signal?.throwIfAborted();
    if (this.closed) return [];
    const budgetLimit = Number.isFinite(maxChars) ? Math.min(100000, Math.max(0, Math.floor(maxChars))) : 18000;
    if (!budgetLimit) return [];
    const queryTerms = [...new Set(terms(query.slice(0, 20000)))].slice(0, 64);
    if (!queryTerms.length) return [];
    const scored = this.chunks.map(chunk => {
      let score = 0;
      const length = Math.max(1, chunk.length);
      for (const term of queryTerms) {
        const count = chunk.terms.get(term) ?? 0;
        if (!count) continue;
        const idf = Math.log(1 + (this.chunks.length - (this.frequencies.get(term) ?? 0) + .5) / ((this.frequencies.get(term) ?? 0) + .5));
        score += idf * (count * 2.2) / (count + 1.2 * (.25 + .75 * length / 300));
        if (chunk.path.toLowerCase().includes(term)) score += 1;
      }
      return { ...chunk, score };
    }).filter(chunk => chunk.score > 0).sort((a, b) => b.score - a.score).slice(0, 24);
    if (this.options?.semantic && scored.length) {
      try { await this.rerank(query, scored, signal); } catch { signal?.throwIfAborted(); /* Lexical search remains available without the optional embedding model. */ }
    }
    const selected: Snippet[] = [];
    let size = 0;
    for (const chunk of scored) {
      if (selected.some(other => other.path === chunk.path && other.startLine <= chunk.endLine && other.endLine >= chunk.startLine)) continue;
      const budget = budgetLimit - size;
      if (budget <= 0 || selected.length >= 8) break;
      const text = chunk.text.slice(0, budget);
      selected.push({ path: chunk.path, startLine: chunk.startLine, endLine: chunk.startLine + text.split('\n').length - 1, text, score: chunk.score });
      size += text.length;
    }
    return selected;
  }
  private async rerank(query: string, chunks: Chunk[], cancellation?: AbortSignal): Promise<void> {
    const model = this.options?.embeddingModel || 'nomic-embed-text';
    const revision = this.revision;
    const database = this.db;
    const vectors = new Map<string, number[]>();
    for (const chunk of chunks) {
      const row = database?.prepare('SELECT vector FROM vectors WHERE hash = ? AND model = ? AND length(vector) <= 262144').get(chunk.hash, model);
      if (row) {
        try {
          const value: unknown = JSON.parse(String(row.vector));
          if (Array.isArray(value) && value.length > 0 && value.length <= 8192 && value.every(Number.isFinite)) vectors.set(chunk.hash, value);
        } catch { /* A damaged vector is regenerated from the source chunk. */ }
      }
    }
    const missing = chunks.filter(chunk => !vectors.has(chunk.hash));
    const signal = cancellation ? AbortSignal.any([cancellation, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000);
    const response = await fetch('http://127.0.0.1:11434/api/embed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, input: [query.slice(0, 2000), ...missing.map(chunk => chunk.text.slice(0, 4000))], truncate: true, keep_alive: '2m' }), signal, redirect: 'error' });
    if (!response.ok || !response.body) { void response.body?.cancel().catch(() => undefined); throw new Error('Embeddings locales no disponibles.'); }
    const result = JSON.parse(await readBoundedText(response.body, signal)) as { embeddings?: number[][] };
    const embeddings = result.embeddings;
    if (!Array.isArray(embeddings) || embeddings.length !== missing.length + 1 || !embeddings.every(v => Array.isArray(v) && v.length > 0 && v.length <= 8192 && v.length === embeddings[0].length && v.every(Number.isFinite))) throw new Error('Embeddings no válidos.');
    const q = embeddings[0];
    missing.forEach((chunk, i) => { const vector = embeddings[i + 1]; vectors.set(chunk.hash, vector); if (!this.closed && this.revision === revision && database === this.db) database?.prepare('INSERT OR REPLACE INTO vectors VALUES (?, ?, ?)').run(chunk.hash, model, JSON.stringify(vector)); });
    for (const chunk of chunks) {
      const v = vectors.get(chunk.hash)!;
      if (v.length !== q.length) continue;
      const dot = q.reduce((sum, n, i) => sum + n * v[i], 0);
      const norms = Math.sqrt(q.reduce((s, n) => s + n * n, 0) * v.reduce((s, n) => s + n * n, 0));
      chunk.score = .3 * (chunk.score / (1 + chunk.score)) + .7 * (norms ? dot / norms : 0);
    }
    chunks.sort((a, b) => b.score - a.score);
  }
  close(): void { this.closed = true; this.revision++; this.closeDatabase(); this.chunks = []; this.cache.clear(); this.frequencies.clear(); }
}
