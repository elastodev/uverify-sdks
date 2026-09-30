<?php

declare(strict_types=1);

namespace UVerify\Resources;

final class Business extends Resource
{
    /** CAC lookup. aml_screening => true screens the company and each director. @param array<string, mixed> $params @return array<string, mixed> */
    public function cac(array $params): array { return $this->client->check('/business/cac', $params); }
}
