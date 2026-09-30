import { describe, expect, it } from 'vitest';
import { isAllowed, parseMessage, parseRedirect } from '../src/events';

describe('messages from the hosted page', () => {
  it('reads liveness and verification-link results', () => {
    expect(parseMessage(JSON.stringify({ source: 'uverify', type: 'liveness.finished', session_id: 's1', status: 'passed' }))).toEqual({ type: 'liveness', sessionId: 's1', status: 'passed' });
    expect(parseMessage(JSON.stringify({ source: 'uverify', type: 'kyc.finished', id: 'k1', status: 'completed', outcome: 'verified' }))).toEqual({ type: 'kyc', id: 'k1', status: 'completed', outcome: 'verified' });
  });
  it('ignores anything else', () => {
    expect(parseMessage('not json')).toBeNull();
    expect(parseMessage(JSON.stringify({ type: 'liveness.finished', session_id: 's1' }))).toBeNull(); // no source
    expect(parseMessage(JSON.stringify({ source: 'uverify', type: 'other' }))).toBeNull();
  });
});

describe('redirects', () => {
  it('finishes on your redirect_url with its parameters', () => {
    expect(parseRedirect('https://yourapp.com/kyc/done?liveness_session_id=s1&status=passed&reference=a%20b', 'https://yourapp.com/kyc/done')).toEqual({
      type: 'redirect',
      url: 'https://yourapp.com/kyc/done?liveness_session_id=s1&status=passed&reference=a%20b',
      params: { liveness_session_id: 's1', status: 'passed', reference: 'a b' },
    });
    expect(parseRedirect('https://yourapp.com/kyc/done/?x=1', 'https://yourapp.com/kyc/done')).not.toBeNull();
  });
  it('ignores other pages', () => {
    expect(parseRedirect('https://uverify.com.ng/liveness/s1', 'https://yourapp.com/kyc/done')).toBeNull();
    expect(parseRedirect('https://yourapp.com/kyc/done', undefined)).toBeNull();
  });
});

describe('allowed hosts', () => {
  const hosts = ['uverify.com.ng'];
  it('allows UVerify over https only', () => {
    expect(isAllowed('https://uverify.com.ng/liveness/s1#tok', hosts)).toBe(true);
    expect(isAllowed('https://api.uverify.com.ng/v1/x', hosts)).toBe(true);
    expect(isAllowed('about:blank', hosts)).toBe(true);
    expect(isAllowed('http://uverify.com.ng/', hosts)).toBe(false);
    expect(isAllowed('https://evil-uverify.com.ng.attacker.io/', hosts)).toBe(false);
    expect(isAllowed('https://notuverify.com.ng/', hosts)).toBe(false);
  });
});
