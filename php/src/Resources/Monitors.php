<?php

declare(strict_types=1);

namespace UVerify\Resources;

final class Monitors extends Resource
{
    /** Screen a name now and keep watching it (billed monthly). @param array<string, mixed> $params @return array<string, mixed> */
    public function create(array $params): array { return $this->client->create('/aml/monitors', $params, 'amon'); }
    /** @param array<string, mixed> $filters @return array<string, mixed> */
    public function list(array $filters = []): array { return $this->client->request('GET', '/aml/monitors', $filters); }
    /** @return array<string, mixed> */
    public function get(string $id): array { return $this->client->request('GET', '/aml/monitors/' . self::id($id)); }
    /** Stop watching a name. @return array<string, mixed> */
    public function stop(string $id): array { return $this->client->request('DELETE', '/aml/monitors/' . self::id($id), [], null, true); }
}
