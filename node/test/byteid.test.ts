import { describe, expect, it } from 'vitest';
import { ByteID, UVerify } from '../src/index';

describe('ByteID (formerly UVerify)', () => {
  it('is the same client under its new name', () => {
    expect(ByteID).toBe(UVerify);
    expect(new ByteID({ apiKey: 'uvk_test_x' }).environment).toBe('test');
  });
  it('reads BYTEID_API_KEY, and the older UVERIFY_API_KEY', () => {
    const saved = { b: process.env.BYTEID_API_KEY, u: process.env.UVERIFY_API_KEY };
    try {
      delete process.env.UVERIFY_API_KEY;
      process.env.BYTEID_API_KEY = 'uvk_live_new';
      expect(new ByteID().environment).toBe('live');
      delete process.env.BYTEID_API_KEY;
      process.env.UVERIFY_API_KEY = 'uvk_test_old';
      expect(new ByteID().environment).toBe('test');
    } finally {
      if (saved.b === undefined) delete process.env.BYTEID_API_KEY; else process.env.BYTEID_API_KEY = saved.b;
      if (saved.u === undefined) delete process.env.UVERIFY_API_KEY; else process.env.UVERIFY_API_KEY = saved.u;
    }
  });
});
