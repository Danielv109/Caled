import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
// @ts-expect-error Bootstrap scripts are plain ESM, validated here at their public boundary.
import { addSetting, parseSettings } from '../scripts/desktop.mjs';
// @ts-expect-error Bootstrap scripts are plain ESM.
import { localRequest, ownsProcess, verifyRuntime } from '../scripts/local-ai.mjs';
// @ts-expect-error Bootstrap scripts are plain ESM.
import { loadOllamaLock, verifyArchive } from '../scripts/download-ollama.mjs';

const temporaryRoot = path.resolve('.cache', 'runtime-tests');
const fixtures: string[] = [];
const encode = new TextEncoder();
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const lock = { version: 'v0.34.3', sha256: 'a'.repeat(64), size: 3,
  url: 'https://github.com/ollama/ollama/releases/download/v0.34.3/ollama-windows-amd64.zip' };

async function fixture() {
  await mkdir(temporaryRoot, { recursive: true });
  const directory = await mkdtemp(path.join(temporaryRoot, 'case-'));
  fixtures.push(directory);
  await mkdir(path.join(directory, 'product'), { recursive: true });
  await mkdir(path.join(directory, '.runtime', 'ollama', 'lib', 'ollama'), { recursive: true });
  await writeFile(path.join(directory, 'product', 'ollama.lock.json'), JSON.stringify(lock));
  const files = [
    { path: 'ollama.exe', size: 3, sha256: hash('exe') },
    { path: 'lib/ollama/ggml-base.dll', size: 3, sha256: hash('dll') },
  ];
  await writeFile(path.join(directory, '.runtime', 'ollama', 'ollama.exe'), 'exe');
  await writeFile(path.join(directory, '.runtime', 'ollama', 'lib', 'ollama', 'ggml-base.dll'), 'dll');
  const marker = { schemaVersion: 2, version: lock.version, archiveSha256: lock.sha256, mode: 'cpu', files };
  await writeFile(path.join(directory, '.runtime', 'ollama', 'caled-runtime.json'), JSON.stringify(marker));
  return { directory, marker };
}

afterEach(async () => {
  vi.unstubAllGlobals(); vi.useRealTimers();
  for (const directory of fixtures.splice(0)) {
    const resolved = path.resolve(directory);
    if (!resolved.startsWith(temporaryRoot + path.sep)) throw new Error('Unsafe test cleanup');
    await rm(resolved, { recursive: true, force: true });
  }
});

describe('portable settings', () => {
  it('reads comments, BOM and trailing commas without corrupting quoted syntax', () => {
    const text = '\ufeff{\n // preference\n "url":"https://host/a,}", /* note */ "nested": [1,2,],\n}';
    expect(parseSettings(text).value).toEqual({ url: 'https://host/a,}', nested: [1, 2] });
  });
  it.each(['{"a":1} trailing', '{/* unfinished', '{"a": }', '[]', '{"text":"unterminated}'])('rejects malformed settings: %s', text => {
    expect(() => parseSettings(text)).toThrow();
    expect(() => addSetting(text, 'caled.model', 'local')).toThrow();
  });
  it.each(['{}', '{ // an empty profile\n}', '{"a":1 // keep this\n}', '{"a":1, // trailing\n}', '{"a":1/* keep */}'])('preserves comments while adding to %s', text => {
    const updated = addSetting(text, 'caled.model', 'qwen2.5-coder:1.5b');
    expect(parseSettings(updated).value['caled.model']).toBe('qwen2.5-coder:1.5b');
    for (const comment of ['// keep this', '// trailing', '/* keep */', '// an empty profile']) {
      if (text.includes(comment)) expect(updated).toContain(comment);
    }
  });
  it('never overrides an explicit setting, including an empty model', () => {
    const text = '{"caled.model":"", // deliberate\n}';
    expect(addSetting(text, 'caled.model', 'new')).toBe(text);
  });
});

describe('runtime integrity without network or real processes', () => {
  it('verifies an existing file manifest completely offline', async () => {
    const { directory } = await fixture();
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('offline'); }));
    expect((await verifyRuntime(directory)).files).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects changed executable bytes even when size matches', async () => {
    const { directory } = await fixture();
    await writeFile(path.join(directory, '.runtime', 'ollama', 'ollama.exe'), 'bad');
    await expect(verifyRuntime(directory)).rejects.toThrow('integrity');
  });
  it('rejects omitted runtime binaries', async () => {
    const { directory } = await fixture();
    await writeFile(path.join(directory, '.runtime', 'ollama', 'lib', 'ollama', 'unknown.dll'), 'bad');
    await expect(verifyRuntime(directory)).rejects.toThrow('absent');
  });
  it('does not silently relabel an installation when its release lock changes', async () => {
    const { directory } = await fixture();
    const file = path.join(directory, '.runtime', 'ollama', 'caled-runtime.json');
    const before = await readFile(file, 'utf8');
    await writeFile(path.join(directory, 'product', 'ollama.lock.json'), JSON.stringify({ ...lock, sha256: 'b'.repeat(64) }));
    await expect(verifyRuntime(directory)).rejects.toThrow('provenance');
    expect(await readFile(file, 'utf8')).toBe(before);
  });
  it('rejects traversal and duplicate entries in an otherwise valid manifest', async () => {
    const { directory, marker } = await fixture();
    for (const files of [[...marker.files, marker.files[0]], [...marker.files, { path: 'lib/ollama/../../evil.dll', size: 0, sha256: hash('') }]]) {
      await writeFile(path.join(directory, '.runtime', 'ollama', 'caled-runtime.json'), JSON.stringify({ ...marker, files }));
      await expect(verifyRuntime(directory)).rejects.toThrow('manifest');
    }
  });
  it('pins release URL exactly and validates archive size as well as SHA-256', async () => {
    const { directory } = await fixture();
    await writeFile(path.join(directory, 'product', 'ollama.lock.json'), JSON.stringify({ ...lock, url: lock.url + '?redirect=elsewhere' }));
    await expect(loadOllamaLock(directory)).rejects.toThrow('lock');
    const archive = path.join(directory, 'archive.zip');
    await writeFile(archive, 'abc');
    await expect(verifyArchive(archive, { sha256: hash('abc'), size: 2 })).rejects.toThrow('integrity');
    await expect(verifyArchive(archive, { sha256: hash('abc'), size: 3 })).resolves.toBeUndefined();
  });
  it('requires executable, PID and creation identity before owning or stopping a server', () => {
    const executable = path.resolve('owned', 'ollama.exe');
    const record = { pid: 123, executable, creation: '123456789012345678' };
    expect(ownsProcess(record, { ...record }, executable)).toBe(true);
    expect(ownsProcess(record, { ...record, pid: 124 }, executable)).toBe(false);
    expect(ownsProcess(record, { ...record, creation: '123456789012345679' }, executable)).toBe(false);
    expect(ownsProcess(record, { ...record }, path.resolve('moved', 'ollama.exe'))).toBe(false);
    expect(ownsProcess({ ...record, creation: undefined }, record, executable)).toBe(false);
    expect(ownsProcess(record, { ...record, executable: path.resolve('foreign', 'ollama.exe') }, executable)).toBe(false);
  });
});

describe('bounded managed loopback requests', () => {
  it('sets a numeric loopback destination and blocks redirects', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"version":"0.34.3"}'));
    expect(await localRequest('version', { fetcher })).toEqual({ version: '0.34.3' });
    expect(fetcher.mock.calls[0][0]).toBe('http://127.0.0.1:11434/api/version');
    expect(fetcher.mock.calls[0][1].redirect).toBe('error');
    await expect(localRequest('../remote', { fetcher })).rejects.toThrow('route');
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('bounds bodies and never echoes a provider error message', async () => {
    await expect(localRequest('tags', { maxBytes: 8, fetcher: vi.fn().mockResolvedValue(new Response('x'.repeat(9))) })).rejects.toThrow('limit');
    await expect(localRequest('tags', { fetcher: vi.fn().mockResolvedValue(new Response('{"error":"sensitive prompt"}')) })).rejects.not.toThrow('sensitive prompt');
    await expect(localRequest('tags', { fetcher: vi.fn().mockResolvedValue(new Response('secret-source')) })).rejects.not.toThrow('secret-source');
  });
  it('consumes a final NDJSON event without a newline', async () => {
    const onLine = vi.fn();
    await localRequest('pull', { onLine, fetcher: vi.fn().mockResolvedValue(new Response('{"status":"progress"}\n{"status":"success"}')) });
    expect(onLine.mock.calls.map(call => call[0].status)).toEqual(['progress', 'success']);
  });
  it('times out a stalled body and releases its reader', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(encode.encode('{')); }, cancel });
    const pending = localRequest('tags', { timeoutMs: 20, fetcher: vi.fn().mockResolvedValue(new Response(body)) });
    const assertion = expect(pending).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(21);
    await assertion;
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('times out before headers even if a transport ignores cancellation', async () => {
    vi.useFakeTimers();
    const pending = localRequest('version', { timeoutMs: 20, fetcher: () => new Promise(() => undefined) });
    const assertion = expect(pending).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(21);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
});
