<?php

declare(strict_types=1);

namespace UVerify\Resources;

final class Liveness extends Resource
{
    /** A hosted camera check: send the person to $session['url']. @param array<string, mixed> $params @return array<string, mixed> */
    public function createSession(array $params = []): array { return $this->client->create('/liveness/sessions', $params, 'lv'); }
    /** @return array<string, mixed> */
    public function getSession(string $id): array { return $this->client->request('GET', '/liveness/sessions/' . self::id($id)); }
    /** Sandbox only: finish a session without a camera. @param array{outcome: string, face?: string} $params @return array<string, mixed> */
    public function simulate(string $id, array $params): array { return $this->client->request('POST', '/liveness/sessions/' . self::id($id) . '/simulate', [], $params); }
}
