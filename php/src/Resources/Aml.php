<?php

declare(strict_types=1);

namespace UVerify\Resources;

use UVerify\UVerify;

final class Aml extends Resource
{
    public readonly Monitors $monitors;

    public function __construct(UVerify $client)
    {
        parent::__construct($client);
        $this->monitors = new Monitors($client);
    }

    /** Screen a person or organisation (entity_type => 'entity') against the UN, OFAC, UK, EU and Nigeria lists. @param array<string, mixed> $params @return array<string, mixed> */
    public function screen(array $params): array { return $this->client->create('/aml/screen', $params, 'aml'); }
    /** @return array<string, mixed> */
    public function getScreening(string $id): array { return $this->client->request('GET', '/aml/screenings/' . self::id($id)); }
    /** @return array<int, array<string, mixed>> */
    public function lists(): array { return $this->client->request('GET', '/aml/lists'); }
}
