# Releasing an SDK

Each SDK is released on its own. Pushing a tag named `<sdk>-v<version>` runs `.github/workflows/release.yml`, which tests the package, checks the version, and publishes it. Only the SDK in the tag's name is released; the others are untouched.

| SDK | Tag | Published to | Install |
|---|---|---|---|
| Node | `node-v1.2.3` | npm `@uverifyng/node` | `npm install @uverifyng/node` |
| React Native | `react-native-v1.2.3` | npm `@uverifyng/react-native-liveness` | `npm install @uverifyng/react-native-liveness` |
| Python | `python-v1.2.3` | PyPI `uverify` | `pip install uverify` |
| PHP | `php-v1.2.3` | Packagist `uverify/uverify-php`, via the mirror repo `elastodev/uverify-php` (tag `v1.2.3`) | `composer require uverify/uverify-php` |
| Flutter | `flutter-v1.2.3` | pub.dev `uverify_liveness` | `flutter pub add uverify_liveness` |

## Steps

### 1. Make the change and test it

Work on `main` (or a branch merged into it). Run the SDK's tests locally; CI runs them too on every push.

| SDK | Test |
|---|---|
| Node | `cd node && npm run typecheck && npm test` |
| React Native | `cd react-native && npm test && npm run typecheck` |
| Python | `cd python && python -m unittest discover -s tests` |
| PHP | `cd php && composer install && vendor/bin/phpunit tests` |
| Flutter | `cd flutter && flutter analyze && flutter test` |

### 2. Pick the new version

[Semantic versioning](https://semver.org):

- **Patch** (`0.1.0` → `0.1.1`): a bug fix, nothing changes for users.
- **Minor** (`0.1.1` → `0.2.0`): something new (an endpoint, an option), existing code keeps working.
- **Major** (`0.2.0` → `1.0.0`): existing code has to change (a rename, a removed method, a different return shape). While we're on `0.x`, a minor bump may also break things; say so in the changelog.

A version can be published only once. If a release goes out wrong, fix it and release the next patch.

### 3. Bump the version in every file for that SDK

The release checks the package file against the tag and stops if they differ. The `VERSION` constants aren't checked (they go in the `User-Agent` header, so we can see which versions customers run), so don't forget them.

| SDK | Files |
|---|---|
| Node | `node/package.json` (`"version"`) and `node/src/client.ts` (`VERSION`) |
| React Native | `react-native/package.json` (`"version"`) |
| Python | `python/pyproject.toml` (`version`) and `python/src/uverify/client.py` (`VERSION`) |
| PHP | `php/src/UVerify.php` (`VERSION`); `composer.json` has no version, Packagist reads it from the tag |
| Flutter | `flutter/pubspec.yaml` (`version`), and a new section at the top of `flutter/CHANGELOG.md` (pub.dev shows it) |

For Node and React Native, update the lockfile in the same folder too: `npm install --package-lock-only`.

### 4. Commit and push to `main`

```bash
git add -A
git commit -m "node: 0.1.1, retry on 503 from the face service"
git push origin main
```

Wait for **CI** to go green in the Actions tab before tagging.

### 5. Tag and push the tag

```bash
git tag -a node-v0.1.1 -m "@uverifyng/node 0.1.1"
git push origin node-v0.1.1
```

Swap `node` for `react-native`, `python`, `php` or `flutter`. Releasing several SDKs at once is fine: push one tag for each.

### 6. Check it went out

Watch the **Release** run in the Actions tab (one to two minutes), then:

| SDK | Check |
|---|---|
| Node | `npm view @uverifyng/node version` |
| React Native | `npm view @uverifyng/react-native-liveness version` |
| Python | `pip index versions uverify` or https://pypi.org/project/uverify |
| PHP | https://packagist.org/packages/uverify/uverify-php (updates within a few minutes of the mirror push) |
| Flutter | https://pub.dev/packages/uverify_liveness (can take up to 10 minutes) |

A brand-new version can take a few minutes to show on npm and pub.dev even after the run is green.

## When a release fails

Nothing is published unless every step passes, so a failed run leaves nothing to clean up.

1. Read the failed step in the Actions run.
2. Fix it on `main` and push.
3. Move the tag to the fixed commit and push it again. Do this only if the version was **not** published:

```bash
git tag -d node-v0.1.1
git push origin :refs/tags/node-v0.1.1
git tag -a node-v0.1.1 -m "@uverifyng/node 0.1.1"
git push origin node-v0.1.1
```

Common failures:

| Error | Cause | Fix |
|---|---|---|
| `test ... = ...` or `grep -q "version ..."` step fails | The tag doesn't match the version in the package file | Bump the file (step 3), or tag the right version |
| npm `E401` / `E403` | `NPM_TOKEN` expired or can't publish to `@uverifyng` | New npm automation (or granular read-write `@uverifyng`) token, update the repo secret |
| npm `E403 cannot publish over the previously published version` | That version is already out | Release the next patch |
| PyPI `invalid-publisher` | Trusted publisher settings don't match | On PyPI: owner `elastodev`, repo `uverify-sdks`, workflow `release.yml`, environment `pypi` |
| PHP push `403 ... github-actions[bot]` | The checkout step's token was used | Keep `persist-credentials: false` on that checkout |
| PHP push `403 ... <your user>` | `PHP_MIRROR_TOKEN` expired or lacks access | New fine-grained token: owner `elastodev`, repo `uverify-php`, Contents read and write |
| pub.dev `not authorized` | Automated publishing is off, or the tag pattern differs | pub.dev → uverify_liveness → Admin → Automated publishing: repo `elastodev/uverify-sdks`, tag pattern `flutter-v{{version}}`, environment `pub.dev` |
| Run shows "Waiting for review" | The `pypi` or `pub.dev` environment asks for approval | Approve it in the run |

## Secrets and settings this depends on

Repository → Settings → Secrets and variables → Actions:

- `NPM_TOKEN`: publishes both npm packages.
- `PHP_MIRROR_TOKEN`: pushes `php/` to `elastodev/uverify-php`.
- `UVERIFY_TEST_KEY`: a production sandbox key, for CI's live sandbox tests.

PyPI and pub.dev use trusted publishing (no secret): each trusts this repo's `release.yml` through the `pypi` and `pub.dev` environments. Tokens expire, so note their expiry dates.

## When the API changes

If a backend change adds or changes a public endpoint, update `contract/public-api.json` and the Node, Python and PHP SDKs (their contract tests fail until they cover every route in it), then release those SDKs together, one tag each. The React Native and Flutter packages only wrap the hosted page, so they change only when the hosted page's messages or redirects do.
