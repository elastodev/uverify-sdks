<?php

declare(strict_types=1);

namespace UVerify;

/** Every API error. Branch on $e->code: it's stable (https://uverify.com.ng/docs#responses). */
class UVerifyError extends \RuntimeException
{
    public function __construct(
        string $message,
        /** e.g. validation_error, insufficient_balance, duplicate_reference, rate_limited */
        public readonly string $errorCode,
        /** HTTP status (0 when no response arrived) */
        public readonly int $status,
        /** Quote this to UVerify support to trace the request */
        public readonly ?string $requestId = null,
        /** Field errors for validation_error; retry_after_seconds for rate_limited; ... */
        public readonly mixed $details = null,
    ) {
        parent::__construct($message);
    }
}
