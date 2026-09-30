/** Every API error. Branch on `code`: it's stable (https://uverify.com.ng/docs#responses). */
export class UVerifyError extends Error {
  /** e.g. validation_error, insufficient_balance, duplicate_reference, rate_limited. */
  readonly code: string;
  /** HTTP status (0 when the request never got a response). */
  readonly status: number;
  /** Quote this to UVerify support to trace the request. */
  readonly requestId: string | null;
  /** Field errors for validation_error; retry_after_seconds for rate_limited; … */
  readonly details: unknown;

  constructor(message: string, opts: { code: string; status: number; requestId?: string | null; details?: unknown }) {
    super(message);
    this.name = 'UVerifyError';
    this.code = opts.code;
    this.status = opts.status;
    this.requestId = opts.requestId ?? null;
    this.details = opts.details;
  }
}

/** The request didn't complete: timeout, DNS, connection reset. Safe to retry with the same reference. */
export class UVerifyConnectionError extends UVerifyError {
  constructor(message: string, cause?: unknown) {
    super(message, { code: 'connection_error', status: 0 });
    this.name = 'UVerifyConnectionError';
    if (cause) (this as { cause?: unknown }).cause = cause;
  }
}

/** A webhook failed signature or timestamp verification. Don't trust its body. */
export class UVerifySignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UVerifySignatureError';
  }
}
