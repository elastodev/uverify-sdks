import { describe, expect, it } from 'vitest';
import { UVerify, UVerifyConnectionError, UVerifyError, UVerifySignatureError, constructEvent, signPayload } from '../src/index';

type Call = { url: URL; init: RequestInit; body: any };

/** A fake fetch that answers from a list of handlers, in order, recording each call. */
function fakeFetch(...handlers: ((c: Call) => Response | Promise<Response> | 'network-error' | 'hang')[]) {
  const calls: Call[] = [];
  const fn = (async (input: URL | string, init: RequestInit = {}) => {
    const call = { url: new URL(String(input)), init, body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const h = handlers[Math.min(calls.length - 1, handlers.length - 1)];
    const r = await h(call);
    if (r === 'network-error') throw new TypeError('fetch failed');
    if (r === 'hang') {
      return new Promise<Response>((_, reject) => init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' }))));
    }
    return r;
  }) as unknown as typeof fetch;
  return { fn, calls };
}
const ok = (data: unknown, status = 200) => new Response(JSON.stringify({ success: true, data, request_id: 'req_1' }), { status, headers: { 'content-type': 'application/json' } });
const fail = (status: number, code: string, message = 'nope', details?: unknown) =>
  new Response(JSON.stringify({ success: false, error: { code, message, details }, request_id: 'req_err' }), { status, headers: { 'content-type': 'application/json' } });

const client = (f: typeof fetch, extra = {}) => new UVerify({ apiKey: 'uvk_test_abc', baseUrl: 'https://api.test/v1', fetch: f, ...extra });

describe('requests', () => {
  it('authenticates, sets a reference, and unwraps data', async () => {
    const { fn, calls } = fakeFetch(() => ok({ id: 'v1', status: 'verified' }));
    const v = await client(fn).identity.nin({ id_number: '12345678901' });
    expect(v).toEqual({ id: 'v1', status: 'verified' });
    expect(calls[0].url.pathname).toBe('/v1/identity/nin');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer uvk_test_abc');
    expect((calls[0].init.headers as Record<string, string>)['user-agent']).toMatch(/^uverify-node\//);
    expect(calls[0].body.reference).toMatch(/^sdk_/);
  });

  it('keeps your own reference and drops undefined fields', async () => {
    const { fn, calls } = fakeFetch(() => ok({}));
    await client(fn).identity.bvn({ id_number: '22212345678', first_name: 'Ada', last_name: 'Okafor', reference: 'mine-1', dob: undefined });
    expect(calls[0].body).toEqual({ id_number: '22212345678', first_name: 'Ada', last_name: 'Okafor', reference: 'mine-1' });
  });

  it('turns Buffer images into base64', async () => {
    const { fn, calls } = fakeFetch(() => ok({}));
    await client(fn).identity.ninFaceMatch({ id_number: '12345678901', selfie_image: Buffer.from('jpeg-bytes') });
    await client(fn).documents.verify({ front_image: new Uint8Array([1, 2, 3]), back_image: 'already-base64' });
    expect(calls[0].body.selfie_image).toBe(Buffer.from('jpeg-bytes').toString('base64'));
    expect(calls[1].body.front_image).toBe('AQID');
    expect(calls[1].body.back_image).toBe('already-base64');
  });

  it('builds list queries', async () => {
    const { fn, calls } = fakeFetch(() => ok({ items: [], pagination: {} }));
    await client(fn).verifications.list({ status: 'verified', page: 2 });
    expect(calls[0].url.search).toBe('?status=verified&page=2');
  });

  it('knows its environment from the key', () => {
    expect(new UVerify('uvk_live_x').environment).toBe('live');
    expect(new UVerify('uvk_test_x').environment).toBe('test');
  });

  it('needs a key', () => {
    const was = process.env.UVERIFY_API_KEY;
    delete process.env.UVERIFY_API_KEY;
    expect(() => new UVerify({})).toThrow(/apiKey/);
    if (was) process.env.UVERIFY_API_KEY = was;
  });
});

describe('errors', () => {
  it('raises UVerifyError with the stable code, status, request id and details', async () => {
    const { fn } = fakeFetch(() => fail(400, 'validation_error', 'One or more fields are invalid.', ['id_number must be the 11-digit NIN']));
    const e = await client(fn).identity.nin({ id_number: 'x' }).catch((x) => x);
    expect(e).toBeInstanceOf(UVerifyError);
    expect(e).toMatchObject({ code: 'validation_error', status: 400, requestId: 'req_err', details: ['id_number must be the 11-digit NIN'] });
  });

  it('does not retry a 4xx', async () => {
    const { fn, calls } = fakeFetch(() => fail(402, 'insufficient_balance'));
    await expect(client(fn).identity.nin({ id_number: '1' })).rejects.toMatchObject({ code: 'insufficient_balance' });
    expect(calls).toHaveLength(1);
  });
});

describe('retries', () => {
  it('retries a 5xx, then succeeds, with the same reference', async () => {
    const { fn, calls } = fakeFetch(() => fail(503, 'internal_error'), () => ok({ id: 'v1' }));
    expect(await client(fn).identity.nin({ id_number: '1' })).toEqual({ id: 'v1' });
    expect(calls).toHaveLength(2);
    expect(calls[1].body.reference).toBe(calls[0].body.reference);
  });

  it('waits out a rate limit', async () => {
    const { fn, calls } = fakeFetch(() => fail(429, 'rate_limited', 'slow down', { retry_after_seconds: 0 }), () => ok({ balance: 5 }));
    expect(await client(fn).account.balance()).toEqual({ balance: 5 });
    expect(calls).toHaveLength(2);
  });

  it('recovers when the first attempt went through but its answer was lost', async () => {
    const { fn, calls } = fakeFetch(
      () => 'network-error',
      () => fail(409, 'duplicate_reference'),
      (c) => (c.url.pathname === '/v1/verifications' ? ok({ items: [{ id: 'v9' }], pagination: {} }) : fail(500, 'x')),
      (c) => (c.url.pathname === '/v1/verifications/v9' ? ok({ id: 'v9', status: 'verified', data: { first_name: 'ADA' } }) : fail(500, 'x')),
    );
    const v = await client(fn).identity.nin({ id_number: '1' });
    expect(v).toMatchObject({ id: 'v9', data: { first_name: 'ADA' } });
    expect(calls[2].url.searchParams.get('reference')).toBe(calls[0].body.reference);
  });

  it('gives up after maxRetries with a connection error', async () => {
    const { fn, calls } = fakeFetch(() => 'network-error');
    await expect(client(fn, { maxRetries: 1 }).identity.nin({ id_number: '1' })).rejects.toBeInstanceOf(UVerifyConnectionError);
    expect(calls).toHaveLength(2);
  });

  it('never retries a POST that could act twice (simulate)', async () => {
    const { fn, calls } = fakeFetch(() => fail(500, 'internal_error'));
    await expect(client(fn).liveness.simulate('s1', { outcome: 'passed' })).rejects.toMatchObject({ status: 500 });
    expect(calls).toHaveLength(1);
  });

  it('times out', async () => {
    const { fn } = fakeFetch(() => 'hang');
    const e = await client(fn, { timeoutMs: 20, maxRetries: 0 }).account.balance().catch((x) => x);
    expect(e).toBeInstanceOf(UVerifyConnectionError);
    expect(e.message).toMatch(/20ms/);
  });
});

describe('webhooks', () => {
  const secret = 'whsec_test123';
  const body = JSON.stringify({ id: 'evt_1', type: 'verification.completed', created_at: '2026-09-30T10:00:00Z', environment: 'live', data: { id: 'v1' } });

  it('accepts a correctly signed event', () => {
    const e = constructEvent(body, signPayload(body, secret), secret);
    expect(e).toMatchObject({ id: 'evt_1', type: 'verification.completed', data: { id: 'v1' } });
    expect(UVerify.webhooks.constructEvent(Buffer.from(body), signPayload(body, secret), secret).id).toBe('evt_1');
  });

  it('rejects a tampered body, a wrong secret, a missing or malformed header, and a replay', () => {
    const sig = signPayload(body, secret);
    expect(() => constructEvent(body.replace('v1', 'v2'), sig, secret)).toThrow(UVerifySignatureError);
    expect(() => constructEvent(body, sig, 'whsec_other')).toThrow(UVerifySignatureError);
    expect(() => constructEvent(body, undefined, secret)).toThrow(/Missing/);
    expect(() => constructEvent(body, 'v1=abc', secret)).toThrow(/Malformed/);
    const old = signPayload(body, secret, Math.floor(Date.now() / 1000) - 3600);
    expect(() => constructEvent(body, old, secret)).toThrow(/too old/);
    expect(constructEvent(body, old, secret, 0).id).toBe('evt_1'); // tolerance 0 = don't check age
  });

  it('matches the server’s signing byte for byte', async () => {
    // What the UVerify server computes: HMAC-SHA256(secret, `${t}.${rawBody}`), hex.
    const { createHmac } = await import('node:crypto');
    const t = 1790590000;
    expect(signPayload(body, secret, t)).toBe(`t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`);
  });
});
