# UVerify liveness for Flutter

UVerify's face check (liveness), and verification links, inside your Flutter app.

The check runs on UVerify's hosted page, the same one your customers get in a browser, so every anti-spoofing layer (depth, colour flash, random prompts) applies, and improvements reach your app without an app update.

```bash
flutter pub add uverify_liveness
```

iOS 14.3+ (camera inside web views), Android 7+.

## Setup

**iOS**: `ios/Runner/Info.plist`

```xml
<key>NSCameraUsageDescription</key>
<string>We use the camera to confirm it's really you.</string>
```

and in `ios/Podfile`, turn on the camera permission for `permission_handler`:

```ruby
post_install do |installer|
  installer.pods_project.targets.each do |target|
    flutter_additional_ios_build_settings(target)
    target.build_configurations.each do |config|
      config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)', 'PERMISSION_CAMERA=1']
    end
  end
end
```

**Android**: `android/app/src/main/AndroidManifest.xml`

```xml
<uses-permission android:name="android.permission.CAMERA" />
```

## Use

Your **server** creates the session with a UVerify server SDK and returns its `url`. Never put your API key in the app.

```dart
import 'package:uverify_liveness/uverify_liveness.dart';

final result = await UVerifyLiveness.start(context, url: session.url);

switch (result) {
  case LivenessResult(:final sessionId, :final status):
    // status: passed, failed or expired. Send sessionId to your server for the face match.
    break;
  case UVerifyCancelled(:final reason):
    // closed, back or camera_denied
    break;
  default:
    break;
}
```

Then, on your server, run the face match with that session:

```ts
await uverify.identity.bvnFaceMatch({ id_number, first_name, last_name, liveness_session_id: sessionId });
```

The result in the app is only a hint to move on; **trust what your server gets from the API**.

To place the check in your own screen instead of a full-screen route, use the widget:

```dart
UVerifyLivenessView(url: session.url, onResult: (result) { /* ... */ })
```

### Verification links

The same view opens a verification link (`link.url` from `kyc.createLink`); the result is a `KycResult` with `id`, `status` and `outcome`.

### Options

| | |
|---|---|
| `url` | The session or link `url` from your server |
| `redirectUrl` | The `redirect_url` you created it with, if any; reaching it also finishes (`RedirectResult` with its query `params`) |
| `allowedHosts` | Extra hosts allowed in the view (UVerify's are always allowed; everything else is blocked) |
| `title` | `UVerifyLiveness.start` only: the app bar title |

API reference: https://uverify.com.ng/docs. MIT licence.
