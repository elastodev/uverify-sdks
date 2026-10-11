/**
 * Pure logic, shared by the component and its tests: what the hosted page
 * tells the app, and how a redirect back to your site is read.
 */
export type UVerifyResult =
  | { type: 'liveness'; sessionId: string; status: 'passed' | 'failed' | 'expired' }
  | { type: 'kyc'; id: string; status: string; outcome: string | null }
  /** An address link: fetch it on your server for the distance and details. */
  | { type: 'address'; id: string; status: 'completed' | 'expired'; result: 'verified' | 'partial' | 'failed' | null }
  | { type: 'redirect'; url: string; params: Record<string, string> };

/** The hosted page's "finished" message (posted by byteid.ng or uverify.com.ng), or null if it's something else. */
export function parseMessage(data: string): UVerifyResult | null {
  let m: any;
  try {
    m = JSON.parse(data);
  } catch {
    return null;
  }
  // 'uverify' is what the hosted pages send (unchanged by the ByteID rename, so older SDKs keep working).
  if (m?.source !== 'uverify' && m?.source !== 'byteid') return null;
  if (m.type === 'liveness.finished' && typeof m.session_id === 'string') return { type: 'liveness', sessionId: m.session_id, status: m.status };
  if (m.type === 'kyc.finished' && typeof m.id === 'string') return { type: 'kyc', id: m.id, status: m.status, outcome: m.outcome ?? null };
  if (m.type === 'address.finished' && typeof m.id === 'string') return { type: 'address', id: m.id, status: m.status, result: m.result ?? null };
  return null;
}

/** The page is sending the person back to your redirect_url: finish with its query parameters. */
export function parseRedirect(url: string, redirectUrl: string | undefined): UVerifyResult | null {
  if (!redirectUrl) return null;
  const strip = (u: string) => u.split('?')[0].split('#')[0].replace(/\/+$/, '');
  if (strip(url) !== strip(redirectUrl)) return null;
  const params: Record<string, string> = {};
  const q = url.split('#')[0].split('?')[1] ?? '';
  for (const pair of q.split('&').filter(Boolean)) {
    const [k, v = ''] = pair.split('=');
    params[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  return { type: 'redirect', url, params };
}

/** An address link (/address/<id>) needs the phone's location; everything else needs the camera. */
export function needsLocation(url: string): boolean {
  return /^https:\/\/[^/]+\/address\//i.test(url);
}

/** Only UVerify's pages (and about:blank) load in the view; anything else is refused. */
export function isAllowed(url: string, hosts: string[]): boolean {
  if (url === 'about:blank') return true;
  const m = url.match(/^https:\/\/([^/?#:]+)/i);
  return !!m && hosts.some((h) => m[1].toLowerCase() === h || m[1].toLowerCase().endsWith(`.${h}`));
}
