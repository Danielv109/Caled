import { parentPort } from 'node:worker_threads';
import { LocalIndex, type IndexOptions } from './local-index';
const index = new LocalIndex();
let queue = Promise.resolve();
const controllers = new Map<number, AbortController>();
parentPort?.on('message', (request: { id: number; method: 'scan' | 'search' | 'cancel'; options?: IndexOptions; query?: string; maxChars?: number }) => {
  if (request.method === 'cancel') { controllers.get(request.id)?.abort(new Error('Solicitud cancelada.')); return; }
  const controller = new AbortController();
  controllers.set(request.id, controller);
  queue = queue.then(async () => {
    try {
      controller.signal.throwIfAborted();
      const result = request.method === 'scan' ? await index.scan(request.options!, controller.signal) : await index.search(request.query ?? '', request.maxChars, controller.signal);
      parentPort?.postMessage({ id: request.id, result });
    } catch (error) { parentPort?.postMessage({ id: request.id, error: error instanceof Error ? error.message : 'Error del índice.' }); }
    finally { controllers.delete(request.id); }
  });
});
parentPort?.on('close', () => { for (const controller of controllers.values()) controller.abort(); index.close(); });
