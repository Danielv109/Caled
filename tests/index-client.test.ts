import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { IndexClient } from '../src/index/client';

const boundary = path.resolve('artifacts/test-index-client');
let sandbox: string, workerPath: string;
const clients: IndexClient[] = [];
beforeAll(async () => {
  await mkdir(boundary, { recursive: true });
  sandbox = await mkdtemp(path.join(boundary, 'case-'));
  workerPath = path.join(sandbox, 'index-worker.cjs');
  await build({ entryPoints: ['src/index/worker.ts'], outfile: workerPath, bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['node:sqlite'] });
});
afterEach(() => { for (const client of clients.splice(0)) client.dispose(); vi.useRealTimers(); });
afterAll(async () => { if (sandbox && path.resolve(sandbox).startsWith(boundary + path.sep)) await rm(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); });
function client(filename = workerPath): IndexClient { const result = new IndexClient(filename); clients.push(result); return result; }

describe('index worker lifecycle', () => {
  it('scans and restores persisted context in a replacement worker', async () => {
    const root = path.join(sandbox, 'workspace'); await mkdir(root);
    await writeFile(path.join(root, 'main.ts'), 'workerrestartsymbol');
    const options = { root, storagePath: path.join(root, '.cache') };
    const first = client();
    expect(await first.scan(options)).toMatchObject({ files: 1, readFiles: 1 });
    expect((await first.search('workerrestartsymbol', 100))[0].path).toBe('main.ts');
    first.dispose();
    const second = client();
    expect(await second.scan(options)).toMatchObject({ files: 1, reusedFiles: 1, readFiles: 0, storage: 'sqlite' });
  });
  it('rejects pre-cancelled requests and remains available afterwards', async () => {
    const index = client(), controller = new AbortController(); controller.abort(new Error('cancelbeforestart'));
    await expect(index.search('test', 100, controller.signal)).rejects.toThrow('cancelbeforestart');
    await expect(index.search('test', 100)).resolves.toEqual([]);
  });
  it('aborts a real worker scan before publishing a partial index', async () => {
    const root = path.join(sandbox, 'cancel-workspace'); await mkdir(root);
    await Promise.all(Array.from({ length: 100 }, (_, i) => writeFile(path.join(root, `file${i}.ts`), 'abortworkermarker')));
    const index = client(), controller = new AbortController();
    const rejected = expect(index.scan({ root }, controller.signal)).rejects.toThrow('cancelrealscan');
    controller.abort(new Error('cancelrealscan'));
    await rejected;
    expect(await index.search('abortworkermarker', 100)).toEqual([]);
    expect(await index.scan({ root })).toMatchObject({ files: 100 });
    expect((await index.search('abortworkermarker', 100)).length).toBeGreaterThan(0);
  });
  it('forwards cancellation without blocking subsequent requests', async () => {
    const filename = path.join(sandbox, 'cancellation-worker.cjs');
    await writeFile(filename, "const {parentPort}=require('node:worker_threads'); const cancelled=[]; parentPort.on('message',request=>{ if(request.method==='cancel') cancelled.push(request.id); else if(request.query==='status') parentPort.postMessage({id:request.id,result:cancelled}); });");
    const index = client(filename), controller = new AbortController();
    const pending = index.search('wait', 100, controller.signal);
    const rejected = expect(pending).rejects.toThrow('cancelrunning');
    controller.abort(new Error('cancelrunning'));
    await rejected;
    expect(await index.search('status', 100)).toEqual([1]);
  });
  it('cancels expired requests instead of leaving work in the queue', async () => {
    const filename = path.join(sandbox, 'timeout-worker.cjs');
    await writeFile(filename, "const {parentPort}=require('node:worker_threads'); const cancelled=[]; parentPort.on('message',request=>{ if(request.method==='cancel') cancelled.push(request.id); else if(request.query==='status') parentPort.postMessage({id:request.id,result:cancelled}); });");
    const index = client(filename);
    vi.useFakeTimers();
    const rejected = expect(index.search('wait', 100)).rejects.toThrow('tardó demasiado');
    await vi.advanceTimersByTimeAsync(60000); await rejected;
    vi.useRealTimers();
    expect(await index.search('status', 100)).toEqual([1]);
  });
  it('rejects outstanding requests on disposal and cannot restart after disposal', async () => {
    const filename = path.join(sandbox, 'idle-worker.cjs');
    await writeFile(filename, "require('node:worker_threads').parentPort.on('message',()=>{});");
    const index = client(filename);
    const rejected = expect(index.search('wait', 100)).rejects.toThrow('cerrado');
    index.dispose(); await rejected;
    await expect(index.search('test', 100)).rejects.toThrow('cerrado');
  });
  it('recovers on a new request after a worker crashes', async () => {
    const filename = path.join(sandbox, 'crash-worker.cjs');
    await writeFile(filename, "throw new Error('testworkercrash');");
    const index = client(filename);
    await expect(index.search('test', 100)).rejects.toThrow('testworkercrash');
    await writeFile(filename, "const {parentPort}=require('node:worker_threads'); parentPort.on('message',request=>parentPort.postMessage({id:request.id,result:[]}));");
    expect(await index.search('test', 100)).toEqual([]);
  });
});
