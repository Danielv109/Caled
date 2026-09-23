import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, writeFile, rm, symlink, utimes, stat } from 'node:fs/promises';
import * as fs from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { LocalIndex } from '../src/index/local-index';

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, open: vi.fn(actual.open) };
});

const boundary = path.resolve('artifacts/test-index');
let root: string; let index: LocalIndex;
beforeEach(async () => { vi.mocked(fs.open).mockReset(); await mkdir(boundary, { recursive: true }); root = await mkdtemp(path.join(boundary, 'case-')); index = new LocalIndex(); });
afterEach(async () => { index.close(); vi.unstubAllGlobals(); vi.restoreAllMocks(); if (path.resolve(root).startsWith(boundary + path.sep)) await rm(root, { recursive: true, force: true }); });
describe('bounded local context', () => {
  it('retrieves relevant code and respects budget and ignored secrets', async () => {
    await writeFile(path.join(root, 'auth.ts'), 'export function authenticateUser(token: string) { return token.length > 4; }');
    await writeFile(path.join(root, 'style.css'), 'body { color: blue; }');
    await writeFile(path.join(root, '.env'), 'authenticateUser=SECRET');
    await writeFile(path.join(root, 'binary.ts'), Buffer.from([0, 1, 2]));
    const stats = await index.scan({ root, storagePath: path.join(root, '.cache') });
    expect(stats.files).toBe(2); expect(stats.storage).toBe('sqlite');
    const result = await index.search('authenticateUser token', 25);
    expect(result[0].path).toBe('auth.ts'); expect(result.reduce((sum, item) => sum + item.text.length, 0)).toBeLessThanOrEqual(25);
    expect(await index.search('SECRET')).toEqual([]); expect(await index.search('token', 0)).toEqual([]);
  });
  it('respects nested ignore negation and excludes junctions', async () => {
    await mkdir(path.join(root, 'sub'));
    await writeFile(path.join(root, '.gitignore'), '*.log');
    await writeFile(path.join(root, 'sub/.gitignore'), '!keep.log');
    await writeFile(path.join(root, 'sub/keep.log'), 'uniquesymbol');
    await writeFile(path.join(root, 'sub/drop.log'), 'uniquesymbol');
    await symlink(path.join(root, 'sub'), path.join(root, 'link'), 'junction');
    await index.scan({ root });
    expect((await index.search('uniquesymbol')).map(item => item.path)).toEqual(['sub/keep.log']);
  });
  it('reports file truncation and refreshes deleted/changed content', async () => {
    await Promise.all(Array.from({ length: 15 }, (_, i) => writeFile(path.join(root, `f${i}.ts`), `keyword value${i}`)));
    expect(await index.scan({ root, maxFiles: 10 })).toMatchObject({ files: 10, truncated: true });
    await writeFile(path.join(root, 'f0.ts'), 'replacementonly');
    await index.scan({ root });
    expect((await index.search('replacementonly'))[0].path).toBe('f0.ts');
    expect(await index.search('value0')).toEqual([]);
  });
  it('optionally reranks with local embeddings and reuses cached vectors', async () => {
    await writeFile(path.join(root, 'one.ts'), 'shared alpha'); await writeFile(path.join(root, 'two.ts'), 'shared beta');
    const fetcher = vi.fn(async (_url: unknown, init: RequestInit) => {
      const payload = JSON.parse(String(init.body));
      return Response.json({ embeddings: payload.input.map((text: string) => text.includes('alpha') ? [0, 1] : [1, 0]) });
    });
    vi.stubGlobal('fetch', fetcher);
    await index.scan({ root, storagePath: path.join(root, '.cache'), semantic: true });
    expect((await index.search('shared'))[0].path).toBe('two.ts');
    await index.search('shared');
    expect(JSON.parse(String(fetcher.mock.calls[1][1].body)).input).toHaveLength(1);
    expect(fetcher.mock.calls[0][0]).toBe('http://127.0.0.1:11434/api/embed');
  });
  it('remains usable when optional embeddings are unavailable', async () => {
    await writeFile(path.join(root, 'a.ts'), 'fallbacksymbol');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await index.scan({ root, semantic: true });
    expect((await index.search('fallbacksymbol'))[0].path).toBe('a.ts');
  });
  it('only opens changed source files on an incremental scan', async () => {
    await writeFile(path.join(root, 'a.ts'), 'unchangedalpha');
    await writeFile(path.join(root, 'b.ts'), 'originalbeta');
    const opened = vi.spyOn(fs, 'open');
    expect(await index.scan({ root })).toMatchObject({ files: 2, readFiles: 2, reusedFiles: 0 });
    opened.mockClear();
    expect(await index.scan({ root })).toMatchObject({ files: 2, readFiles: 0, reusedFiles: 2 });
    expect(opened).not.toHaveBeenCalled();
    await writeFile(path.join(root, 'b.ts'), 'changedbetanew');
    expect(await index.scan({ root })).toMatchObject({ files: 2, readFiles: 1, reusedFiles: 1 });
    expect(opened.mock.calls.map(call => call[0])).toEqual([path.join(root, 'b.ts')]);
    expect(await index.search('originalbeta')).toEqual([]);
    expect((await index.search('changedbetanew'))[0].path).toBe('b.ts');
  });
  it('restores SQLite chunks after restart while validating current files and exclusions', async () => {
    const options = { root, storagePath: path.join(root, '.cache') };
    await writeFile(path.join(root, 'a.ts'), 'restartalpha');
    await writeFile(path.join(root, 'b.ts'), 'restartbeta');
    await writeFile(path.join(root, 'c.ts'), 'restartgamma');
    await index.scan(options);
    index.close(); index = new LocalIndex();
    const opened = vi.spyOn(fs, 'open');
    opened.mockClear();
    expect(await index.scan(options)).toMatchObject({ files: 3, readFiles: 0, reusedFiles: 3, storage: 'sqlite' });
    expect(opened).not.toHaveBeenCalled();
    expect((await index.search('restartalpha'))[0].path).toBe('a.ts');
    index.close(); index = new LocalIndex();
    await rm(path.join(root, 'a.ts'));
    await writeFile(path.join(root, '.caledignore'), 'b.ts');
    await writeFile(path.join(root, 'c.ts'), 'gammarevised');
    expect(await index.scan(options)).toMatchObject({ files: 2, readFiles: 2, reusedFiles: 0 });
    expect(await index.search('restartalpha restartbeta restartgamma')).toEqual([]);
    expect((await index.search('gammarevised'))[0].path).toBe('c.ts');
  });
  it('does not reuse cached content across workspace roots sharing storage', async () => {
    await mkdir(path.join(root, 'one')); await mkdir(path.join(root, 'two'));
    await writeFile(path.join(root, 'one/a.ts'), 'firstroot');
    await writeFile(path.join(root, 'two/a.ts'), 'secondroot');
    const storagePath = path.join(root, '.cache');
    await index.scan({ root: path.join(root, 'one'), storagePath });
    expect(await index.scan({ root: path.join(root, 'two'), storagePath })).toMatchObject({ readFiles: 1, reusedFiles: 0 });
    expect(await index.search('firstroot')).toEqual([]);
    expect((await index.search('secondroot'))[0].text).toBe('secondroot');
    index.close(); index = new LocalIndex();
    expect(await index.scan({ root: path.join(root, 'one'), storagePath })).toMatchObject({ readFiles: 1, reusedFiles: 0 });
  });
  it('restores overlapping multiline chunks without rereading their sources', async () => {
    const options = { root, storagePath: path.join(root, '.cache') };
    const content = Array.from({ length: 107 }, (_, i) => `export const line${i} = 'overlappingsymbol';`).join('\n');
    await writeFile(path.join(root, 'multiline.ts'), content);
    expect(await index.scan(options)).toMatchObject({ chunks: 2 });
    const original = await index.search('overlappingsymbol');
    index.close(); index = new LocalIndex();
    expect(await index.scan(options)).toMatchObject({ readFiles: 0, reusedFiles: 1 });
    expect(await index.search('overlappingsymbol')).toEqual(original);
  });
  it('restores multiple SQLite pages and removes deleted cached files', async () => {
    const options = { root, storagePath: path.join(root, '.cache') };
    await Promise.all(Array.from({ length: 140 }, (_, i) => writeFile(path.join(root, `page${i}.ts`), `paginationkey${i}`)));
    await index.scan(options); index.close(); index = new LocalIndex();
    expect(await index.scan(options)).toMatchObject({ files: 140, readFiles: 0, reusedFiles: 140 });
    await Promise.all(Array.from({ length: 135 }, (_, i) => rm(path.join(root, `page${i}.ts`))));
    expect(await index.scan(options)).toMatchObject({ files: 5, readFiles: 0, reusedFiles: 5 });
    index.close(); index = new LocalIndex();
    expect(await index.scan(options)).toMatchObject({ files: 5, readFiles: 0, reusedFiles: 5 });
    expect(await index.search('paginationkey0')).toEqual([]);
    expect((await index.search('paginationkey139'))[0].path).toBe('page139.ts');
  });
  it('detects same-size content changes even when mtime is restored', async () => {
    const filename = path.join(root, 'a.ts');
    await writeFile(filename, 'firstvalue');
    const initial = await stat(filename);
    await index.scan({ root });
    await writeFile(filename, 'othervalue');
    await utimes(filename, initial.atime, initial.mtime);
    expect(await index.scan({ root })).toMatchObject({ readFiles: 1 });
    expect(await index.search('firstvalue')).toEqual([]);
    expect((await index.search('othervalue'))[0].text).toBe('othervalue');
  });
  it('reuses chunk hashes after a metadata-only change and preserves cached vectors', async () => {
    const filename = path.join(root, 'a.ts'), options = { root, storagePath: path.join(root, '.cache'), semantic: true };
    await writeFile(filename, 'metadataonlysymbol');
    const fetcher = vi.fn(async (_url: unknown, init: RequestInit) => Response.json({ embeddings: JSON.parse(String(init.body)).input.map(() => [1, 0]) }));
    vi.stubGlobal('fetch', fetcher);
    await index.scan(options); await index.search('metadataonlysymbol');
    await utimes(filename, new Date(), new Date('2020-01-01'));
    expect(await index.scan(options)).toMatchObject({ readFiles: 1, reusedFiles: 0 });
    await index.search('metadataonlysymbol');
    expect(JSON.parse(String(fetcher.mock.calls[1][1].body)).input).toHaveLength(1);
  });
  it('invalidates cached files when a directory becomes a junction', async () => {
    await mkdir(path.join(root, 'sub')); await mkdir(path.join(root, '.cache'));
    await writeFile(path.join(root, 'sub/a.ts'), 'originaltarget');
    await writeFile(path.join(root, '.cache/a.ts'), 'hiddenreplacement');
    await index.scan({ root });
    await rm(path.join(root, 'sub'), { recursive: true });
    await symlink(path.join(root, '.cache'), path.join(root, 'sub'), 'junction');
    expect(await index.scan({ root })).toMatchObject({ files: 0, readFiles: 0 });
    expect(await index.search('originaltarget hiddenreplacement')).toEqual([]);
  });
  it('repairs corrupted cached chunks and never returns their injected text', async () => {
    const storagePath = path.join(root, '.cache');
    await writeFile(path.join(root, 'a.ts'), 'authenticvalue');
    await index.scan({ root, storagePath }); index.close();
    const db = new DatabaseSync(path.join(storagePath, 'context.sqlite'));
    const row = db.prepare('SELECT chunks FROM cached_files').get()!;
    const chunks = JSON.parse(String(row.chunks)); chunks[0].text = 'injectedvalue';
    db.prepare('UPDATE cached_files SET chunks = ?').run(JSON.stringify(chunks)); db.close();
    index = new LocalIndex();
    expect(await index.scan({ root, storagePath })).toMatchObject({ readFiles: 1, reusedFiles: 0 });
    expect(await index.search('injectedvalue')).toEqual([]);
    index.close(); index = new LocalIndex();
    expect(await index.scan({ root, storagePath })).toMatchObject({ readFiles: 0, reusedFiles: 1 });
    expect((await index.search('authenticvalue'))[0].text).toBe('authenticvalue');
  });
  it('does not publish a partially scanned index when cancelled', async () => {
    await writeFile(path.join(root, 'a.ts'), 'beforecancel');
    await index.scan({ root });
    await writeFile(path.join(root, 'a.ts'), 'aftercancel');
    const controller = new AbortController();
    const originalOpen = (await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')).open;
    vi.spyOn(fs, 'open').mockImplementation(async (...args) => { const handle = await originalOpen(...args); controller.abort(new Error('stopscan')); return handle; });
    await expect(index.scan({ root }, controller.signal)).rejects.toThrow('stopscan');
    expect((await index.search('beforecancel'))[0].text).toBe('beforecancel');
    expect(await index.search('aftercancel')).toEqual([]);
    vi.mocked(fs.open).mockReset();
    expect(await index.scan({ root })).toMatchObject({ readFiles: 1 });
  });
  it('propagates cancellation during optional embeddings', async () => {
    await writeFile(path.join(root, 'a.ts'), 'cancelsemantic');
    await index.scan({ root, semantic: true });
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: RequestInit) => {
      controller.abort(new Error('stopembedding'));
      init.signal?.throwIfAborted();
      return Response.json({ embeddings: [] });
    }));
    await expect(index.search('cancelsemantic', 100, controller.signal)).rejects.toThrow('stopembedding');
  });
});
