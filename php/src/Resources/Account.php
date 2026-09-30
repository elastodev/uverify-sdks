<?php

declare(strict_types=1);

namespace UVerify\Resources;

final class Account extends Resource
{
    /** @return array<string, mixed> */
    public function balance(): array { return $this->client->request('GET', '/balance'); }
    /** @return array<int, array<string, mixed>> */
    public function pricing(): array { return $this->client->request('GET', '/pricing'); }
}
