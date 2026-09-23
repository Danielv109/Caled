import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getProviderDefaults, listModels, ProviderError, streamChat, validateEndpoint,
  type ProviderConfig,
} from '../src/core/provider';
import { MAX_STREAM_LINE, readLines, readSseData } from '../src/core/sse';

const encoder = new TextEncoder();
const ollama: ProviderConfig = { provider: 'ollama', ...getProviderDefaults('ollama') };
const compatible: ProviderConfig = {
  provider: 'openai-compatible', baseUrl: 'https://models.example.test/v1', model: 'test-model',
};
const messages = [{ role: 'user' as const, content: 'Ayúdame con esta función.' }];

function byteStream(text: string, step = 1): ReadableStream<Uint8Array> {
  const bytes = encoder.encode(text);
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) { controller.close(); return; }
      controller.enqueue(bytes.slice(offset, offset + step));
      offset += step;
    },
  });
}

function respond(text: string, step = 1) {
  return vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(byteStream(text, step))));
}

async function collect<T>(values: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const value of values) result.push(value);
  return result;
}

function chunk(content: string, finish: string | null = null): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: finish }] })}\n\n`;
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('endpoint and config validation', () => {
  it.each([
    'http://127.0.0.1:11434', 'http://127.0.0.9:1234/v1', 'http://localhost:1234/v1',
    'http://[::1]:11434', 'https://models.example.test/v1/',
  ])('accepts %s', (endpoint) => {
    expect(validateEndpoint(endpoint)).toBeInstanceOf(URL);
  });

  it.each([
    'http://models.example.test', 'http://192.168.0.5', 'ftp://localhost',
    'file:///etc/passwd', 'https://key:secret@models.example.test',
    'https://models.example.test?api_key=secret', 'https://models.example.test#secret',
    'https://models.example.test\n', 'not-a-url', 'http://localhost.evil.test',
  ])('rejects %s without echoing the URL', (endpoint) => {
    expect(() => validateEndpoint(endpoint)).toThrow(ProviderError);
    try { validateEndpoint(endpoint); }
    catch (error) { expect(String(error)).not.toContain(endpoint); }
  });

  it('returns a copy of defaults', () => {
    const config = getProviderDefaults('ollama');
    config.model = 'mutated';
    expect(getProviderDefaults('ollama').model).toBe('qwen2.5-coder:3b');
    expect(getProviderDefaults('deepseek').model).toBe('deepseek-flash');
  });

  it.each([
    { model: '' }, { model: 'bad\nmodel' }, { maxTokens: 0 }, { maxTokens: 1.5 },
    { temperature: NaN }, { temperature: 3 }, { timeoutMs: 0 },
    { apiKey: 'secret\r\nInjected: yes' },
  ])('rejects invalid configuration before fetch: %o', async (override) => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(collect(streamChat({ ...compatible, ...override }, messages))).rejects.toMatchObject({ code: 'invalid_config' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('requires API credentials for DeepSeek and Kimi', async () => {
    for (const provider of ['deepseek', 'kimi'] as const) {
      await expect(collect(streamChat({ provider, ...getProviderDefaults(provider) }, messages)))
        .rejects.toMatchObject({ code: 'invalid_config' });
    }
  });
});

describe('bounded streaming protocol', () => {
  it('handles every UTF-8 byte and CRLF boundary independently', async () => {
    expect(await collect(readLines(byteStream('\ufeffuno\r\ndos 😀\rtres\nfin'))))
      .toEqual(['uno', 'dos 😀', 'tres', 'fin']);
  });

  it('handles SSE comments, multiline data, unknown fields and missing final separator', async () => {
    expect(await collect(readSseData(byteStream(': heartbeat\r\nid: 9\r\nevent: message\r\ndata: first\r\ndata: second\r\n\r\ndata: tail'))))
      .toEqual(['first\nsecond', 'tail']);
  });

  it('bounds a line even in a single oversized transport chunk', async () => {
    await expect(collect(readLines(byteStream('x'.repeat(MAX_STREAM_LINE + 1), MAX_STREAM_LINE + 1))))
      .rejects.toThrow('límite');
  });

  it('bounds multiline SSE events', async () => {
    const line = `data: ${'x'.repeat(65_535)}\n`;
    await expect(collect(readSseData(byteStream(line.repeat(17), 16_384))))
      .rejects.toThrow('límite');
  });

  it('rejects invalid UTF-8', async () => {
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array([0xff])); c.close(); } });
    await expect(collect(readLines(body))).rejects.toThrow('UTF-8');
    expect(body.locked).toBe(false);
  });
});

describe('chat providers', () => {
  it('streams Ollama NDJSON including final content and maps options', async () => {
    respond([
      JSON.stringify({ message: { content: 'Hola ' }, done: false }),
      JSON.stringify({ message: { content: 'México 😀' }, done: true }),
    ].join('\n'));
    expect((await collect(streamChat({ ...ollama, temperature: 0, maxTokens: 128 }, messages))).join(''))
      .toBe('Hola México 😀');
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('http://127.0.0.1:11434/api/chat');
    expect(JSON.parse(init!.body as string)).toMatchObject({
      model: 'qwen2.5-coder:3b', stream: true, options: { temperature: 0, num_predict: 128 },
    });
    expect(init!.redirect).toBe('error');
    expect(init!.headers).not.toHaveProperty('Authorization');
  });

  it('streams compatible SSE and ignores reasoning and usage-only chunks', async () => {
    respond(': ping\n\n'
      + 'data: {"choices":[{"delta":{"reasoning_content":"private reasoning"}}]}\n\n'
      + chunk('café 😀') + 'data: {"choices":[],"usage":{"total_tokens":12}}\n\n'
      + 'data: [DONE]\n\n');
    expect(await collect(streamChat({ ...compatible, apiKey: 'secret' }, messages))).toEqual(['café 😀']);
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('https://models.example.test/v1/chat/completions');
    expect(init!.headers).toMatchObject({ Authorization: 'Bearer secret' });
    expect(JSON.parse(init!.body as string)).not.toHaveProperty('temperature');
  });

  it('sends optional Ollama structured output and memory options only when configured', async () => {
    respond('{"message":{"content":"{}"},"done":true}\n');
    await collect(streamChat({ ...ollama, format: 'json', contextWindow: 8192, keepAlive: '2m' }, messages));
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string)).toMatchObject({
      format: 'json', options: { num_ctx: 8192 }, keep_alive: '2m',
    });
    respond('{"message":{"content":"ok"},"done":true}\n');
    await collect(streamChat(ollama, messages));
    const defaults = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string);
    expect(defaults).not.toHaveProperty('options');
    expect(defaults).not.toHaveProperty('format');
    expect(defaults).not.toHaveProperty('keep_alive');
  });

  it('accepts a JSON schema but does not pass Ollama-only options to remote APIs', async () => {
    const schema = { type: 'object', properties: { action: { type: 'string' } } };
    respond('{"message":{"content":"{}"},"done":true}\n');
    await collect(streamChat({ ...ollama, format: schema }, messages));
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string).format).toEqual(schema);
    respond(chunk('ok', 'stop'));
    await collect(streamChat({ ...compatible, format: schema, contextWindow: 8192, keepAlive: '2m' }, messages));
    const payload = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string);
    expect(payload).not.toHaveProperty('format');
    expect(payload).not.toHaveProperty('options');
    expect(payload).not.toHaveProperty('keep_alive');
  });

  it.each([{ contextWindow: 0 }, { contextWindow: 8192.5 }, { keepAlive: 'infinity' },
    { format: [] }, { format: { large: 'x'.repeat(65_537) } }])('rejects invalid Ollama options before network: %#', async override => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(collect(streamChat({ ...ollama, ...override } as ProviderConfig, messages))).rejects.toMatchObject({ code: 'invalid_config' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { provider: 'ollama' as const, text: '{"message":{"content":""},"done":true}\n' },
    { provider: 'ollama' as const, text: '{"message":{"content":"partial"},"done":true,"done_reason":"length"}\n' },
    { provider: 'openai-compatible' as const, text: 'data: [DONE]\n\n' },
    { provider: 'openai-compatible' as const, text: chunk('partial', 'length') },
    { provider: 'openai-compatible' as const, text: chunk(' ', 'stop') },
  ])('rejects empty or token-truncated $provider completions', async ({ provider, text }) => {
    respond(text);
    await expect(collect(streamChat({ ...compatible, provider }, messages))).rejects.toMatchObject({ code: 'protocol_error' });
  });

  it('finishes and cancels a stream that stays open after terminal finish_reason', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(encoder.encode(chunk('done', 'stop'))); }, cancel,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    expect(await collect(streamChat(compatible, messages))).toEqual(['done']);
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });

  it('accepts a finish reason when a compatible server omits DONE', async () => {
    respond(chunk('complete', 'stop'));
    expect(await collect(streamChat(compatible, messages))).toEqual(['complete']);
  });

  it.each([
    { provider: 'ollama' as const, text: '{"message":{"content":"partial"},"done":false}\n' },
    { provider: 'openai-compatible' as const, text: chunk('partial') },
  ])('reports truncated $provider streams', async ({ provider, text }) => {
    respond(text);
    await expect(collect(streamChat({ ...compatible, provider }, messages)))
      .rejects.toMatchObject({ code: 'protocol_error' });
  });

  it('reports invalid JSON without quoting source or credentials', async () => {
    respond('data: secret-prompt-and-api-key\n\n');
    await expect(collect(streamChat(compatible, messages))).rejects.toMatchObject({ code: 'protocol_error' });
    respond('data: secret-prompt-and-api-key\n\n');
    await expect(collect(streamChat(compatible, messages))).rejects.not.toThrow('secret-prompt-and-api-key');
  });

  it('does not surface remote error bodies', async () => {
    respond('data: {"error":{"message":"api-key-secret"}}\n\n');
    await expect(collect(streamChat(compatible, messages))).rejects.toMatchObject({ code: 'remote_error' });
  });

  it('returns actionable HTTP status without echoing its body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('secret key and source', { status: 401 })));
    await expect(collect(streamChat(compatible, messages))).rejects.toMatchObject({ code: 'http_error', status: 401 });
  });

  it('hides arbitrary transport exception details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('https://secret@example.test')));
    await expect(collect(streamChat(compatible, messages))).rejects.toMatchObject({ code: 'network_error' });
  });

  it('cancels and unlocks the body when the consumer stops early', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(encoder.encode(chunk('first'))); }, cancel,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    for await (const token of streamChat(compatible, messages)) { expect(token).toBe('first'); break; }
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
    expect(vi.mocked(fetch).mock.calls[0]![1]!.signal!.aborted).toBe(true);
  });

  it('does not fetch when caller is already cancelled', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    controller.abort('secret reason');
    await expect(collect(streamChat(compatible, messages, controller.signal)))
      .rejects.toMatchObject({ code: 'cancelled' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not yield buffered tokens after caller cancels between iterations', async () => {
    respond(chunk('first') + chunk('second') + 'data: [DONE]\n\n', 16_384);
    const controller = new AbortController();
    const iterator = streamChat(compatible, messages, controller.signal);
    expect(await iterator.next()).toMatchObject({ value: 'first', done: false });
    controller.abort();
    await expect(iterator.next()).rejects.toMatchObject({ code: 'cancelled' });
  });

  it('cancels pending stream reads when caller aborts', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    const controller = new AbortController();
    const pending = collect(streamChat(compatible, messages, controller.signal));
    const assertion = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    await vi.waitFor(() => expect(body.locked).toBe(true));
    controller.abort('secret reason');
    await assertion;
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });

  it('times out while waiting for headers even if fetch ignores its signal', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
    const pending = collect(streamChat({ ...compatible, timeoutMs: 20 }, messages));
    const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(21);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out a stalled response body and frees the reader', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    const pending = collect(streamChat({ ...compatible, timeoutMs: 20 }, messages));
    const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(21);
    await assertion;
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('model discovery', () => {
  it('lists installed Ollama models without requiring a selected model', async () => {
    respond(JSON.stringify({ models: [{ name: 'z:3b' }, { model: 'a:7b' }, { name: 'z:3b' }, {}] }));
    expect(await listModels({ ...ollama, model: '' })).toEqual(['a:7b', 'z:3b']);
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe('http://127.0.0.1:11434/api/tags');
  });

  it('lists OpenAI-compatible models and filters unsafe IDs', async () => {
    respond(JSON.stringify({ data: [{ id: 'org/model-new' }, { id: '<bad model>' }, { id: 42 }] }));
    expect(await listModels(compatible)).toEqual(['org/model-new']);
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe('https://models.example.test/v1/models');
  });

  it('rejects invalid discovery payloads', async () => {
    respond('{}');
    await expect(listModels(compatible)).rejects.toMatchObject({ code: 'protocol_error' });
  });

  it('bounds discovery responses', async () => {
    respond(' '.repeat(2_097_153), 32_768);
    await expect(listModels(compatible)).rejects.toMatchObject({ code: 'protocol_error' });
  });
});
