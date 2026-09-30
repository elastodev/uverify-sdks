<?php

declare(strict_types=1);

namespace UVerify\Resources;

/**
 * Identity checks. Each takes an array of the documented fields: id_number,
 * first_name, last_name, dob, include_photo, reference, aml_screening,
 * aml_monitoring; face-match variants also take liveness_session_id or
 * selfie_image (base64, or \SplFileInfo for a file).
 */
final class Identity extends Resource
{
    /** @param array<string, mixed> $params @return array<string, mixed> */
    public function bvn(array $params): array { return $this->client->check('/identity/bvn', $params); }
    /** @param array<string, mixed> $params @return array<string, mixed> */
    public function bvnFaceMatch(array $params): array { return $this->client->check('/identity/bvn/face-match', $params); }
    /** @param array<string, mixed> $params @return array<string, mixed> */
    public function nin(array $params): array { return $this->client->check('/identity/nin', $params); }
    /** @param array<string, mixed> $params @return array<string, mixed> */
    public function ninFaceMatch(array $params): array { return $this->client->check('/identity/nin/face-match', $params); }
    /** @param array<string, mixed> $params @return array<string, mixed> */
    public function driversLicense(array $params): array { return $this->client->check('/identity/drivers-license', $params); }
    /** @param array<string, mixed> $params @return array<string, mixed> */
    public function driversLicenseFaceMatch(array $params): array { return $this->client->check('/identity/drivers-license/face-match', $params); }
    /** @param array<string, mixed> $params @return array<string, mixed> */
    public function votersCard(array $params): array { return $this->client->check('/identity/voters-card', $params); }
    /** @param array<string, mixed> $params @return array<string, mixed> */
    public function votersCardFaceMatch(array $params): array { return $this->client->check('/identity/voters-card/face-match', $params); }
    /** @param array<string, mixed> $params @return array<string, mixed> */
    public function tin(array $params): array { return $this->client->check('/identity/tin', $params); }
}
