import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CheckpointStore } from '../src/core/checkpoints';
import { readBoundedFile } from '../src/core/files';
const boundary = path.resolve('artifacts/checkpoint-tests');
let directory: string, workspace: string, store: CheckpointStore;
beforeEach(async () => { await mkdir(boundary, { recursive: true }); directory = await mkdtemp(path.join(boundary, 'case-')); workspace = path.join(directory, 'workspace'); await mkdir(workspace); store = new CheckpointStore(path.join(directory, 'store'), workspace); });
afterEach(async () => { if (directory.startsWith(boundary + path.sep)) await rm(directory, { recursive: true, force: true }); });
const file = () => ({ path: 'a.ts', absolutePath: path.join(workspace, 'a.ts'), before: 'old', after: 'new', exists: true });
describe('checkpoint storage', () => {
  it('persists exact content across instances and does not alter source files', async () => {
    await writeFile(path.join(workspace, 'a.ts'), 'old');
    const snapshot = await store.create('Change', [file()]);
    const reopened = new CheckpointStore(path.join(directory, 'store'), workspace);
    expect(await reopened.load(snapshot.id)).toEqual(snapshot);
    expect(await reopened.list()).toEqual([{ id: snapshot.id, summary: 'Change', createdAt: snapshot.createdAt, files: ['a.ts'] }]);
    expect(await readFile(path.join(workspace, 'a.ts'), 'utf8')).toBe('old');
  });
  it('rejects tampered snapshots and snapshots from another workspace', async () => {
    const snapshot = await store.create('Change', [file()]);
    await expect(new CheckpointStore(path.join(directory, 'store'), directory).load(snapshot.id)).rejects.toThrow();
    const filename = path.join(directory, 'store', `${snapshot.id}.json`);
    await writeFile(filename, (await readFile(filename, 'utf8')).replace('old', 'bad'));
    await expect(store.load(snapshot.id)).rejects.toThrow(/dañado/);
    expect(await store.list()).toEqual([]);
  });
  it('rejects unsafe file paths and ids', async () => {
    await expect(store.create('Bad', [{ ...file(), path: '../outside' }])).rejects.toThrow();
    await expect(store.load('../x')).rejects.toThrow();
  });
  it('retains at most twenty recoverable changes', async () => {
    for (let i = 0; i < 22; i++) await store.create(String(i), [file()]);
    expect(await store.list()).toHaveLength(20);
  });
});
describe('bounded UTF8 files', () => {
  it('reads normal Unicode text on Windows without dev-id false positives', async () => {
    const filename = path.join(workspace, 'a.ts'); await writeFile(filename, 'const saludo = "¡Hola!";');
    expect(await readBoundedFile(filename)).toBe('const saludo = "¡Hola!";');
  });
  it('rejects oversized and binary files', async () => {
    const filename = path.join(workspace, 'a.ts'); await writeFile(filename, Buffer.alloc(140000, 65));
    await expect(readBoundedFile(filename)).rejects.toThrow(/grande/);
    await writeFile(filename, Buffer.from([0, 255])); await expect(readBoundedFile(filename)).rejects.toThrow(/UTF-8/);
  });
});
