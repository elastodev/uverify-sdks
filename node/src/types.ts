/** Anything that becomes base64 for an image field: a Buffer/Uint8Array, a base64 string, or a data: URL. */
export type ImageInput = Buffer | Uint8Array | string;

export type Environment = 'test' | 'live';

export interface Page<T> {
  items: T[];
  pagination: { page: number; per_page: number; total: number; total_pages: number };
}

export interface PageParams {
  page?: number;
  per_page?: number;
}

// ─── Identity & business checks ────────────────────────────────────────────

interface CheckBase {
  /** Your unique ID for the check. Generated for you when omitted; reusing one never charges twice. */
  reference?: string;
  /** When the record is found, screen it against the sanctions lists (billed per name). */
  aml_screening?: boolean;
  /** Screen as above and keep watching the names (billed monthly per name). */
  aml_monitoring?: boolean;
}

export interface PersonCheckParams extends CheckBase {
  id_number: string;
  first_name?: string;
  last_name?: string;
  /** YYYY-MM-DD, compared with the record. */
  dob?: string;
  /** Return the photo on the ID record (never stored by UVerify). */
  include_photo?: boolean;
}

/** BVN, driver's licence and voter's card need the person's names. */
export interface NamedCheckParams extends PersonCheckParams {
  first_name: string;
  last_name: string;
}

/** The face to match: a passed liveness session (recommended) or a selfie image. */
export type FaceInput = { liveness_session_id: string; selfie_image?: never } | { selfie_image: ImageInput; liveness_session_id?: never };

export interface CacCheckParams extends CheckBase {
  /** RC, BN or IT number, e.g. RC123456. */
  id_number: string;
  business_type?: string;
}

export interface AmlSummary {
  status: 'clear' | 'potential_match' | 'unavailable';
  reason?: string;
  screenings: { id: string; subject: 'person' | 'company' | 'director'; status: 'clear' | 'potential_match'; matches: number; monitor_id?: string | null }[];
}

export interface Verification {
  id: string;
  reference: string;
  type: 'bvn' | 'nin' | 'drivers_license' | 'voters_card' | 'tin' | 'cac';
  type_label: string;
  service: string;
  service_label: string;
  environment: Environment;
  /** verified (record found) · not_found · failed (registry unreachable; refunded) · pending. */
  status: 'pending' | 'verified' | 'not_found' | 'failed';
  message: string;
  id_number: string;
  field_matches: Record<string, boolean | null> | null;
  face_match: { status: 'matched' | 'not_matched' | 'unavailable'; score: number | null; liveness: 'passed' | 'not_checked'; liveness_session_id?: string; reason?: string } | null;
  duplicate_check: { status: 'clear' | 'returning' | 'other_id' | 'flagged'; matches: unknown[] } | null;
  aml_screening: AmlSummary | null;
  /** The record. Present on the check's response and on get(); lists leave it out. */
  data: Record<string, unknown> | null;
  photo?: string;
  data_deleted_at?: string;
  amount_charged: number;
  currency: 'NGN';
  created_at: string;
}

export interface ListVerificationsParams extends PageParams {
  type?: Verification['type'];
  service?: string;
  status?: Verification['status'];
  reference?: string;
}

// ─── Liveness ──────────────────────────────────────────────────────────────

export interface CreateLivenessParams {
  reference?: string;
  /** https URL to send the person to when they finish. */
  redirect_url?: string;
}

export interface LivenessSession {
  id: string;
  reference: string;
  environment: Environment;
  status: 'pending' | 'passed' | 'failed' | 'expired';
  live: boolean;
  score: number | null;
  reasons: string[];
  attempts: number;
  max_attempts: number;
  usable_for_face_match: boolean;
  used_by_verification_id: string | null;
  duplicates: { count: number; matches: unknown[] } | null;
  redirect_url: string | null;
  amount_charged: number;
  currency: 'NGN';
  expires_at: string;
  completed_at: string | null;
  created_at: string;
  /** Only when created: the hosted page to send the person to. */
  url?: string;
}

export interface SimulateLivenessParams {
  outcome: 'passed' | 'failed' | 'expired';
  /** Sandbox stand-in for a face: the same string on two sessions is the same person. */
  face?: string;
}

// ─── ID documents ──────────────────────────────────────────────────────────

export type DocumentType = 'nin_slip' | 'nin_card' | 'drivers_license' | 'voters_card' | 'passport';

export interface VerifyDocumentParams {
  front_image: ImageInput;
  back_image?: ImageInput;
  document_type?: DocumentType;
  liveness_session_id?: string;
  selfie_image?: ImageInput;
  /** Look the number up in the registry (billed as that lookup). Default true. */
  verify_with_registry?: boolean;
  reference?: string;
  /** Sandbox only: the result to act out. */
  sandbox_outcome?: 'verified' | 'unreadable' | 'expired' | 'tampered' | 'not_in_registry' | 'other_person' | 'face_mismatch';
}

export interface IdDocument {
  id: string;
  reference: string;
  environment: Environment;
  /** verified · review (a person should look) · rejected · failed (couldn't be checked; refunded). */
  status: 'verified' | 'review' | 'rejected' | 'failed';
  reasons: string[];
  document_type: DocumentType | 'other' | null;
  expected_type: DocumentType | null;
  id_number: string | null;
  checks: Record<string, unknown> | null;
  verification_id: string | null;
  liveness_session_id: string | null;
  /** What was read off the document (on verify and get). */
  extracted?: Record<string, unknown> | null;
  amount_charged: number;
  currency: 'NGN';
  created_at: string;
}

// ─── AML ───────────────────────────────────────────────────────────────────

export interface ScreenParams {
  /** Full name (a person needs at least two names), or an organisation's name. */
  name: string;
  entity_type?: 'person' | 'entity';
  /** YYYY-MM-DD or YYYY: sharpens matches. */
  date_of_birth?: string;
  nationality?: string;
  reference?: string;
  /** Keep watching this name after screening. */
  monitor?: boolean;
}

export interface AmlMatch {
  source: 'un' | 'ofac' | 'uk' | 'eu' | 'ng';
  source_label: string;
  list_id: string;
  kind: 'person' | 'entity';
  name: string;
  matched_name: string;
  score: number;
  date_of_birth: string[];
  dob_match: boolean | null;
  nationalities: string[];
  programs: string[];
  listed_on: string | null;
}

export interface AmlScreening {
  id: string;
  reference: string;
  environment: Environment;
  status: 'clear' | 'potential_match';
  entity_type: 'person' | 'entity';
  name: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  matches: AmlMatch[];
  lists_checked: { source: string; synced_at: string | null; entries: number }[];
  decision: 'cleared' | 'confirmed' | null;
  decision_note: string | null;
  decided_at: string | null;
  monitor_id?: string | null;
  amount_charged: number;
  currency: 'NGN';
  created_at: string;
}

export type MonitorParams = Omit<ScreenParams, 'monitor'>;

export interface AmlMonitor {
  id: string;
  reference: string;
  environment: Environment;
  status: 'active' | 'paused' | 'stopped';
  entity_type: 'person' | 'entity';
  name?: string | null;
  date_of_birth?: string | null;
  matches_known: number;
  last_screening_id: string | null;
  last_checked_at: string | null;
  verification_id: string | null;
  created_at: string;
  stopped_at: string | null;
}

export interface SanctionsList {
  source: string;
  label: string;
  publisher: string;
  url: string;
  status: 'ok' | 'error' | 'never';
  entries: number;
  synced_at: string | null;
}

// ─── Verification links (hosted KYC) ───────────────────────────────────────

export interface CreateKycLinkParams {
  reference?: string;
  /** IDs the customer may choose from. Default: bvn and nin. */
  id_types?: ('bvn' | 'nin' | 'drivers_license' | 'voters_card')[];
  customer_name?: string;
  customer_email?: string;
  redirect_url?: string;
  /** Also ask for a photo of their ID after the face check. */
  require_document?: boolean;
  aml_screening?: boolean;
  aml_monitoring?: boolean;
}

export interface KycLink {
  id: string;
  reference: string;
  environment: Environment;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'expired';
  outcome: 'verified' | 'face_mismatch' | 'face_unavailable' | 'not_found' | 'liveness_failed' | 'error' | 'document_rejected' | 'document_mismatch' | null;
  customer_name: string | null;
  customer_email: string | null;
  id_types: string[];
  id_type: string | null;
  id_number: string | null;
  attempts: number;
  verification: Verification | null;
  liveness: { id: string; status: string; score: number | null; attempts: number } | null;
  require_document: boolean;
  document: { id: string; status: string; reasons: string[]; document_type: string | null } | null;
  aml_screening?: boolean;
  aml_monitoring?: boolean;
  amount_charged: number;
  currency: 'NGN';
  redirect_url: string | null;
  expires_at: string;
  completed_at: string | null;
  created_at: string;
  /** Only when created: send this to the customer. */
  url?: string;
}

export interface ListKycLinksParams extends PageParams {
  status?: KycLink['status'];
  outcome?: NonNullable<KycLink['outcome']>;
  reference?: string;
}

// ─── Account ───────────────────────────────────────────────────────────────

export interface Balance {
  balance: number;
  currency: 'NGN';
  billing_mode?: 'prepaid' | 'postpaid';
  credit_limit?: number;
  available?: number;
  owed?: number;
}

export interface Price {
  check_type: string;
  label: string;
  default_price: number;
  custom_price: number | null;
  price: number;
  currency: 'NGN';
  is_enabled: boolean;
}

// ─── Webhooks ──────────────────────────────────────────────────────────────

export type WebhookEventType = 'verification.completed' | 'liveness.completed' | 'kyc.completed' | 'document.completed' | 'aml.match_found' | 'webhook.test';

export interface WebhookEvent<T = unknown> {
  /** Unique per event; deliveries can repeat, so dedupe on it. */
  id: string;
  type: WebhookEventType | string;
  created_at: string;
  environment: Environment;
  data: T;
}
