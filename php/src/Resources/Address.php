<?php

declare(strict_types=1);

namespace UVerify\Resources;

final class Address extends Resource
{
    /** Is the address real, and in the LGA and state given? Found on the map and scored. @param array{address: string, state: string, lga?: string, reference?: string, sandbox_outcome?: string} $params @return array<string, mixed> */
    public function verify(array $params): array { return $this->client->create('/address/verify', $params, 'addr'); }
    /** @return array<string, mixed> */
    public function getCheck(string $id): array { return $this->client->request('GET', '/address/checks/' . self::id($id)); }
    /** @param array<string, mixed> $filters @return array<string, mixed> */
    public function listChecks(array $filters = []): array { return $this->client->request('GET', '/address/checks', $filters); }
    /** A link the customer opens at home to share their phone's location: send them $link['url']. @param array{address: string, state: string, lga?: string, customer_name?: string, redirect_url?: string, require_document?: bool, reference?: string, sandbox_outcome?: string} $params @return array<string, mixed> */
    public function createLink(array $params): array { return $this->client->create('/address/links', $params, 'addrl'); }
    /** @return array<string, mixed> */
    public function getLink(string $id): array { return $this->client->request('GET', '/address/links/' . self::id($id)); }
    /** @param array<string, mixed> $filters @return array<string, mixed> */
    public function listLinks(array $filters = []): array { return $this->client->request('GET', '/address/links', $filters); }
    /** A utility bill, bank statement or tenancy agreement, checked for the customer's name, the address, its date and editing. Images: base64, or use UVerify::imageFile(). @param array{front_image: string, address: string, state: string, back_image?: string, lga?: string, name?: string, max_age_days?: int, reference?: string, sandbox_outcome?: string} $params @return array<string, mixed> */
    public function verifyDocument(array $params): array { return $this->client->create('/address/documents', $params, 'addrd'); }
    /** @return array<string, mixed> */
    public function getDocument(string $id): array { return $this->client->request('GET', '/address/documents/' . self::id($id)); }
    /** @param array<string, mixed> $filters @return array<string, mixed> */
    public function listDocuments(array $filters = []): array { return $this->client->request('GET', '/address/documents', $filters); }
    /** Sandbox only: finish a link without a phone. @param array{outcome: string} $params @return array<string, mixed> */
    public function simulateLink(string $id, array $params): array { return $this->client->request('POST', '/address/links/' . self::id($id) . '/simulate', [], $params); }
}
