<?php

declare(strict_types=1);

namespace UVerify\Resources;

use UVerify\UVerify;

abstract class Resource
{
    public function __construct(protected readonly UVerify $client)
    {
    }

    protected static function id(string $id): string
    {
        return rawurlencode($id);
    }
}
