<?php

declare(strict_types=1);

namespace UVerify\Resources;

final class Documents extends Resource
{
    /** Read and check a photo of an ID. front_image is required (base64 or \SplFileInfo). @param array<string, mixed> $params @return array<string, mixed> */
    public function verify(array $params): array { return $this->client->create('/documents/verify', $params, 'doc'); }
    /** @return array<string, mixed> */
    public function get(string $id): array { return $this->client->request('GET', '/documents/' . self::id($id)); }
}
