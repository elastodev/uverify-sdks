<?php

declare(strict_types=1);

namespace UVerify;

/** @internal */
final class DuplicateOnRetry extends \RuntimeException
{
    public function __construct(public readonly UVerifyError $error)
    {
        parent::__construct($error->getMessage());
    }
}
