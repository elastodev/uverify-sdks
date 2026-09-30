<?php

declare(strict_types=1);

namespace UVerify;

/**
 * The UVerify API client.
 *
 *   $uverify = new \UVerify\UVerify('uvk_test_...');
 *   $v = $uverify->identity->nin(['id_number' => '12345678901']);
 *   if ($v['status'] === 'verified') { ... }
 */
final class UVerify
{
    public const VERSION = '0.1.0';
    private const DEFAULT_BASE_URL = 'https://api.uverify.com.ng/v1';
    private const IMAGE_FIELDS = ['selfie_image', 'front_image', 'back_image'];

    public readonly Resources\Identity $identity;
    public readonly Resources\Business $business;
    public readonly Resources\Verifications $verifications;
    public readonly Resources\Liveness $liveness;
    public readonly Resources\Documents $documents;
    public readonly Resources\Aml $aml;
    public readonly Resources\Kyc $kyc;
    public readonly Resources\Account $account;

    private string $apiKey;
    private string $baseUrl;
    /** @var callable(string, string, array<string,string>, ?string, float): array{0:int,1:array<string,string>,2:string} */
    private $transport;

    /**
     * @param array{base_url?: string, timeout?: float, max_retries?: int, transport?: callable} $options
     */
    public function __construct(?string $apiKey = null, array $options = [])
    {
        $key = $apiKey ?? (getenv('UVERIFY_API_KEY') ?: '');
        if ($key === '') {
            throw new \InvalidArgumentException('UVerify: pass an API key (uvk_test_... or uvk_live_...) or set UVERIFY_API_KEY.');
        }
        $this->apiKey = $key;
        $this->baseUrl = rtrim($options['base_url'] ?? (getenv('UVERIFY_BASE_URL') ?: self::DEFAULT_BASE_URL), '/');
        $this->timeout = (float) ($options['timeout'] ?? 60.0);
        $this->maxRetries = (int) ($options['max_retries'] ?? 2);
        $this->transport = $options['transport'] ?? [self::class, 'curlTransport'];
        $this->identity = new Resources\Identity($this);
        $this->business = new Resources\Business($this);
        $this->verifications = new Resources\Verifications($this);
        $this->liveness = new Resources\Liveness($this);
        $this->documents = new Resources\Documents($this);
        $this->aml = new Resources\Aml($this);
        $this->kyc = new Resources\Kyc($this);
        $this->account = new Resources\Account($this);
    }

    private float $timeout;
    private int $maxRetries;
    /** @internal set in tests to skip real waits */
    public static bool $sleep = true;

    /** 'test' for a sandbox key, 'live' for a live one. */
    public function environment(): string
    {
        return str_contains($this->apiKey, '_live_') ? 'live' : 'test';
    }

    /**
     * @internal
     * @param array<string, mixed> $query
     * @param array<string, mixed>|null $body
     * @return mixed
     */
    public function request(string $method, string $path, array $query = [], ?array $body = null, ?bool $retryable = null)
    {
        $url = $this->baseUrl . $path;
        $query = array_filter($query, fn ($v) => $v !== null);
        foreach ($query as $k => $v) {
            if (is_bool($v)) {
                $query[$k] = $v ? 'true' : 'false';
            }
        }
        if ($query) {
            $url .= '?' . http_build_query($query);
        }
        $payload = $body === null ? null : json_encode(array_filter($body, fn ($v) => $v !== null), JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        $headers = [
            'authorization' => 'Bearer ' . $this->apiKey,
            'accept' => 'application/json',
            'user-agent' => 'uverify-php/' . self::VERSION . ' php/' . PHP_VERSION,
        ];
        if ($payload !== null) {
            $headers['content-type'] = 'application/json';
        }
        $canRetry = $retryable ?? ($method === 'GET');

        for ($attempt = 0; ; $attempt++) {
            try {
                [$status, $respHeaders, $raw] = ($this->transport)($method, $url, $headers, $payload, $this->timeout);
            } catch (\Throwable $e) {
                if ($canRetry && $attempt < $this->maxRetries) {
                    $this->wait(self::backoff($attempt));
                    continue;
                }
                throw new UVerifyConnectionError("Couldn't reach UVerify: " . $e->getMessage());
            }
            $json = json_decode($raw, true);
            if ($status >= 200 && $status < 300 && !(is_array($json) && ($json['success'] ?? true) === false)) {
                return is_array($json) && array_key_exists('data', $json) ? $json['data'] : $json;
            }
            $e = is_array($json) ? ($json['error'] ?? []) : [];
            $err = new UVerifyError(
                $e['message'] ?? "UVerify returned HTTP {$status}.",
                $e['code'] ?? ($status >= 500 ? 'internal_error' : 'http_error'),
                $status,
                is_array($json) ? ($json['request_id'] ?? null) : ($respHeaders['x-request-id'] ?? null),
                $e['details'] ?? null,
            );
            $rateLimited = $status === 429 && $err->errorCode === 'rate_limited';
            if ($canRetry && $attempt < $this->maxRetries && ($rateLimited || ($status >= 500 && $status !== 501))) {
                $after = is_array($err->details) ? (float) ($err->details['retry_after_seconds'] ?? 0) : 0;
                $this->wait($rateLimited && $after > 0 ? min($after, 60.0) : self::backoff($attempt));
                continue;
            }
            if ($attempt > 0 && $err->errorCode === 'duplicate_reference') {
                throw new DuplicateOnRetry($err);
            }
            throw $err;
        }
    }

    /**
     * @internal An identity/business check: always carries a reference, so a retry never charges twice.
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    public function check(string $path, array $params): array
    {
        $body = $this->prepare($params, 'sdk');
        try {
            return $this->request('POST', $path, [], $body, true);
        } catch (DuplicateOnRetry $d) {
            // The first attempt went through but its answer was lost: return that result.
            $found = $this->verifications->list(['reference' => $body['reference'], 'per_page' => 1]);
            if (!empty($found['items'])) {
                return $this->verifications->get($found['items'][0]['id']);
            }
            throw $d->error;
        }
    }

    /**
     * @internal A create that carries a reference (safe to retry).
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    public function create(string $path, array $params, string $prefix): array
    {
        try {
            return $this->request('POST', $path, [], $this->prepare($params, $prefix), true);
        } catch (DuplicateOnRetry $d) {
            throw $d->error;
        }
    }

    /**
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    private function prepare(array $params, string $prefix): array
    {
        if (empty($params['reference'])) {
            $params['reference'] = $prefix . '_' . rtrim(strtr(base64_encode(random_bytes(9)), '+/', '-_'), '=');
        }
        foreach (self::IMAGE_FIELDS as $f) {
            if (isset($params[$f]) && $params[$f] instanceof \SplFileInfo) {
                $params[$f] = base64_encode((string) file_get_contents($params[$f]->getPathname()));
            }
        }
        return $params;
    }

    /** Read an image file as base64, for selfie_image / front_image / back_image. */
    public static function imageFile(string $path): string
    {
        $bytes = @file_get_contents($path);
        if ($bytes === false) {
            throw new \InvalidArgumentException("Can't read {$path}.");
        }
        return base64_encode($bytes);
    }

    private static function backoff(int $attempt): float
    {
        return min(8.0, 0.5 * (2 ** $attempt)) * (0.75 + mt_rand() / mt_getrandmax() * 0.5);
    }

    private function wait(float $seconds): void
    {
        if (self::$sleep) {
            usleep((int) ($seconds * 1_000_000));
        }
    }

    /**
     * The default transport (ext-curl).
     * @param array<string, string> $headers
     * @return array{0:int,1:array<string,string>,2:string}
     */
    public static function curlTransport(string $method, string $url, array $headers, ?string $body, float $timeout): array
    {
        $ch = curl_init($url);
        $respHeaders = [];
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT_MS => (int) ($timeout * 1000),
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_HTTPHEADER => array_map(fn ($k, $v) => "{$k}: {$v}", array_keys($headers), $headers),
            CURLOPT_HEADERFUNCTION => function ($ch, $line) use (&$respHeaders) {
                $kv = explode(':', $line, 2);
                if (count($kv) === 2) {
                    $respHeaders[strtolower(trim($kv[0]))] = trim($kv[1]);
                }
                return strlen($line);
            },
        ]);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }
        $raw = curl_exec($ch);
        if ($raw === false) {
            throw new \RuntimeException(curl_error($ch));
        }
        // The handle is freed when $ch goes out of scope (curl_close is a no-op since PHP 8).
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        return [$status, $respHeaders, (string) $raw];
    }
}
