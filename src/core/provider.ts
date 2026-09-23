import { readBoundedText, readLines, readSseData, StreamProtocolError, withAbort } from './sse';

export type ProviderId = 'ollama' | 'deepseek' | 'kimi' | 'openai-compatible';

export interface ProviderConfig {
  provider: ProviderId;
  baseUrl: string;
  model: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /** Native Ollama structured output and resource settings. Omitted by default. */
  format?: 'json' | Record<string, unknown>;
  contextWindow?: number;
  keepAlive?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type ProviderErrorCode =
  | 'invalid_config' | 'http_error' | 'network_error' | 'protocol_error'
  | 'remote_error' | 'timeout' | 'cancelled';

export class ProviderError extends Error {
  readonly status: number | undefined;
  constructor(readonly code: ProviderErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
  }
}

const DEFAULTS: Record<ProviderId, { baseUrl: string; model: string }> = {
  ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'qwen2.5-coder:3b' },
  deepseek: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash' },
  kimi: { baseUrl: 'https://api.moonshot.ai/v1', model: 'kimi-k3' },
  'openai-compatible': { baseUrl: 'http://127.0.0.1:1234/v1', model: 'local-model' },
};

export function getProviderDefaults(provider: ProviderId): { baseUrl: string; model: string } {
  if (!Object.hasOwn(DEFAULTS, provider)) throw invalid('Proveedor desconocido.');
  return { ...DEFAULTS[provider] };
}

function invalid(message: string): ProviderError {
  return new ProviderError('invalid_config', message);
}

/** HTTPS is required except for loopback; URLs may not contain credentials or queries. */
export function validateEndpoint(baseUrl: string): URL {
  if (typeof baseUrl !== 'string' || baseUrl.length > 2_048 || /[\u0000-\u0020\u007f]/.test(baseUrl)) {
    throw invalid('La URL del proveedor no es válida.');
  }
  let endpoint: URL;
  try { endpoint = new URL(baseUrl); }
  catch { throw invalid('La URL del proveedor no es válida.'); }
  const loopback = endpoint.hostname === 'localhost' || endpoint.hostname === '[::1]'
    || /^127(?:\.\d{1,3}){3}$/.test(endpoint.hostname);
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && loopback)) {
    throw invalid('Usa HTTPS para servidores remotos; HTTP sólo está permitido en loopback.');
  }
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw invalid('La URL no puede incluir credenciales, parámetros ni fragmentos.');
  }
  return endpoint;
}

function validModel(model: unknown): model is string {
  return typeof model === 'string' && model.length > 0 && model.length <= 256
    && model.trim() === model && !/[\u0000-\u0020\u007f-\u009f]/.test(model);
}

function validateConfig(config: ProviderConfig, requireModel: boolean): URL {
  getProviderDefaults(config.provider);
  const endpoint = validateEndpoint(config.baseUrl);
  if (requireModel && !validModel(config.model)) throw invalid('Selecciona un identificador de modelo válido.');
  if (config.apiKey !== undefined && (typeof config.apiKey !== 'string'
    || config.apiKey.length > 8_192 || /[\u0000-\u0020\u007f-\u009f]/.test(config.apiKey))) {
    throw invalid('La clave API contiene caracteres no válidos.');
  }
  if ((config.provider === 'deepseek' || config.provider === 'kimi') && !config.apiKey) {
    throw invalid('Configura la clave API del proveedor para usar su servicio.');
  }
  if (config.temperature !== undefined && (!Number.isFinite(config.temperature)
    || config.temperature < 0 || config.temperature > 2)) {
    throw invalid('La temperatura debe estar entre 0 y 2.');
  }
  if (config.maxTokens !== undefined && (!Number.isSafeInteger(config.maxTokens)
    || config.maxTokens < 1 || config.maxTokens > 1_048_576)) {
    throw invalid('El límite de tokens debe ser un entero entre 1 y 1048576.');
  }
  if (config.timeoutMs !== undefined && (!Number.isSafeInteger(config.timeoutMs)
    || config.timeoutMs < 1 || config.timeoutMs > 600_000)) {
    throw invalid('El tiempo de espera debe estar entre 1 y 600000 milisegundos.');
  }
  if (config.contextWindow !== undefined && (!Number.isSafeInteger(config.contextWindow)
    || config.contextWindow < 512 || config.contextWindow > 1_048_576)) {
    throw invalid('El contexto debe ser un entero entre 512 y 1048576 tokens.');
  }
  if (config.keepAlive !== undefined && (typeof config.keepAlive !== 'string'
    || config.keepAlive.length > 32 || !/^(?:-1|0|\d+(?:\.\d+)?(?:ms|s|m|h))$/.test(config.keepAlive))) {
    throw invalid('La duración en memoria debe ser 0, -1 o un tiempo como 2m.');
  }
  if (config.format !== undefined && config.format !== 'json') {
    if (!object(config.format)) throw invalid('El formato debe ser json o un esquema JSON.');
    try {
      if (JSON.stringify(config.format).length > 65_536) throw new Error();
    } catch { throw invalid('El esquema JSON no es válido o supera el límite.'); }
  }
  return endpoint;
}

function validateMessages(messages: ChatMessage[]): void {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 256) {
    throw invalid('La conversación debe incluir entre 1 y 256 mensajes.');
  }
  let size = 0;
  for (const message of messages) {
    if (!message || !['system', 'user', 'assistant'].includes(message.role)
      || typeof message.content !== 'string') throw invalid('La conversación contiene un mensaje inválido.');
    size += message.content.length;
    if (size > 8_388_608) throw invalid('La conversación es demasiado grande; reduce el contexto.');
  }
}

function operationScope(timeoutMs: number, caller?: AbortSignal) {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  if (caller?.aborted) controller.abort();
  else caller?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => {
    if (!controller.signal.aborted) {
      timedOut = true;
      controller.abort();
    }
  }, timeoutMs);
  return {
    signal: controller.signal,
    normalize(error: unknown): ProviderError {
      if (timedOut) return new ProviderError('timeout', 'El proveedor agotó el tiempo de espera. Ajusta el límite o usa un modelo más pequeño.');
      if (controller.signal.aborted) return new ProviderError('cancelled', 'La solicitud fue cancelada.');
      if (error instanceof ProviderError) return error;
      if (error instanceof StreamProtocolError) return new ProviderError('protocol_error', error.message);
      // Network exceptions can contain credential-bearing URLs; never echo their text.
      return new ProviderError('network_error', 'No se pudo conectar con el proveedor. Revisa la URL, la red y que el servidor esté iniciado.');
    },
    dispose() {
      clearTimeout(timer);
      caller?.removeEventListener('abort', onAbort);
      controller.abort();
    },
  };
}

function requestUrl(endpoint: URL, route: string): string {
  const result = new URL(endpoint);
  result.pathname = `${result.pathname.replace(/\/+$/, '')}/${route}`;
  return result.toString();
}

function headers(config: ProviderConfig): Record<string, string> {
  const result: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) result.Authorization = `Bearer ${config.apiKey}`;
  return result;
}

function checkResponse(response: Response): ReadableStream<Uint8Array> {
  if (!response.ok) {
    void response.body?.cancel().catch(() => undefined);
    const hints: Record<number, string> = {
      400: 'Revisa el modelo y los parámetros de generación.',
      401: 'La clave API no es válida o no fue proporcionada.',
      402: 'El proveedor requiere saldo o un plan de pago.',
      403: 'La cuenta no tiene permiso para usar este servicio.',
      404: 'Revisa la URL y que el modelo esté disponible o instalado.',
      413: 'Reduce el tamaño del contexto enviado.',
      429: 'Se alcanzó el límite de solicitudes o cuota; espera antes de reintentar.',
      503: 'El servicio está temporalmente ocupado o no disponible.',
    };
    throw new ProviderError('http_error', `El proveedor respondió HTTP ${response.status}. ${hints[response.status] ?? 'Vuelve a intentarlo más tarde.'}`, response.status);
  }
  if (!response.body) throw new ProviderError('protocol_error', 'El proveedor no devolvió un cuerpo de respuesta.');
  return response.body;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function parseObject(text: string): Record<string, unknown> {
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new ProviderError('protocol_error', 'El proveedor devolvió JSON inválido.'); }
  const result = object(value);
  if (!result) throw new ProviderError('protocol_error', 'El proveedor devolvió un formato inesperado.');
  if (Object.hasOwn(result, 'error')) {
    // Remote errors may quote the prompt, Authorization header, or source files.
    throw new ProviderError('remote_error', 'El proveedor informó un error durante la respuesta. Revisa el modelo, los parámetros y la cuota.');
  }
  return result;
}

function requestBody(config: ProviderConfig, messages: ChatMessage[]): Record<string, unknown> {
  const payload: Record<string, unknown> = { model: config.model, messages, stream: true };
  if (config.provider === 'ollama') {
    const options: Record<string, number> = {};
    if (config.temperature !== undefined) options.temperature = config.temperature;
    if (config.maxTokens !== undefined) options.num_predict = config.maxTokens;
    if (config.contextWindow !== undefined) options.num_ctx = config.contextWindow;
    if (config.format !== undefined) payload.format = config.format;
    if (config.keepAlive !== undefined) payload.keep_alive = config.keepAlive;
    if (Object.keys(options).length) payload.options = options;
  } else {
    // Let each model choose its supported default; newer reasoning models may fix temperature.
    if (config.temperature !== undefined) payload.temperature = config.temperature;
    if (config.maxTokens !== undefined) payload.max_tokens = config.maxTokens;
  }
  return payload;
}

export async function* streamChat(
  config: ProviderConfig,
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const endpoint = validateConfig(config, true);
  validateMessages(messages);
  const scope = operationScope(config.timeoutMs ?? 120_000, signal);
  try {
    if (scope.signal.aborted) throw new DOMException('Cancelada', 'AbortError');
    const response = await withAbort(fetch(requestUrl(endpoint, config.provider === 'ollama' ? 'api/chat' : 'chat/completions'), {
      method: 'POST', headers: headers(config), body: JSON.stringify(requestBody(config, messages)),
      signal: scope.signal, redirect: 'error',
    }), scope.signal);
    const body = checkResponse(response);
    let receivedContent = false;
    const finish = (reason?: unknown) => {
      if (reason === 'length') throw new ProviderError('protocol_error', 'La respuesta alcanzó el límite de tokens y quedó incompleta. Reduce el alcance o aumenta el límite.');
      if (reason === 'content_filter' || reason === 'tool_calls' || reason === 'function_call') {
        throw new ProviderError('protocol_error', 'El proveedor finalizó sin una respuesta textual completa.');
      }
      if (!receivedContent) throw new ProviderError('protocol_error', 'El proveedor terminó sin generar una respuesta. Prueba otro modelo o reduce el contexto.');
    };
    if (config.provider === 'ollama') {
      for await (const line of readLines(body, scope.signal)) {
        if (!line.trim()) continue;
        const chunk = parseObject(line);
        const message = object(chunk.message);
        if (message?.content !== undefined && typeof message.content !== 'string') {
          throw new ProviderError('protocol_error', 'El proveedor devolvió contenido no textual.');
        }
        if (!message && chunk.done !== true) {
          throw new ProviderError('protocol_error', 'Ollama devolvió una respuesta de chat inválida.');
        }
        if (typeof message?.content === 'string' && message.content) { receivedContent ||= !!message.content.trim(); yield message.content; }
        if (scope.signal.aborted) throw new DOMException('Cancelada', 'AbortError');
        if (chunk.done === true) { finish(chunk.done_reason); return; }
      }
    } else {
      for await (const data of readSseData(body, scope.signal)) {
        if (data.trim() === '[DONE]') { finish(); return; }
        if (!data.trim()) continue;
        const chunk = parseObject(data);
        if (!Array.isArray(chunk.choices)) {
          throw new ProviderError('protocol_error', 'El proveedor devolvió un evento de chat inválido.');
        }
        // Usage-only chunks legitimately have an empty choices array.
        if (chunk.choices.length === 0) continue;
        const choice = object(chunk.choices[0]);
        const delta = object(choice?.delta);
        if (!choice || !delta) throw new ProviderError('protocol_error', 'El proveedor devolvió un fragmento de chat inválido.');
        if (delta.content !== undefined && delta.content !== null && typeof delta.content !== 'string') {
          throw new ProviderError('protocol_error', 'El proveedor devolvió contenido no textual.');
        }
        // reasoning_content is intentionally not interpreted as the assistant's answer.
        if (typeof delta.content === 'string' && delta.content) { receivedContent ||= !!delta.content.trim(); yield delta.content; }
        if (scope.signal.aborted) throw new DOMException('Cancelada', 'AbortError');
        // A terminal choice is sufficient: some servers keep SSE alive for usage/heartbeats.
        if (typeof choice.finish_reason === 'string' && choice.finish_reason) { finish(choice.finish_reason); return; }
      }
    }
    throw new ProviderError('protocol_error', 'La respuesta se interrumpió antes de terminar. Vuelve a intentarlo.');
  } catch (error) {
    throw scope.normalize(error);
  } finally {
    scope.dispose();
  }
}

export async function listModels(config: ProviderConfig, signal?: AbortSignal): Promise<string[]> {
  const endpoint = validateConfig(config, false);
  const scope = operationScope(config.timeoutMs ?? 120_000, signal);
  try {
    if (scope.signal.aborted) throw new DOMException('Cancelada', 'AbortError');
    const response = await withAbort(fetch(requestUrl(endpoint, config.provider === 'ollama' ? 'api/tags' : 'models'), {
      method: 'GET', headers: headers(config), signal: scope.signal, redirect: 'error',
    }), scope.signal);
    const result = parseObject(await readBoundedText(checkResponse(response), scope.signal));
    const entries = config.provider === 'ollama' ? result.models : result.data;
    if (!Array.isArray(entries)) throw new ProviderError('protocol_error', 'El proveedor devolvió una lista de modelos inválida.');
    const models = new Set<string>();
    for (const entry of entries) {
      const record = object(entry);
      const model = config.provider === 'ollama' ? record?.name ?? record?.model : record?.id;
      if (validModel(model)) models.add(model);
    }
    return [...models].sort();
  } catch (error) {
    throw scope.normalize(error);
  } finally {
    scope.dispose();
  }
}
