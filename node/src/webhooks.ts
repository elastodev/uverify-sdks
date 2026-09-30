import { createHmac, timingSafeEqual } from 'node:crypto';
import { UVerifySignatureError } from './errors.js';
import type { WebhookEvent } from './types.js';

/**
 * Verify a webhook and return its event. Pass the raw request body exactly as
 * received (a Buffer or string, not re-serialised JSON), the UVerify-Signature
 * header, and your endpoint's signing secret (whsec_…).
 *
 * Throws UVerifySignatureError if the signature doesn't match or the event is
 * older than `toleranceSeconds` (a replay). Deliveries can repeat: dedupe on
 * `event.id`.
 */
export function constructEvent<T = unknown>(rawBody: string | Buffer | Uint8Array, signatureHeader: string | string[] | undefined | null, secret: string, toleranceSeconds = 300): WebhookEvent<T> {
  const header = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!header) throw new UVerifySignatureError('Missing UVerify-Signature header.');
  if (!secret) throw new UVerifySignatureError('Missing webhook secret.');
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1 || !/^\d+$/.test(t)) throw new UVerifySignatureError('Malformed UVerify-Signature header.');
  const body = typeof rawBody === 'string' ? rawBody : Buffer.from(rawBody).toString('utf8');
  const expected = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(v1.length === expected.length ? v1 : '', 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UVerifySignatureError('Signature does not match. Check the secret and that you passed the raw body.');
  if (toleranceSeconds > 0 && Math.abs(Date.now() / 1000 - Number(t)) > toleranceSeconds) throw new UVerifySignatureError('Signature is too old (possible replay).');
  try {
    return JSON.parse(body) as WebhookEvent<T>;
  } catch {
    throw new UVerifySignatureError('Body is not JSON.');
  }
}

/** Sign a payload the way UVerify does, for your own tests. */
export function signPayload(body: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  return `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}
