# UVerify SDKs

Official libraries for the [UVerify API](https://uverify.com.ng/docs): BVN, NIN, driver’s licence and voter’s card checks, liveness and face match, ID documents, AML screening and CAC, for Nigerian businesses.

| | Package | Install |
|---|---|---|
| Node.js / TypeScript | [`node/`](node) | `npm install @uverifyng/node` |
| Python | [`python/`](python) | `pip install uverify` |
| PHP | [`php/`](php) | `composer require uverify/uverify-php` |
| React Native (face check) | [`react-native/`](react-native) | `npm install @uverifyng/react-native-liveness react-native-webview` |
| Flutter (face check) | [`flutter/`](flutter) | `flutter pub add uverify_liveness` |

**Server SDKs** call the API with your secret key: never ship a key in a mobile app. **Mobile packages** show UVerify’s hosted face check (or a verification link) in your app and hand back the session id; your server then runs the face match.

All server SDKs behave the same way:

- every endpoint, with the API’s own field names;
- one error type with the API’s stable `code`, `request_id` and `details`;
- timeouts, connection errors, 5xx and rate limits retried with backoff, and every check sent with a `reference`, so a retry never charges twice (and if the first attempt went through, you get its result);
- webhook signature verification (`t=…,v1=HMAC-SHA256(secret, "t.body")`, 5-minute replay window);
- no runtime dependencies.

## Keeping them in step with the API

[`contract/public-api.json`](contract/public-api.json) lists every route an API key can call. Each SDK has a contract test that fails if a route has no method, so a new endpoint can’t ship without SDK coverage. Update the file when the API gains a public route.

## Tests

CI (`.github/workflows/ci.yml`) runs every SDK on each supported version: Node 18/20/22, Python 3.8–3.13, PHP 8.1–8.4, plus the mobile packages’ logic tests. With a `UVERIFY_TEST_KEY` secret set, it also runs each SDK against the real sandbox.

## Releasing

Tag a release per package (`node-v0.1.0`, `python-v0.1.0`, …); the release workflow publishes it. The PHP package is mirrored to its own repository, since Packagist needs `composer.json` at a repository’s root.

MIT licence © Elasto Web Services Limited.
