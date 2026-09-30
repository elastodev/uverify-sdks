<?php

declare(strict_types=1);

namespace UVerify;

/** The request didn't complete (timeout, DNS, connection reset). Safe to retry with the same reference. */
class UVerifyConnectionError extends UVerifyError
{
    public function __construct(string $message)
    {
        parent::__construct($message, 'connection_error', 0);
    }
}
