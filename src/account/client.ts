import { createHash } from 'node:crypto';
import { withAbort } from '../core/sse';

export interface AccountConfig { url: string; publicKey: string }
export interface SecretStore {
  get(key: string): PromiseLike<string | undefined>;
  store(key: string, value: string): PromiseLike<void>;
  delete(key: string): PromiseLike<void>;
}
export interface AccountUser { id: string; email: string; emailVerified: boolean; phone: string; phoneVerified: boolean }
interface Session { accessToken: string; refreshToken: string; expiresAt: number; user: AccountUser }
export type AccountErrorCode = 'config' | 'input' | 'credentials' | 'email_unconfirmed' | 'rate_limit'
  | 'network' | 'timeout' | 'protocol' | 'provider' | 'signed_out' | 'cancelled';
export class AccountError extends Error {
  constructor(readonly code: AccountErrorCode, readonly status?: number) { super(`Account: ${code}`); this.name = 'AccountError'; }
}

/** Never accept server/admin keys in a shipped desktop client. Settings must be application-scoped. */
export function validateAccountConfig(config: AccountConfig): URL {
  let url: URL;
  try { url = new URL(config.url); } catch { throw new AccountError('config'); }
  if (config.url.trim() !== config.url || /[\u0000-\u0020\u007f]/.test(config.url)
    || url.username || url.password || url.search || url.hash || url.pathname !== '/'
    || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))) {
    throw new AccountError('config');
  }
  const key = config.publicKey;
  if (/^sb_publishable_[a-zA-Z0-9_-]{10,256}$/.test(key)) return url;
  try {
    const pieces = key.split('.');
    const claims = JSON.parse(Buffer.from(pieces[1] ?? '', 'base64url').toString());
    if (pieces.length === 3 && key.length < 4_096 && /^[\w.-]+$/.test(key) && claims.role === 'anon') return url;
  } catch { /* Only the public anon role is accepted. */ }
  throw new AccountError('config');
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AccountError('protocol');
  return value as Record<string, unknown>;
}
function token(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length < 16_384 && !/\s/.test(value);
}
function accountUser(value: unknown): AccountUser {
  const user = object(value);
  if (typeof user.id !== 'string' || !user.id || user.id.length > 128) throw new AccountError('protocol');
  return {
    id: user.id,
    email: typeof user.email === 'string' ? user.email.slice(0, 320) : '',
    emailVerified: typeof user.email_confirmed_at === 'string' && !!user.email_confirmed_at,
    phone: typeof user.phone === 'string' ? user.phone.slice(0, 32) : '',
    phoneVerified: typeof user.phone_confirmed_at === 'string' && !!user.phone_confirmed_at,
  };
}
function emailAddress(value: string): string {
  const email = value.trim();
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AccountError('input');
  return email;
}
function phoneNumber(phone: string): string {
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new AccountError('input');
  return phone;
}
function otp(code: string): string {
  if (!/^\d{6,10}$/.test(code)) throw new AccountError('input');
  return code;
}

/** Host-only adapter. Passwords and tokens never enter a webview, output channel, or workspace file. */
export class AccountClient {
  readonly endpoint: URL;
  private readonly storageKey: string;
  private refreshPending?: Promise<Session>;
  constructor(private readonly config: AccountConfig, private readonly secrets: SecretStore,
    private readonly transport: typeof fetch = fetch, private readonly timeoutMs = 15_000) {
    this.endpoint = validateAccountConfig(config);
    this.storageKey = `caled.account.${createHash('sha256').update(this.endpoint.origin + '\n' + config.publicKey).digest('hex')}`;
  }

  private async request(path: string, method = 'GET', body?: unknown, accessToken?: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    let response: Response | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      if (signal?.aborted) throw new AccountError('cancelled');
      response = await withAbort(this.transport(new URL(`/auth/v1/${path}`, this.endpoint), {
        method, headers: { apikey: this.config.publicKey, 'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal,
        redirect: 'error', credentials: 'omit',
      }), controller.signal);
      const chunks: Buffer[] = [];
      let length = 0;
      if (response.body) {
        reader = response.body.getReader();
        while (true) {
          const { value, done } = await withAbort(reader.read(), controller.signal);
          if (done) break;
          length += value.length;
          if (length > 256 * 1_024) throw new AccountError('protocol');
          chunks.push(Buffer.from(value));
        }
      }
      let result: Record<string, unknown> = {};
      if (length) {
        try { result = object(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { throw new AccountError('protocol'); }
      }
      if (!response.ok) {
        const known = result.error_code === 'email_not_confirmed' || result.code === 'email_not_confirmed';
        throw new AccountError(known ? 'email_unconfirmed' : response.status === 429 ? 'rate_limit'
          : response.status === 401 || response.status === 400 && path.startsWith('token') ? 'credentials' : 'provider', response.status);
      }
      return result;
    } catch (error) {
      if (error instanceof AccountError) throw error;
      throw new AccountError(signal?.aborted ? 'cancelled' : controller.signal.aborted ? 'timeout' : 'network');
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      controller.abort();
      void reader?.cancel().catch(() => undefined);
      reader?.releaseLock();
    }
  }

  private async save(data: Record<string, unknown>): Promise<Session> {
    if (!token(data.access_token) || !token(data.refresh_token) || typeof data.expires_in !== 'number'
      || !Number.isFinite(data.expires_in) || data.expires_in <= 0 || data.expires_in > 604_800) throw new AccountError('protocol');
    const session: Session = { accessToken: data.access_token, refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1_000, user: accountUser(data.user) };
    await this.secrets.store(this.storageKey, JSON.stringify(session));
    return session;
  }

  private async stored(): Promise<Session | undefined> {
    const raw = await this.secrets.get(this.storageKey);
    if (!raw) return undefined;
    try {
      if (raw.length > 40_000) throw new Error();
      const value = JSON.parse(raw) as Session;
      if (!token(value.accessToken) || !token(value.refreshToken) || !Number.isFinite(value.expiresAt)
        || !value.user || typeof value.user.id !== 'string') throw new Error();
      return value;
    } catch { await this.secrets.delete(this.storageKey); return undefined; }
  }

  private async session(): Promise<Session> {
    const current = await this.stored();
    if (!current) throw new AccountError('signed_out');
    if (current.expiresAt > Date.now() + 30_000) return current;
    if (!this.refreshPending) {
      this.refreshPending = this.request('token?grant_type=refresh_token', 'POST', { refresh_token: current.refreshToken })
        .then(data => this.save(data)).catch(async error => {
          if (error instanceof AccountError && error.code === 'credentials') await this.secrets.delete(this.storageKey);
          throw error;
        }).finally(() => { this.refreshPending = undefined; });
    }
    return this.refreshPending;
  }

  async user(): Promise<AccountUser | undefined> {
    if (!await this.stored()) return undefined;
    const session = await this.session();
    const user = accountUser(await this.request('user', 'GET', undefined, session.accessToken));
    await this.secrets.store(this.storageKey, JSON.stringify({ ...session, user }));
    return user;
  }

  async signIn(email: string, password: string): Promise<AccountUser> {
    if (!password || password.length > 256) throw new AccountError('input');
    const response = await this.request('token?grant_type=password', 'POST', { email: emailAddress(email), password });
    return (await this.save(response)).user;
  }

  async signUp(email: string, password: string): Promise<'confirmation_required' | 'signed_in'> {
    if (password.length < 8 || password.length > 256) throw new AccountError('input');
    const response = await this.request('signup', 'POST', { email: emailAddress(email), password });
    if (response.access_token) { await this.save(response); return 'signed_in'; }
    accountUser(response);
    return 'confirmation_required';
  }

  async resendConfirmation(email: string): Promise<void> {
    await this.request('resend', 'POST', { email: emailAddress(email), type: 'signup' });
  }

  async verifyEmail(email: string, code: string): Promise<AccountUser> {
    return (await this.save(await this.request('verify', 'POST', { email: emailAddress(email), token: otp(code), type: 'email' }))).user;
  }

  async exchangeCode(code: string, verifier: string, signal?: AbortSignal): Promise<AccountUser> {
    if (!/^[\w-]{1,2048}$/.test(code) || !/^[\w-]{43,128}$/.test(verifier)) throw new AccountError('input');
    const result = await this.request('token?grant_type=pkce', 'POST', { auth_code: code, code_verifier: verifier }, undefined, signal);
    if (signal?.aborted) throw new AccountError('cancelled');
    return (await this.save(result)).user;
  }

  async requestPhoneVerification(phone: string): Promise<void> {
    const current = await this.session();
    const user = await this.user();
    if (!user?.emailVerified) throw new AccountError('email_unconfirmed');
    await this.request('user', 'PUT', { phone: phoneNumber(phone) }, current.accessToken);
  }

  async verifyPhone(phone: string, code: string): Promise<AccountUser> {
    const current = await this.session();
    const response = await this.request('verify', 'POST', { phone: phoneNumber(phone), token: otp(code), type: 'phone_change' }, current.accessToken);
    if (response.access_token) await this.save(response);
    const user = await this.user();
    if (!user || !user.phoneVerified) throw new AccountError('protocol');
    return user;
  }

  /** Local state is always removed; report remote failure so it is never mistaken for server revocation. */
  async signOut(): Promise<void> {
    const session = await this.stored();
    try { if (session) await this.request('logout?scope=local', 'POST', undefined, session.accessToken); }
    finally { await this.secrets.delete(this.storageKey); }
  }
}
