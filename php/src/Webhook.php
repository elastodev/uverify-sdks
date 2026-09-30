<?php

declare(strict_types=1);

namespace UVerify;

final class Webhook
{
    /**
     * Verify a webhook and return its event (id, type, created_at, environment, data).
     *
     * Pass the raw request body (file_get_contents('php://input')), the
     * UVerify-Signature header and your endpoint's signing secret (whsec_...).
     * Throws UVerifySignatureError if the signature doesn't match or the event is
     * older than $toleranceSeconds. Deliveries can repeat: dedupe on $event['id'].
     *
     * @return array<string, mixed>
     */
    public static function constructEvent(string $rawBody, ?string $signatureHeader, string $secret, int $toleranceSeconds = 300): array
    {
        if ($signatureHeader === null || $signatureHeader === '') {
            throw new UVerifySignatureError('Missing UVerify-Signature header.');
        }
        if ($secret === '') {
            throw new UVerifySignatureError('Missing webhook secret.');
        }
        $parts = [];
        foreach (explode(',', $signatureHeader) as $p) {
            $kv = explode('=', trim($p), 2);
            if (count($kv) === 2) {
                $parts[$kv[0]] = $kv[1];
            }
        }
        $t = $parts['t'] ?? '';
        $v1 = $parts['v1'] ?? '';
        if ($t === '' || $v1 === '' || !ctype_digit($t)) {
            throw new UVerifySignatureError('Malformed UVerify-Signature header.');
        }
        $expected = hash_hmac('sha256', $t . '.' . $rawBody, $secret);
        if (!hash_equals($expected, $v1)) {
            throw new UVerifySignatureError('Signature does not match. Check the secret and that you passed the raw body.');
        }
        if ($toleranceSeconds > 0 && abs(time() - (int) $t) > $toleranceSeconds) {
            throw new UVerifySignatureError('Signature is too old (possible replay).');
        }
        $event = json_decode($rawBody, true);
        if (!is_array($event)) {
            throw new UVerifySignatureError('Body is not JSON.');
        }
        return $event;
    }

    /** Sign a payload the way UVerify does, for your own tests. */
    public static function signPayload(string $body, string $secret, ?int $timestamp = null): string
    {
        $t = $timestamp ?? time();
        return 't=' . $t . ',v1=' . hash_hmac('sha256', $t . '.' . $body, $secret);
    }
}
