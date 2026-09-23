import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountClient, validateAccountConfig, type SecretStore } from '../src/account/client';
import { signInWithBrowser } from '../src/account/oauth';

const config = { url: 'https://accounts.example.test', publicKey: 'sb_publishable_example_test_public_key' };
const user = { id: 'user-123', email: 'test@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' };
const session = { access_token: 'private-access-token', refresh_token: 'private-refresh-token', expires_in: 3_600, user };
function secrets() {
  const values = new Map<string, string>();
  const store: SecretStore = { get: async key => values.get(key), store: async (key, value) => { values.set(key, value); },
    delete: async key => { values.delete(key); } };
  return { values, store };
}
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status }); }
function transport(...responses: Response[]) {
  return vi.fn<typeof fetch>().mockImplementation(async () => responses.shift() ?? json({}));
}
afterEach(() => { vi.restoreAllMocks(); });

describe('account configuration', () => {
  it('accepts publishable or legacy anon keys, never service role credentials', () => {
    expect(validateAccountConfig(config).origin).toBe(config.url);
    const jwt = (role: string) => `e30.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
    expect(validateAccountConfig({ ...config, publicKey: jwt('anon') }).origin).toBe(config.url);
    for (const publicKey of ['sb_secret_private_credentials', jwt('service_role'), 'invalid']) {
      expect(() => validateAccountConfig({ ...config, publicKey })).toThrow('Account: config');
    }
  });
  it.each(['http://example.test', 'https://secret@account.test', 'https://account.test?key=secret',
    'https://account.test/auth', 'file:///etc/passwd', 'https://account.test\n'])('rejects an unsafe endpoint without echoing it: %s', url => {
    expect(() => validateAccountConfig({ ...config, url })).toThrow('Account: config');
  });
});

describe('account transport and secrets', () => {
  it('stores only sessions in host secret storage, then checks user with the server', async () => {
    const saved = secrets();
    const fetcher = transport(json(session), json(user));
    const client = new AccountClient(config, saved.store, fetcher);
    expect((await client.signIn('test@example.test', 'private-password')).emailVerified).toBe(true);
    expect(saved.values.size).toBe(1);
    expect([...saved.values.values()][0]).not.toContain('private-password');
    expect(await client.user()).toMatchObject({ email: user.email, emailVerified: true });
    const request = fetcher.mock.calls[0];
    expect(String(request[0])).toBe(`${config.url}/auth/v1/token?grant_type=password`);
    expect(request[1]).toMatchObject({ redirect: 'error', credentials: 'omit', method: 'POST' });
    expect(fetcher.mock.calls[1][1]?.headers).toMatchObject({ Authorization: `Bearer ${session.access_token}` });
  });
  it('starts no network request merely by constructing an optional account client', async () => {
    const fetcher = transport();
    expect(await new AccountClient(config, secrets().store, fetcher).user()).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('keeps pending email signups signed out and verifies a supplied email code', async () => {
    const saved = secrets();
    const fetcher = transport(json({ ...user, identities: [] }), json(session));
    const client = new AccountClient(config, saved.store, fetcher);
    expect(await client.signUp(user.email, 'unique-password')).toBe('confirmation_required');
    expect(saved.values.size).toBe(0);
    expect((await client.verifyEmail(user.email, '123456')).emailVerified).toBe(true);
    expect(JSON.parse(fetcher.mock.calls[1][1]!.body as string)).toEqual({ email: user.email, token: '123456', type: 'email' });
  });
  it('removes local tokens even if remote sign-out cannot be confirmed', async () => {
    const saved = secrets();
    const client = new AccountClient(config, saved.store, transport(json(session), json({ error: 'offline' }, 503)));
    await client.signIn(user.email, 'password');
    await expect(client.signOut()).rejects.toMatchObject({ code: 'provider' });
    expect(saved.values.size).toBe(0);
  });
  it('isolates stored sessions between account endpoints', async () => {
    const saved = secrets();
    await new AccountClient(config, saved.store, transport(json(session))).signIn(user.email, 'password');
    const fetcher = transport();
    const other = new AccountClient({ ...config, url: 'https://other.example.test' }, saved.store, fetcher);
    expect(await other.user()).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('deduplicates refresh requests and persists the rotated refresh token', async () => {
    const saved = secrets();
    const fetcher = transport(json(session), json({ ...session, refresh_token: 'rotated-token' }), json(user), json(user));
    const client = new AccountClient(config, saved.store, fetcher);
    await client.signIn(user.email, 'password');
    const key = [...saved.values.keys()][0];
    saved.values.set(key, JSON.stringify({ ...JSON.parse(saved.values.get(key)!), expiresAt: 1 }));
    await Promise.all([client.user(), client.user()]);
    const refreshCalls = fetcher.mock.calls.filter(([url]) => String(url).includes('grant_type=refresh_token'));
    expect(refreshCalls).toHaveLength(1);
    expect(JSON.parse(saved.values.get(key)!).refreshToken).toBe('rotated-token');
  });
  it('does not reflect passwords, tokens or arbitrary provider errors', async () => {
    const client = new AccountClient(config, secrets().store, transport(json({ error_description: 'password=private-password token=private-token' }, 400)));
    await expect(client.signIn(user.email, 'private-password')).rejects.toMatchObject({ message: 'Account: credentials' });
  });
  it('rejects oversized responses and insecure inputs before persistence', async () => {
    const saved = secrets();
    const fetcher = transport(json({ padding: 'x'.repeat(300_000) }));
    const client = new AccountClient(config, saved.store, fetcher);
    await expect(client.signIn(user.email, 'password')).rejects.toMatchObject({ code: 'protocol' });
    await expect(client.signUp('invalid', 'password')).rejects.toMatchObject({ code: 'input' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(saved.values.size).toBe(0);
  });
  it('limits request time and turns network exceptions into non-sensitive errors', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options!.signal!.addEventListener('abort', () => reject(new Error('sensitive-url-password')));
    }));
    const client = new AccountClient(config, secrets().store, fetcher, 20);
    await expect(client.signIn(user.email, 'password')).rejects.toMatchObject({ code: 'timeout' });
  });
  it('requires confirmed email before sending an SMS', async () => {
    const unconfirmed = { ...user, email_confirmed_at: null };
    const fetcher = transport(json({ ...session, user: unconfirmed }), json(unconfirmed));
    const client = new AccountClient(config, secrets().store, fetcher);
    await client.signIn(user.email, 'password');
    await expect(client.requestPhoneVerification('+525512345678')).rejects.toMatchObject({ code: 'email_unconfirmed' });
    expect(fetcher.mock.calls.every(([, init]) => init?.method !== 'PUT')).toBe(true);
  });
  it('bounds a stalled stream even if its source ignores cancellation', async () => {
    const stalled = new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); }, cancel() { return new Promise(() => undefined); } }));
    const client = new AccountClient(config, secrets().store, transport(stalled), 25);
    await expect(client.signIn(user.email, 'password')).rejects.toMatchObject({ code: 'timeout' });
  });
  it('verifies a phone on the existing account with phone_change OTP', async () => {
    const phoneUser = { ...user, phone: '525512345678', phone_confirmed_at: '2026-01-01T00:00:00Z' };
    const fetcher = transport(json(session), json(user), json(user), json({ ...session, user: phoneUser }), json(phoneUser));
    const client = new AccountClient(config, secrets().store, fetcher);
    await client.signIn(user.email, 'password');
    await client.requestPhoneVerification('+525512345678');
    expect((await client.verifyPhone('+525512345678', '123456')).phoneVerified).toBe(true);
    expect(JSON.parse(fetcher.mock.calls[3][1]!.body as string)).toMatchObject({ phone: '+525512345678', type: 'phone_change' });
  });
});

describe('browser OAuth PKCE', () => {
  it('binds each callback to its private loopback path, then exchanges a code once with matching PKCE', async () => {
    const fetcher = transport(json(session));
    const client = new AccountClient(config, secrets().store, fetcher);
    let challenge = '';
    let callbackFailure: unknown;
    await signInWithBrowser(client, 'google', async link => { try {
      const authorize = new URL(link);
      challenge = authorize.searchParams.get('code_challenge')!;
      expect(authorize.searchParams.get('code_challenge_method')).toBe('s256');
      expect(authorize.searchParams.get('provider')).toBe('google');
      expect(link).not.toContain('private-');
      const redirect = new URL(authorize.searchParams.get('redirect_to')!);
      expect(redirect.hostname).toBe('127.0.0.1');
      const tampered = new URL(redirect); tampered.pathname += '-tampered'; tampered.searchParams.set('code', 'auth-code');
      expect((await fetch(tampered)).status).toBe(404);
      redirect.searchParams.set('code', 'auth-code');
      expect((await fetch(redirect)).status).toBe(200);
      return true;
    } catch (error) { callbackFailure = error; throw error; }
    }, { timeoutMs: 2_000 }).catch(error => { throw callbackFailure ?? error; });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
    expect(body.auth_code).toBe('auth-code');
    expect(createHash('sha256').update(body.code_verifier).digest('base64url')).toBe(challenge);
  });
  it('closes expired listeners without persisting a session', async () => {
    const fetcher = transport();
    let redirect = '';
    const client = new AccountClient(config, secrets().store, fetcher);
    await expect(signInWithBrowser(client, 'apple', async link => {
      redirect = new URL(link).searchParams.get('redirect_to')!;
      return true;
    }, { timeoutMs: 20 })).rejects.toMatchObject({ code: 'timeout' });
    await expect(fetch(`${redirect}?code=late`)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('cancels when the browser does not finish opening', async () => {
    const abort = new AbortController();
    const client = new AccountClient(config, secrets().store, transport());
    const timer = setTimeout(() => abort.abort(), 20);
    await expect(signInWithBrowser(client, 'google', () => new Promise(() => undefined), { signal: abort.signal }))
      .rejects.toMatchObject({ code: 'cancelled' });
    clearTimeout(timer);
  });
  it('still expires if callback arrives while the browser-opening promise hangs', async () => {
    const client = new AccountClient(config, secrets().store, transport());
    await expect(signInWithBrowser(client, 'google', async link => {
      const callback = new URL(new URL(link).searchParams.get('redirect_to')!);
      callback.searchParams.set('code', 'valid-code');
      await fetch(callback);
      return new Promise(() => undefined);
    }, { timeoutMs: 150 })).rejects.toMatchObject({ code: 'timeout' });
  });
  it('keeps concurrent browser flows separate and handles denial without reflecting text', async () => {
    const client = new AccountClient(config, secrets().store, transport());
    const paths: string[] = [];
    const attempt = (provider: 'google' | 'apple') => signInWithBrowser(client, provider, async link => {
      const callback = new URL(new URL(link).searchParams.get('redirect_to')!);
      paths.push(callback.pathname);
      callback.searchParams.set('error', 'sensitive-error-text');
      await fetch(callback);
      return true;
    }, { timeoutMs: 2_000 });
    const outcomes = await Promise.allSettled([attempt('google'), attempt('apple')]);
    expect(new Set(paths).size).toBe(2);
    for (const result of outcomes) {
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') expect(result.reason.message).toBe('Account: provider');
    }
  });
});
