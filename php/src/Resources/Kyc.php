<?php

declare(strict_types=1);

namespace UVerify\Resources;

final class Kyc extends Resource
{
    /** A hosted verification link: send $link['url'] to your customer. @param array<string, mixed> $params @return array<string, mixed> */
    public function createLink(array $params = []): array { return $this->client->create('/kyc/requests', $params, 'kyc'); }
    /** @return array<string, mixed> */
    public function getLink(string $id): array { return $this->client->request('GET', '/kyc/requests/' . self::id($id)); }
    /** @param array<string, mixed> $filters @return array<string, mixed> */
    public function listLinks(array $filters = []): array { return $this->client->request('GET', '/kyc/requests', $filters); }
}
