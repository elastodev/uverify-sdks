import { describe, expect, it } from 'vitest';
import { Bytid, ByteID, UVerify } from '../src/index';

describe('Bytid (formerly UVerify, then ByteID)', () => {
  it('is the same client under each name', () => {
    expect(Bytid).toBe(UVerify);
    expect(ByteID).toBe(UVerify);
    expect(new Bytid({ apiKey: 'uvk_test_x' }).environment).toBe('test');
  });
  it('reads BYTID_API_KEY first, then BYTEID_API_KEY and UVERIFY_API_KEY', () => {
    const names = ['BYTID_API_KEY', 'BYTEID_API_KEY', 'UVERIFY_API_KEY'] as const;
    const saved = Object.fromEntries(names.map((n) => [n, process.env[n]]));
    try {
      process.env.BYTID_API_KEY = 'uvk_live_new';
      process.env.UVERIFY_API_KEY = 'uvk_test_old';
      expect(new Bytid().environment).toBe('live');
      delete process.env.BYTID_API_KEY;
      expect(new Bytid().environment).toBe('test');
    } finally {
      for (const n of names) if (saved[n] === undefined) delete process.env[n]; else process.env[n] = saved[n];
    }
  });
});
