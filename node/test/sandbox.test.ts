/**
 * The real API, in sandbox (free). Runs only with a sandbox key:
 *   UVERIFY_TEST_KEY=uvk_test_… npx vitest run test/sandbox.test.ts
 * Optionally UVERIFY_BASE_URL (default https://api.uverify.com.ng/v1).
 */
import { describe, expect, it } from 'vitest';
import { UVerify, UVerifyError } from '../src/index';

const key = process.env.UVERIFY_TEST_KEY;
const run = key?.startsWith('uvk_test_') ? describe : describe.skip;
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');

run('sandbox (real API)', () => {
  let client: UVerify | undefined;
  // Created on first use: describe.skip still runs this block, without a key.
  const u = new Proxy({} as UVerify, { get: (_, p) => ((client ??= new UVerify({ apiKey: key!, baseUrl: process.env.UVERIFY_BASE_URL })) as any)[p] });

  it('NIN lookup: found, and not found for …00', async () => {
    expect((await u.identity.nin({ id_number: '12345678942' })).status).toBe('verified');
    expect((await u.identity.nin({ id_number: '12345678900' })).status).toBe('not_found');
  });

  it('liveness → face match', async () => {
    const s = await u.liveness.createSession();
    expect(s.url).toMatch(/\/liveness\//);
    await u.liveness.simulate(s.id, { outcome: 'passed' });
    const v = await u.identity.ninFaceMatch({ id_number: '12345678942', liveness_session_id: s.id });
    expect(v.face_match?.status).toBe('matched');
    expect(v.face_match?.liveness).toBe('passed');
  });

  it('ID document, AML, verification link, account', async () => {
    expect((await u.documents.verify({ front_image: JPEG, document_type: 'nin_card' })).status).toBe('verified');
    expect((await u.aml.screen({ name: 'Adaeze Okafor' })).status).toBe('clear');
    const link = await u.kyc.createLink({ customer_name: 'SDK Test' });
    expect((await u.kyc.getLink(link.id)).status).toBe('pending');
    expect(typeof (await u.account.balance()).balance).toBe('number');
    expect((await u.account.pricing()).length).toBeGreaterThan(5);
  });

  it('validation errors come back as UVerifyError', async () => {
    const e = await u.identity.nin({ id_number: 'abc' }).catch((x) => x);
    expect(e).toBeInstanceOf(UVerifyError);
    expect(e.code).toBe('validation_error');
  });
});
