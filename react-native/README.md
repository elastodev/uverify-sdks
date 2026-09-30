# UVerify liveness for React Native

UVerify’s face check (liveness), and verification links, inside your React Native app.

The check runs on UVerify’s hosted page, the same one your customers get in a browser, so every anti-spoofing layer (depth, colour flash, random prompts) applies, and improvements reach your app without an app update.

```bash
npm install @uverifyng/react-native-liveness react-native-webview
```

React Native 0.72+, `react-native-webview` 13+. iOS 14.3+ (camera inside web views), Android 7+.

## Setup

**iOS** — `Info.plist`:

```xml
<key>NSCameraUsageDescription</key>
<string>We use the camera to confirm it’s really you.</string>
```

**Android** — `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.CAMERA" />
```

## Use

Your **server** creates the session with a UVerify server SDK and returns its `url` and `id`. Never put your API key in the app.

```tsx
import { UVerifyWebView } from '@uverifyng/react-native-liveness';

function FaceCheck({ session, onDone }) {
  return (
    <UVerifyWebView
      url={session.url}
      onFinish={(result) => {
        if (result.type === 'liveness') onDone(result.sessionId, result.status); // 'passed' | 'failed' | 'expired'
      }}
      onCancel={(reason) => onDone(null, reason)} // 'back' | 'camera_denied'
    />
  );
}
```

Then, on your server, run the face match with that session:

```ts
await uverify.identity.bvnFaceMatch({ id_number, first_name, last_name, liveness_session_id: sessionId });
```

The result in the app is only a hint to move on; **trust what your server gets from the API**.

### Verification links

The same component opens a verification link (`link.url` from `kyc.createLink`): `onFinish` receives `{ type: 'kyc', id, status, outcome }`.

### Options

| Prop | |
|---|---|
| `url` | The session or link `url` from your server |
| `redirectUrl` | The `redirect_url` you created it with, if any; reaching it also finishes (`{ type: 'redirect', params }`) |
| `onFinish(result)` | The flow finished |
| `onCancel(reason)` | Back button, or the camera was refused |
| `allowedHosts` | Extra hosts allowed in the view (UVerify’s are always allowed; everything else is blocked) |

MIT licence.
