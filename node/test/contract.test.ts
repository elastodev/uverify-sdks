import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UVerify } from '../src/index';

const { routes } = JSON.parse(readFileSync(new URL('../../contract/public-api.json', import.meta.url), 'utf8')) as { routes: string[] };

/** Call every SDK method once against a fake fetch and record which route each hits. */
async function routesTheSdkCovers() {
  const seen = new Set<string>();
  const fetch = (async (input: URL | string, init: RequestInit = {}) => {
    const u = new URL(String(input));
    seen.add(`${init.method} ${u.pathname.replace(/^\/v1/, '').replace(/\/id-x(?=\/|$)/, '/{id}')}`);
    return new Response(JSON.stringify({ success: true, data: { items: [], pagination: {} } }), { status: 200 });
  }) as unknown as typeof globalThis.fetch;
  const u = new UVerify({ apiKey: 'uvk_test_x', baseUrl: 'https://x/v1', fetch });
  const person = { id_number: '1', first_name: 'A', last_name: 'B' };
  const face = { ...person, liveness_session_id: 's' };
  await Promise.all([
    u.identity.bvn(person), u.identity.bvnFaceMatch(face), u.identity.nin(person), u.identity.ninFaceMatch(face),
    u.identity.driversLicense(person), u.identity.driversLicenseFaceMatch(face), u.identity.votersCard(person), u.identity.votersCardFaceMatch(face),
    u.identity.tin({ id_number: '1' }), u.business.cac({ id_number: 'RC1' }),
    u.verifications.list(), u.verifications.get('id-x'), u.account.balance(), u.account.pricing(),
    u.liveness.createSession(), u.liveness.getSession('id-x'), u.liveness.simulate('id-x', { outcome: 'passed' }),
    u.documents.verify({ front_image: 'x' }), u.documents.get('id-x'),
    u.aml.screen({ name: 'A B' }), u.aml.getScreening('id-x'), u.aml.lists(),
    u.aml.monitors.create({ name: 'A B' }), u.aml.monitors.list(), u.aml.monitors.get('id-x'), u.aml.monitors.stop('id-x'),
    u.kyc.createLink(), u.kyc.listLinks(), u.kyc.getLink('id-x'),
  ]);
  return seen;
}

describe('contract', () => {
  it('covers every public API route', async () => {
    const covered = await routesTheSdkCovers();
    expect(routes.filter((r) => !covered.has(r))).toEqual([]);
  });
});
