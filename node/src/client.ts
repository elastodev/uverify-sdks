import { randomBytes } from 'node:crypto';
import { UVerifyConnectionError, UVerifyError } from './errors.js';
import type {
  AmlMonitor,
  AmlScreening,
  Balance,
  CacCheckParams,
  CreateKycLinkParams,
  CreateLivenessParams,
  FaceInput,
  IdDocument,
  ImageInput,
  KycLink,
  ListKycLinksParams,
  ListVerificationsParams,
  LivenessSession,
  MonitorParams,
  NamedCheckParams,
  Page,
  PageParams,
  PersonCheckParams,
  Price,
  SanctionsList,
  ScreenParams,
  SimulateLivenessParams,
  Verification,
  VerifyDocumentParams,
} from './types.js';
import { constructEvent, signPayload } from './webhooks.js';

export const VERSION = '0.1.1';
const DEFAULT_BASE_URL = 'https://api.uverify.com.ng/v1';

export interface UVerifyOptions {
  /** uvk_test_… (sandbox, free) or uvk_live_…. Defaults to the UVERIFY_API_KEY environment variable. */
  apiKey?: string;
  /** Defaults to https://api.uverify.com.ng/v1. */
  baseUrl?: string;
  /** Per attempt. Face matches and ID documents can take several seconds. Default 60s. */
  timeoutMs?: number;
  /** Retries after a timeout, a connection error, a 5xx or a rate limit. Default 2. */
  maxRetries?: number;
  /** Bring your own fetch (tests, proxies). Defaults to the global fetch (Node 18+). */
  fetch?: typeof fetch;
}

interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
  /** Safe to repeat: GETs, and POSTs that carry a reference. */
  retryable?: boolean;
}

const IMAGE_FIELDS = ['selfie_image', 'front_image', 'back_image'] as const;
const newReference = (prefix: string) => `${prefix}_${randomBytes(9).toString('base64url')}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toBase64(v: ImageInput): string {
  return typeof v === 'string' ? v : Buffer.from(v).toString('base64');
}

/**
 * The UVerify API client.
 *
 * ```ts
 * import { UVerify } from '@uverifyng/node';
 * const uverify = new UVerify({ apiKey: process.env.UVERIFY_API_KEY });
 * const v = await uverify.identity.nin({ id_number: '12345678901' });
 * if (v.status === 'verified') { … }
 * ```
 */
export class UVerify {
  readonly identity: IdentityResource;
  readonly business: BusinessResource;
  readonly verifications: VerificationsResource;
  readonly liveness: LivenessResource;
  readonly documents: DocumentsResource;
  readonly aml: AmlResource;
  readonly kyc: KycResource;
  readonly account: AccountResource;
  static readonly webhooks = { constructEvent, signPayload };
  /** Verify webhook signatures. Also usable without a client: `UVerify.webhooks.constructEvent(…)`. */
  readonly webhooks = UVerify.webhooks;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: UVerifyOptions | string = {}) {
    const o = typeof options === 'string' ? { apiKey: options } : options;
    const key = o.apiKey ?? process.env.UVERIFY_API_KEY ?? '';
    if (!key) throw new Error('UVerify: pass an apiKey (uvk_test_… or uvk_live_…) or set UVERIFY_API_KEY.');
    this.apiKey = key;
    this.baseUrl = (o.baseUrl ?? process.env.UVERIFY_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = o.timeoutMs ?? 60_000;
    this.maxRetries = o.maxRetries ?? 2;
    this.fetchImpl = o.fetch ?? fetch;
    this.identity = new IdentityResource(this);
    this.business = new BusinessResource(this);
    this.verifications = new VerificationsResource(this);
    this.liveness = new LivenessResource(this);
    this.documents = new DocumentsResource(this);
    this.aml = new AmlResource(this);
    this.kyc = new KycResource(this);
    this.account = new AccountResource(this);
  }

  /** 'test' for a sandbox key, 'live' for a live one. */
  get environment(): 'test' | 'live' {
    return /_live_/.test(this.apiKey) ? 'live' : 'test';
  }

  /** @internal */
  async request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, opts: RequestOptions = {}): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    const body = opts.body ? JSON.stringify(Object.fromEntries(Object.entries(opts.body).filter(([, v]) => v !== undefined))) : undefined;
    const retryable = opts.retryable ?? method === 'GET';

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method,
          headers: {
            authorization: `Bearer ${this.apiKey}`,
            accept: 'application/json',
            'user-agent': `uverify-node/${VERSION} node/${process.version}`,
            ...(body ? { 'content-type': 'application/json' } : {}),
          },
          body,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (e) {
        if (retryable && attempt < this.maxRetries) {
          await sleep(backoff(attempt));
          continue;
        }
        const timedOut = (e as Error)?.name === 'TimeoutError';
        throw new UVerifyConnectionError(timedOut ? `UVerify didn't answer within ${this.timeoutMs}ms.` : `Couldn't reach UVerify: ${(e as Error).message}`, e);
      }

      const json = (await res.json().catch(() => null)) as { success?: boolean; data?: T; error?: { code: string; message: string; details?: unknown }; request_id?: string } | null;
      if (res.ok && json?.success !== false) return (json?.data ?? json) as T;

      const err = new UVerifyError(json?.error?.message ?? `UVerify returned HTTP ${res.status}.`, {
        code: json?.error?.code ?? (res.status >= 500 ? 'internal_error' : 'http_error'),
        status: res.status,
        requestId: json?.request_id ?? res.headers.get('x-request-id'),
        details: json?.error?.details,
      });
      const rateLimited = res.status === 429 && err.code === 'rate_limited';
      if (retryable && attempt < this.maxRetries && (rateLimited || (res.status >= 500 && res.status !== 501))) {
        const after = Number((err.details as { retry_after_seconds?: number } | undefined)?.retry_after_seconds);
        await sleep(rateLimited && after > 0 ? Math.min(after, 60) * 1000 : backoff(attempt));
        continue;
      }
      // A retry whose first attempt had in fact gone through: fetch that result instead of failing.
      if (attempt > 0 && err.code === 'duplicate_reference') throw Object.assign(err, { __duplicateOnRetry: true });
      throw err;
    }
  }

  /** @internal An identity/business check: always carries a reference, so it can be retried safely. */
  async check(path: string, params: object): Promise<Verification> {
    const body = { ...params, reference: (params as { reference?: string }).reference ?? newReference('sdk') } as Record<string, unknown>;
    for (const f of IMAGE_FIELDS) if (body[f] !== undefined) body[f] = toBase64(body[f] as ImageInput);
    try {
      return await this.request<Verification>('POST', path, { body, retryable: true });
    } catch (e) {
      if ((e as { __duplicateOnRetry?: boolean }).__duplicateOnRetry) {
        const found = await this.verifications.list({ reference: body.reference as string, per_page: 1 });
        if (found.items[0]) return this.verifications.get(found.items[0].id);
      }
      throw e;
    }
  }

  /** @internal A create that carries a reference (safe to retry). */
  async create<T>(path: string, params: object, prefix: string): Promise<T> {
    const body = { ...params, reference: (params as { reference?: string }).reference ?? newReference(prefix) } as Record<string, unknown>;
    for (const f of IMAGE_FIELDS) if (body[f] !== undefined) body[f] = toBase64(body[f] as ImageInput);
    return this.request<T>('POST', path, { body, retryable: true });
  }
}

/** 0.5s, 1s, 2s… with jitter. */
const backoff = (attempt: number) => Math.min(8000, 500 * 2 ** attempt) * (0.75 + Math.random() * 0.5);

class Resource {
  constructor(protected readonly client: UVerify) {}
}

class IdentityResource extends Resource {
  /** BVN lookup. Names are required by the registry. */
  bvn(params: PersonCheckParams) {
    return this.client.check('/identity/bvn', params);
  }
  /** BVN lookup + face match against the BVN photo. */
  bvnFaceMatch(params: PersonCheckParams & FaceInput) {
    return this.client.check('/identity/bvn/face-match', params);
  }
  nin(params: PersonCheckParams) {
    return this.client.check('/identity/nin', params);
  }
  ninFaceMatch(params: PersonCheckParams & FaceInput) {
    return this.client.check('/identity/nin/face-match', params);
  }
  driversLicense(params: NamedCheckParams) {
    return this.client.check('/identity/drivers-license', params);
  }
  driversLicenseFaceMatch(params: NamedCheckParams & FaceInput) {
    return this.client.check('/identity/drivers-license/face-match', params);
  }
  votersCard(params: NamedCheckParams) {
    return this.client.check('/identity/voters-card', params);
  }
  votersCardFaceMatch(params: NamedCheckParams & FaceInput) {
    return this.client.check('/identity/voters-card/face-match', params);
  }
  /** Tax ID lookup. */
  tin(params: { id_number: string; reference?: string }) {
    return this.client.check('/identity/tin', params);
  }
}

class BusinessResource extends Resource {
  /** CAC lookup: status, address, directors, owners. */
  cac(params: CacCheckParams) {
    return this.client.check('/business/cac', params);
  }
}

class VerificationsResource extends Resource {
  list(params: ListVerificationsParams = {}) {
    return this.client.request<Page<Verification>>('GET', '/verifications', { query: { ...params } });
  }
  /** One verification, with its record. */
  get(id: string) {
    return this.client.request<Verification>('GET', `/verifications/${encodeURIComponent(id)}`);
  }
}

class LivenessResource extends Resource {
  /** A hosted camera check. Send the person to `session.url`, then pass `session.id` to a face match. */
  createSession(params: CreateLivenessParams = {}) {
    return this.client.create<LivenessSession>('/liveness/sessions', params, 'lv');
  }
  getSession(id: string) {
    return this.client.request<LivenessSession>('GET', `/liveness/sessions/${encodeURIComponent(id)}`);
  }
  /** Sandbox only: finish a session without a camera. */
  simulate(id: string, params: SimulateLivenessParams) {
    return this.client.request<LivenessSession>('POST', `/liveness/sessions/${encodeURIComponent(id)}/simulate`, { body: { ...params } });
  }
}

class DocumentsResource extends Resource {
  /** Read and check a photo of an ID (NIN slip or card, licence, voter's card, passport). Images: Buffer or base64. */
  verify(params: VerifyDocumentParams) {
    return this.client.create<IdDocument>('/documents/verify', params, 'doc');
  }
  get(id: string) {
    return this.client.request<IdDocument>('GET', `/documents/${encodeURIComponent(id)}`);
  }
}

class AmlMonitorsResource extends Resource {
  /** Screen a name now and keep watching it (billed monthly). */
  create(params: MonitorParams) {
    return this.client.create<AmlMonitor>('/aml/monitors', params, 'amon');
  }
  list(params: PageParams & { status?: AmlMonitor['status'] } = {}) {
    return this.client.request<Page<AmlMonitor>>('GET', '/aml/monitors', { query: { ...params } });
  }
  get(id: string) {
    return this.client.request<AmlMonitor>('GET', `/aml/monitors/${encodeURIComponent(id)}`);
  }
  /** Stop watching a name. */
  stop(id: string) {
    return this.client.request<AmlMonitor>('DELETE', `/aml/monitors/${encodeURIComponent(id)}`, { retryable: true });
  }
}

class AmlResource extends Resource {
  readonly monitors = new AmlMonitorsResource(this.client);
  /** Screen a person or organisation against the UN, OFAC, UK, EU and Nigeria sanctions lists. */
  screen(params: ScreenParams) {
    return this.client.create<AmlScreening & { monitor_id?: string }>('/aml/screen', params, 'aml');
  }
  getScreening(id: string) {
    return this.client.request<AmlScreening>('GET', `/aml/screenings/${encodeURIComponent(id)}`);
  }
  /** The lists screened, and how fresh each is. */
  lists() {
    return this.client.request<SanctionsList[]>('GET', '/aml/lists');
  }
}

class KycResource extends Resource {
  /** A hosted verification link: send `link.url` to your customer. */
  createLink(params: CreateKycLinkParams = {}) {
    return this.client.create<KycLink>('/kyc/requests', params, 'kyc');
  }
  getLink(id: string) {
    return this.client.request<KycLink>('GET', `/kyc/requests/${encodeURIComponent(id)}`);
  }
  listLinks(params: ListKycLinksParams = {}) {
    return this.client.request<Page<KycLink>>('GET', '/kyc/requests', { query: { ...params } });
  }
}

class AccountResource extends Resource {
  balance() {
    return this.client.request<Balance>('GET', '/balance');
  }
  /** Your prices per check (custom prices included). */
  pricing() {
    return this.client.request<Price[]>('GET', '/pricing');
  }
}
