# UVerify for PHP

The official PHP library for [UVerify](https://uverify.com.ng): BVN, NIN, driver’s licence and voter’s card checks, liveness and face match, ID documents, AML screening and CAC, for Nigerian businesses.

```bash
composer require uverify/uverify-php
```

PHP 8.1 or later, with the standard `curl` and `json` extensions. No other dependencies.

## Quick start

```php
$uverify = new \UVerify\UVerify('uvk_test_...'); // or set UVERIFY_API_KEY; uvk_test_ is the free sandbox

$v = $uverify->identity->nin(['id_number' => '12345678901', 'first_name' => 'Adaeze', 'last_name' => 'Okafor']);
if ($v['status'] === 'verified') {
    print_r($v['data']);
}
```

In the sandbox the last two digits of the ID number choose the result: `00` not found, `99` registry error, `98` face mismatch, anything else verified.

## A live customer, end to end

```php
$session = $uverify->liveness->createSession(['redirect_url' => 'https://yourapp.com/kyc/done']);
// send the person to $session['url']; when they come back:
$v = $uverify->identity->bvnFaceMatch([
    'id_number' => '22212345678', 'first_name' => 'Adaeze', 'last_name' => 'Okafor',
    'liveness_session_id' => $session['id'],
    'aml_screening' => true,
]);
```

## Everything else

```php
$uverify->identity->bvn([...]);                 // also driversLicense, votersCard, tin, and the *FaceMatch variants
$uverify->business->cac(['id_number' => 'RC123456', 'aml_screening' => true]);
$uverify->documents->verify(['front_image' => new \SplFileInfo('nin.jpg'), 'document_type' => 'nin_card']);
$uverify->aml->screen(['name' => 'Adaeze Okafor', 'date_of_birth' => '1990-01-15']);
$uverify->aml->monitors->create(['name' => 'Adaeze Okafor']);
$link = $uverify->kyc->createLink(['customer_name' => 'Ada', 'require_document' => true]); // send $link['url']
$uverify->verifications->list(['status' => 'verified']);
$uverify->account->balance();
```

Image fields take base64, or a `\SplFileInfo` for a file (`UVerify::imageFile($path)` also gives base64).

## Errors

```php
try {
    $uverify->identity->nin(['id_number' => $id]);
} catch (\UVerify\UVerifyError $e) {
    if ($e->errorCode === 'insufficient_balance') { /* top up */ }
    echo $e->errorCode, $e->getMessage(), $e->requestId;
}
```

A check that finds nothing isn’t an error: it returns `status => 'not_found'`.

## Retries

Timeouts, connection errors, 5xx and rate limits are retried twice with backoff (`['max_retries' => 2, 'timeout' => 60]`). Every check carries a `reference`, so a retry never charges twice.

## Webhooks

```php
try {
    $event = \UVerify\Webhook::constructEvent(file_get_contents('php://input'), $_SERVER['HTTP_UVERIFY_SIGNATURE'] ?? null, getenv('UVERIFY_WEBHOOK_SECRET'));
} catch (\UVerify\UVerifySignatureError $e) {
    http_response_code(400);
    exit;
}
if ($event['type'] === 'verification.completed') { /* ... */ }
```

Deliveries can repeat: dedupe on `$event['id']`.

MIT licence. API reference: https://uverify.com.ng/docs
