/**
 * A tiny UVerify API client, called straight from the app.
 *
 * DEMO ONLY. A real app must never hold an API key: anyone can pull it out of
 * the bundle. In production these calls belong on your server (use
 * @uverifyng/node, uverify for Python or uverify/uverify-php) and the app only
 * receives the session url.
 */
const BASE_URL = (process.env.EXPO_PUBLIC_UVERIFY_BASE_URL || 'https://api.uverify.com.ng/v1').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message: string, public code: string, public status: number, public details?: unknown) {
    super(message);
  }
}

export type LivenessSession = {
  id: string;
  url: string;
  status: 'pending' | 'passed' | 'failed' | 'expired';
  live: boolean;
  score: number | null;
  reasons: string[];
  attempts: number;
  max_attempts: number;
  usable_for_face_match: boolean;
  environment: 'test' | 'live';
};

export type FaceMatch = { status: 'matched' | 'not_matched' | 'unavailable'; score: number | null; reason?: string } | null;

export type Verification = {
  id: string;
  status: 'verified' | 'not_found' | 'failed' | 'error' | string;
  face_match: FaceMatch;
  field_matches: Record<string, boolean> | null;
  data: Record<string, unknown> | null;
};

export type KycLink = {
  id: string;
  url: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'expired';
  outcome: string | null;
  id_type: string | null;
  verification: Verification | null;
};

const reference = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

export function createClient(apiKey: string) {
  async function request<T>(method: 'GET' | 'POST', path: string, body?: object): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${apiKey}`,
          accept: 'application/json',
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(`Couldn't reach ${BASE_URL}. Check your connection.`, 'connection_error', 0);
    }
    const json = await res.json().catch(() => null);
    if (res.ok && json?.success !== false) return (json && 'data' in json ? json.data : json) as T;
    const e = json?.error ?? {};
    throw new ApiError(e.message ?? `UVerify returned HTTP ${res.status}.`, e.code ?? 'http_error', res.status, e.details);
  }

  return {
    environment: apiKey.includes('_live_') ? 'live' : 'test',

    createSession: (redirectUrl: string) =>
      request<LivenessSession>('POST', '/liveness/sessions', { reference: reference('demo_lv'), redirect_url: redirectUrl }),
    getSession: (id: string) => request<LivenessSession>('GET', `/liveness/sessions/${encodeURIComponent(id)}`),
    /** Sandbox only: finish a session without a camera. */
    simulate: (id: string, outcome: 'passed' | 'failed' = 'passed') =>
      request<LivenessSession>('POST', `/liveness/sessions/${encodeURIComponent(id)}/simulate`, { outcome }),

    faceMatch: (p: { idType: 'nin' | 'bvn'; idNumber: string; firstName: string; lastName: string; sessionId: string }) =>
      request<Verification>('POST', `/identity/${p.idType}/face-match`, {
        reference: reference('demo_fm'),
        id_number: p.idNumber,
        first_name: p.firstName || undefined,
        last_name: p.lastName || undefined,
        liveness_session_id: p.sessionId,
      }),

    createLink: (customerName: string, redirectUrl: string) =>
      request<KycLink>('POST', '/kyc/requests', { reference: reference('demo_kyc'), customer_name: customerName || undefined, redirect_url: redirectUrl }),
    getLink: (id: string) => request<KycLink>('GET', `/kyc/requests/${encodeURIComponent(id)}`),
  };
}

export type Client = ReturnType<typeof createClient>;
