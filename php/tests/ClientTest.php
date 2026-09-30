<?php

declare(strict_types=1);

namespace UVerify\Tests;

use PHPUnit\Framework\TestCase;
use UVerify\UVerify;
use UVerify\UVerifyConnectionError;
use UVerify\UVerifyError;
use UVerify\UVerifySignatureError;
use UVerify\Webhook;

final class ClientTest extends TestCase
{
    /** @var array<int, array{method:string,url:string,headers:array<string,string>,body:?array}> */
    private array $calls = [];

    protected function setUp(): void
    {
        UVerify::$sleep = false;
        $this->calls = [];
    }

    private static function ok(mixed $data, int $status = 200): array
    {
        return [$status, [], json_encode(['success' => true, 'data' => $data, 'request_id' => 'req_1'])];
    }

    private static function err(int $status, string $code, string $message = 'nope', mixed $details = null): array
    {
        return [$status, [], json_encode(['success' => false, 'error' => ['code' => $code, 'message' => $message, 'details' => $details], 'request_id' => 'req_err'])];
    }

    /** A client whose transport answers from $handlers in order and records each call. */
    private function client(array $handlers, array $opts = []): UVerify
    {
        $transport = function (string $method, string $url, array $headers, ?string $body) use ($handlers) {
            $call = ['method' => $method, 'url' => $url, 'headers' => $headers, 'body' => $body ? json_decode($body, true) : null];
            $this->calls[] = $call;
            $h = $handlers[min(count($this->calls) - 1, count($handlers) - 1)];
            $r = $h($call);
            if ($r === 'network-error') {
                throw new \RuntimeException('Connection reset');
            }
            return $r;
        };
        return new UVerify('uvk_test_abc', ['base_url' => 'https://api.test/v1', 'transport' => $transport] + $opts);
    }

    public function testAuthReferenceAndUnwrap(): void
    {
        $v = $this->client([fn () => self::ok(['id' => 'v1', 'status' => 'verified'])])->identity->nin(['id_number' => '12345678901']);
        $this->assertSame(['id' => 'v1', 'status' => 'verified'], $v);
        $this->assertSame('https://api.test/v1/identity/nin', $this->calls[0]['url']);
        $this->assertSame('Bearer uvk_test_abc', $this->calls[0]['headers']['authorization']);
        $this->assertStringStartsWith('uverify-php/', $this->calls[0]['headers']['user-agent']);
        $this->assertStringStartsWith('sdk_', $this->calls[0]['body']['reference']);
    }

    public function testOwnReferenceAndNullsDropped(): void
    {
        $this->client([fn () => self::ok([])])->identity->bvn(['id_number' => '22212345678', 'first_name' => 'Ada', 'last_name' => 'Okafor', 'reference' => 'mine-1', 'dob' => null]);
        $this->assertSame(['id_number' => '22212345678', 'first_name' => 'Ada', 'last_name' => 'Okafor', 'reference' => 'mine-1'], $this->calls[0]['body']);
    }

    public function testImageFilesBecomeBase64(): void
    {
        $f = tempnam(sys_get_temp_dir(), 'img');
        file_put_contents($f, 'jpeg-bytes');
        $this->client([fn () => self::ok([])])->documents->verify(['front_image' => new \SplFileInfo($f), 'back_image' => 'already-base64']);
        $this->assertSame(base64_encode('jpeg-bytes'), $this->calls[0]['body']['front_image']);
        $this->assertSame('already-base64', $this->calls[0]['body']['back_image']);
        $this->assertSame(base64_encode('jpeg-bytes'), UVerify::imageFile($f));
        unlink($f);
    }

    public function testListQuery(): void
    {
        $this->client([fn () => self::ok(['items' => [], 'pagination' => []])])->verifications->list(['status' => 'verified', 'page' => 2]);
        $this->assertSame('https://api.test/v1/verifications?status=verified&page=2', $this->calls[0]['url']);
    }

    public function testEnvironmentAndKey(): void
    {
        $this->assertSame('live', (new UVerify('uvk_live_x'))->environment());
        $this->assertSame('test', (new UVerify('uvk_test_x'))->environment());
        putenv('UVERIFY_API_KEY');
        $this->expectException(\InvalidArgumentException::class);
        new UVerify();
    }

    public function testErrorFields(): void
    {
        try {
            $this->client([fn () => self::err(400, 'validation_error', 'Invalid.', ['id_number must be the 11-digit NIN'])])->identity->nin(['id_number' => 'x']);
            $this->fail('expected an error');
        } catch (UVerifyError $e) {
            $this->assertSame(['validation_error', 400, 'req_err', ['id_number must be the 11-digit NIN']], [$e->errorCode, $e->status, $e->requestId, $e->details]);
        }
    }

    public function testFourHundredsAreNotRetried(): void
    {
        try {
            $this->client([fn () => self::err(402, 'insufficient_balance')])->identity->nin(['id_number' => '1']);
        } catch (UVerifyError) {
        }
        $this->assertCount(1, $this->calls);
    }

    public function testFiveHundredThenOkWithSameReference(): void
    {
        $v = $this->client([fn () => self::err(503, 'internal_error'), fn () => self::ok(['id' => 'v1'])])->identity->nin(['id_number' => '1']);
        $this->assertSame(['id' => 'v1'], $v);
        $this->assertSame($this->calls[0]['body']['reference'], $this->calls[1]['body']['reference']);
    }

    public function testRateLimit(): void
    {
        $b = $this->client([fn () => self::err(429, 'rate_limited', 'slow', ['retry_after_seconds' => 0]), fn () => self::ok(['balance' => 5])])->account->balance();
        $this->assertSame(['balance' => 5], $b);
        $this->assertCount(2, $this->calls);
    }

    public function testRecoversALostAnswer(): void
    {
        $v = $this->client([
            fn () => 'network-error',
            fn () => self::err(409, 'duplicate_reference'),
            fn ($c) => str_contains($c['url'], '/verifications?') ? self::ok(['items' => [['id' => 'v9']], 'pagination' => []]) : self::err(500, 'x'),
            fn ($c) => str_ends_with($c['url'], '/verifications/v9') ? self::ok(['id' => 'v9', 'data' => ['first_name' => 'ADA']]) : self::err(500, 'x'),
        ])->identity->nin(['id_number' => '1']);
        $this->assertSame('v9', $v['id']);
        $this->assertStringContainsString('reference=' . $this->calls[0]['body']['reference'], $this->calls[2]['url']);
    }

    public function testGivesUp(): void
    {
        try {
            $this->client([fn () => 'network-error'], ['max_retries' => 1])->identity->nin(['id_number' => '1']);
            $this->fail('expected a connection error');
        } catch (UVerifyConnectionError) {
        }
        $this->assertCount(2, $this->calls);
    }

    public function testSimulateIsNotRetried(): void
    {
        try {
            $this->client([fn () => self::err(500, 'internal_error')])->liveness->simulate('s1', ['outcome' => 'passed']);
        } catch (UVerifyError) {
        }
        $this->assertCount(1, $this->calls);
    }

    public function testWebhooks(): void
    {
        $secret = 'whsec_test123';
        $body = json_encode(['id' => 'evt_1', 'type' => 'verification.completed', 'created_at' => '2026-09-30T10:00:00Z', 'environment' => 'live', 'data' => ['id' => 'v1']]);
        $this->assertSame('evt_1', Webhook::constructEvent($body, Webhook::signPayload($body, $secret), $secret)['id']);
        $sig = Webhook::signPayload($body, $secret);
        foreach ([[str_replace('v1', 'v2', $body), $sig, $secret], [$body, $sig, 'whsec_other'], [$body, null, $secret], [$body, 'v1=abc', $secret]] as $args) {
            try {
                Webhook::constructEvent(...$args);
                $this->fail('expected a signature error');
            } catch (UVerifySignatureError) {
            }
        }
        $old = Webhook::signPayload($body, $secret, time() - 3600);
        try {
            Webhook::constructEvent($body, $old, $secret);
            $this->fail('expected a replay error');
        } catch (UVerifySignatureError) {
        }
        $this->assertSame('evt_1', Webhook::constructEvent($body, $old, $secret, 0)['id']);
        $t = 1790590000;
        $this->assertSame('t=' . $t . ',v1=' . hash_hmac('sha256', $t . '.' . $body, $secret), Webhook::signPayload($body, $secret, $t));
    }

    public function testCoversEveryPublicRoute(): void
    {
        $routes = json_decode((string) file_get_contents(__DIR__ . '/../../contract/public-api.json'), true)['routes'];
        $seen = [];
        $u = new UVerify('uvk_test_x', ['base_url' => 'https://x/v1', 'transport' => function ($method, $url) use (&$seen) {
            $path = str_replace('/id-x', '/{id}', explode('?', explode('/v1', $url, 2)[1])[0]);
            $seen["{$method} {$path}"] = true;
            return self::ok(['items' => [], 'pagination' => []]);
        }]);
        $p = ['id_number' => '1', 'first_name' => 'A', 'last_name' => 'B'];
        $f = $p + ['liveness_session_id' => 's'];
        $u->identity->bvn($p); $u->identity->bvnFaceMatch($f); $u->identity->nin($p); $u->identity->ninFaceMatch($f);
        $u->identity->driversLicense($p); $u->identity->driversLicenseFaceMatch($f); $u->identity->votersCard($p); $u->identity->votersCardFaceMatch($f);
        $u->identity->tin(['id_number' => '1']); $u->business->cac(['id_number' => 'RC1']);
        $u->verifications->list(); $u->verifications->get('id-x'); $u->account->balance(); $u->account->pricing();
        $u->liveness->createSession(); $u->liveness->getSession('id-x'); $u->liveness->simulate('id-x', ['outcome' => 'passed']);
        $u->documents->verify(['front_image' => 'x']); $u->documents->get('id-x');
        $u->aml->screen(['name' => 'A B']); $u->aml->getScreening('id-x'); $u->aml->lists();
        $u->aml->monitors->create(['name' => 'A B']); $u->aml->monitors->list(); $u->aml->monitors->get('id-x'); $u->aml->monitors->stop('id-x');
        $u->kyc->createLink(); $u->kyc->listLinks(); $u->kyc->getLink('id-x');
        $this->assertSame([], array_values(array_filter($routes, fn ($r) => !isset($seen[$r]))));
    }
}
