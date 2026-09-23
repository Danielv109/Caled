import { Worker } from 'node:worker_threads';
import type { IndexOptions, IndexStats, Snippet } from './local-index';
export class IndexClient {
  private worker?: Worker;
  private id = 0;
  private disposed = false;
  private pending = new Map<number, { resolve: (result: unknown) => void; reject: (reason: Error) => void; cleanup: () => void }>();
  constructor(private readonly workerPath: string) {}
  scan(options: IndexOptions, signal?: AbortSignal): Promise<IndexStats> { return this.request('scan', { options }, signal) as Promise<IndexStats>; }
  search(query: string, maxChars: number, signal?: AbortSignal): Promise<Snippet[]> { return this.request('search', { query, maxChars }, signal) as Promise<Snippet[]>; }
  private async request(method: string, params: object, signal?: AbortSignal): Promise<unknown> {
    signal?.throwIfAborted();
    if (this.disposed) throw new Error('Índice cerrado.');
    if (this.pending.size >= 64) throw new Error('Hay demasiadas solicitudes de contexto pendientes.');
    if (!this.worker) {
      const worker = new Worker(this.workerPath);
      this.worker = worker;
      worker.on('message', (reply: { id: number; result?: unknown; error?: string }) => {
        const waiter = this.pending.get(reply.id);
        if (!waiter) return;
        waiter.cleanup(); this.pending.delete(reply.id);
        if (reply.error) waiter.reject(new Error(reply.error)); else waiter.resolve(reply.result);
      });
      worker.on('error', error => { if (this.worker === worker) { this.worker = undefined; this.fail(error); void worker.terminate(); } });
      worker.on('exit', code => { if (this.worker !== worker) return; this.worker = undefined; if (this.pending.size) this.fail(new Error(`El proceso de contexto terminó (${code}).`)); });
    }
    const id = ++this.id;
    const worker = this.worker;
    return new Promise((resolve, reject) => {
      const cancel = (reason: Error) => {
        if (!this.pending.delete(id)) return;
        cleanup();
        try { worker.postMessage({ id, method: 'cancel' }); } catch {}
        reject(reason);
      };
      const onAbort = () => cancel(signal?.reason instanceof Error ? signal.reason : new Error('Solicitud cancelada.'));
      const timer = setTimeout(() => cancel(new Error('El índice tardó demasiado. Reduce caled.context.maxFiles.')), 60000);
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); };
      this.pending.set(id, { resolve, reject, cleanup });
      signal?.addEventListener('abort', onAbort, { once: true });
      try { worker.postMessage({ id, method, ...params }); }
      catch (error) { this.pending.delete(id); cleanup(); reject(error); }
    });
  }
  private fail(error: Error): void { for (const waiter of this.pending.values()) { waiter.cleanup(); waiter.reject(error); } this.pending.clear(); }
  dispose(): void { this.disposed = true; this.fail(new Error('Índice cerrado.')); void this.worker?.terminate(); this.worker = undefined; }
}
