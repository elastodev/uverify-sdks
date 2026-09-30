<?php

declare(strict_types=1);

namespace UVerify\Resources;

final class Verifications extends Resource
{
    /** Filters: type, service, status, reference, page, per_page. @param array<string, mixed> $filters @return array<string, mixed> */
    public function list(array $filters = []): array { return $this->client->request('GET', '/verifications', $filters); }
    /** One verification, with its record. @return array<string, mixed> */
    public function get(string $id): array { return $this->client->request('GET', '/verifications/' . self::id($id)); }
}
