import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { AccountClient, AccountError } from './client';

interface OAuthOptions { timeoutMs?: number; signal?: AbortSignal; language?: 'es' | 'en' }

/** One single-use loopback listener per attempt; random callback path binds the browser to this request. */
export async function signInWithBrowser(client: AccountClient, provider: 'google' | 'apple',
  openBrowser: (url: string) => PromiseLike<boolean>, options: OAuthOptions = {}): Promise<void> {
  if (provider !== 'google' && provider !== 'apple') throw new AccountError('input');
  if (options.signal?.aborted) throw new AccountError('cancelled');
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = randomBytes(24).toString('base64url');
  const expectedPath = `/caled-account/${state}`;
  let server: Server;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let used = false;
  let accept!: (value: string) => void;
  let reject!: (error: AccountError) => void;
  const code = new Promise<string>((resolve, fail) => { accept = resolve; reject = fail; });
  // A browser launch failure or cancellation may occur before the callback is awaited.
  void code.catch(() => undefined);
  let interrupt!: (error: AccountError) => void;
  const interruption = new Promise<never>((_resolve, fail) => { interrupt = fail; });
  void interruption.catch(() => undefined);
  const abort = () => interrupt(new AccountError('cancelled'));
  server = createServer({ maxHeaderSize: 8_192 }, (request, response) => {
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    const address = server.address();
    const expectedHost = typeof address === 'object' && address ? `127.0.0.1:${address.port}` : '';
    const received = request.url ?? '';
    if (request.method !== 'GET' || request.headers.host !== expectedHost || received.length > 4_096 || !received.startsWith('/')) {
      response.writeHead(400).end('Invalid request.'); return;
    }
    let url: URL;
    try { url = new URL(received, `http://${expectedHost}`); }
    catch { response.writeHead(400).end('Invalid request.'); return; }
    const path = Buffer.from(url.pathname);
    const expected = Buffer.from(expectedPath);
    if (used || url.origin !== `http://${expectedHost}` || path.length !== expected.length || !timingSafeEqual(path, expected)) {
      response.writeHead(404).end('Not found.'); return;
    }
    if (url.searchParams.has('error')) {
      used = true; response.writeHead(400).end('Sign-in was not completed. Return to Caled.');
      reject(new AccountError('provider')); return;
    }
    const value = url.searchParams.get('code');
    if (url.searchParams.getAll('code').length !== 1 || !value || !/^[\w-]{1,2048}$/.test(value)) {
      response.writeHead(400).end('Invalid request.'); return;
    }
    used = true;
    response.writeHead(200).end(options.language === 'en'
      ? 'Return to Caled to finish signing in. You can close this tab.'
      : 'Vuelve a Caled para terminar de iniciar sesión. Puedes cerrar esta pestaña.');
    accept(value);
  });
  server.requestTimeout = 5_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 1_000;
  server.maxConnections = 8;
  try {
    await new Promise<void>((resolve, fail) => {
      server.once('error', fail);
      server.listen(0, '127.0.0.1', () => { server.removeListener('error', fail); resolve(); });
    });
    server.on('error', () => reject(new AccountError('network')));
    const address = server.address();
    if (!address || typeof address === 'string') throw new AccountError('network');
    const redirect = `http://127.0.0.1:${address.port}${expectedPath}`;
    const authorize = new URL('/auth/v1/authorize', client.endpoint);
    authorize.searchParams.set('provider', provider);
    authorize.searchParams.set('redirect_to', redirect);
    authorize.searchParams.set('code_challenge', challenge);
    authorize.searchParams.set('code_challenge_method', 's256');
    options.signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => interrupt(new AccountError('timeout')), options.timeoutMs ?? 300_000);
    if (options.signal?.aborted) throw new AccountError('cancelled');
    // Keep the browser-opening operation in the foreground; the rejection-only
    // branch still interrupts it on cancellation/timeout. A fast callback must
    // not close the listener while the HTTP success response is being received.
    const interrupted = Promise.race([interruption, code.then(() => new Promise<never>(() => undefined))]);
    if (!await Promise.race([Promise.resolve(openBrowser(authorize.toString())), interrupted])) throw new AccountError('network');
    const value = await Promise.race([code, interruption]);
    if (options.signal?.aborted) throw new AccountError('cancelled');
    await client.exchangeCode(value, verifier, options.signal);
  } catch (error) {
    if (error instanceof AccountError) throw error;
    throw new AccountError('network');
  } finally {
    used = true;
    if (timer) clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}
