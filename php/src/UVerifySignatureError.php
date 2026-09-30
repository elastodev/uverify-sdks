<?php

declare(strict_types=1);

namespace UVerify;

/** A webhook failed signature or timestamp verification. Don't trust its body. */
class UVerifySignatureError extends \RuntimeException
{
}
