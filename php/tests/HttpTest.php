<?php

declare(strict_types=1);

namespace UVerify\Tests;

use PHPUnit\Framework\TestCase;
use UVerify\UVerify;
use UVerify\UVerifyError;

/** The real curl transport, against PHP's built-in server (no network). */
final class HttpTest extends TestCase
{
    /** @var resource */
    private static $proc;
    private static string $base;

    public static function setUpBeforeClass(): void
    {
        $port = random_int(20000, 40000);
        self::$proc = proc_open(['php', '-S', "127.0.0.1:{$port}", __DIR__ . '/fixtures-router.php'], [1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes);
        self::$base = "http://127.0.0.1:{$port}/v1";
        for ($i = 0; $i < 50 && !@fsockopen('127.0.0.1', $port); $i++) {
            usleep(100_000);
        }
    }

    public static function tearDownAfterClass(): void
    {
        proc_terminate(self::$proc);
    }

    public function testGetAndPost(): void
    {
        $u = new UVerify('uvk_test_local', ['base_url' => self::$base]);
        $this->assertSame(1234.5, $u->account->balance()['balance']);
        $v = $u->identity->nin(['id_number' => '12345678901']);
        $this->assertSame('verified', $v['status']);
        $this->assertStringStartsWith('sdk_', $v['echo']['reference']);
    }

    public function testErrorBodiesAreRead(): void
    {
        try {
            (new UVerify('uvk_test_local', ['base_url' => self::$base]))->identity->nin(['id_number' => 'bad']);
            $this->fail('expected an error');
        } catch (UVerifyError $e) {
            $this->assertSame(['validation_error', 400, 'req_400'], [$e->errorCode, $e->status, $e->requestId]);
        }
        try {
            (new UVerify('uvk_test_wrong', ['base_url' => self::$base]))->account->balance();
            $this->fail('expected an error');
        } catch (UVerifyError $e) {
            $this->assertSame('invalid_api_key', $e->errorCode);
        }
    }
}
