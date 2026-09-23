/** Bounded protocol decoders. No provider SDK or renderer dependencies. */
export const MAX_STREAM_LINE = 1_048_576;

export class StreamProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StreamProtocolError';
  }
}

function aborted(): DOMException {
  // Never propagate a caller's arbitrary abort reason into the UI or logs.
  return new DOMException('La solicitud fue cancelada.', 'AbortError');
}

/** Races operations that may not themselves implement AbortSignal. */
export async function withAbort<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  if (signal.aborted) {
    // Observe a potentially already-started operation to avoid an unhandled rejection.
    void operation.catch(() => undefined);
    throw aborted();
  }
  let onAbort: (() => void) | undefined;
  const cancellation = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(aborted());
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([operation, cancellation]);
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}

/** Releases the reader on success, early return, errors, timeout, and cancellation. */
export async function* decodeUtf8(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const onAbort = () => { void reader.cancel().catch(() => undefined); };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    while (true) {
      if (signal?.aborted) throw aborted();
      const next = await withAbort(reader.read(), signal);
      if (signal?.aborted) throw aborted();
      if (next.done) break;
      // A server can send a huge transport chunk: only decode small windows at once.
      for (let start = 0; start < next.value.byteLength; start += 16_384) {
        if (signal?.aborted) throw aborted();
        let text: string;
        try {
          text = decoder.decode(next.value.subarray(start, start + 16_384), { stream: true });
        } catch {
          throw new StreamProtocolError('El proveedor envió texto UTF-8 inválido.');
        }
        if (text) yield text;
      }
    }
    let tail: string;
    try {
      tail = decoder.decode();
    } catch {
      throw new StreamProtocolError('El proveedor envió texto UTF-8 incompleto.');
    }
    if (tail) yield tail;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    // Cancellation itself is untrusted; do not wait indefinitely for a source cancel hook.
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** Handles LF, CRLF, and CR even when separators and UTF-8 characters span chunks. */
export async function* readLines(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
  maxLength = MAX_STREAM_LINE,
): AsyncGenerator<string> {
  let pending = '';
  let skipLF = false;
  for await (const text of decodeUtf8(body, signal)) {
    if (signal?.aborted) throw aborted();
    let start = 0;
    if (skipLF) {
      if (text[0] === '\n') start = 1;
      skipLF = false;
    }
    for (let index = start; index < text.length; index++) {
      const character = text[index];
      if (character !== '\r' && character !== '\n') continue;
      if (pending.length + index - start > maxLength) {
        throw new StreamProtocolError('La línea recibida supera el límite de seguridad.');
      }
      const line = pending + text.slice(start, index);
      pending = '';
      if (character === '\r') {
        if (text[index + 1] === '\n') index++;
        else if (index === text.length - 1) skipLF = true;
      }
      start = index + 1;
      if (signal?.aborted) throw aborted();
      yield line;
    }
    if (pending.length + text.length - start > maxLength) {
      throw new StreamProtocolError('La línea recibida supera el límite de seguridad.');
    }
    pending += text.slice(start);
  }
  if (signal?.aborted) throw aborted();
  if (pending) yield pending;
}

/** Emits SSE data fields; ignores comments, ids and retry hints. */
export async function* readSseData(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  let fields: string[] = [];
  let eventLength = 0;
  for await (const line of readLines(body, signal)) {
    if (line === '') {
      if (fields.length) yield fields.join('\n');
      fields = [];
      eventLength = 0;
      continue;
    }
    if (line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    if (field !== 'data') continue;
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    eventLength += value.length + 1;
    if (eventLength > MAX_STREAM_LINE) {
      throw new StreamProtocolError('El evento recibido supera el límite de seguridad.');
    }
    fields.push(value);
  }
  // Some compatible servers close the stream without the final blank separator.
  if (fields.length) yield fields.join('\n');
}

export async function readBoundedText(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
  maxLength = 2_097_152,
): Promise<string> {
  const parts: string[] = [];
  let length = 0;
  for await (const part of decodeUtf8(body, signal)) {
    length += part.length;
    if (length > maxLength) throw new StreamProtocolError('La respuesta supera el límite de seguridad.');
    parts.push(part);
  }
  return parts.join('');
}
