# UVerify liveness demo (Expo)

A small Expo app showing [`@uverifyng/react-native-liveness`](https://www.npmjs.com/package/@uverifyng/react-native-liveness):

- **Face check**: opens UVerify's liveness check in the app, reads the real result, then matches the face to a NIN or BVN photo.
- **Verification link**: the full no-code flow (ID number, face check, match) inside the app.

> **Demo only.** To keep it to one project, this app calls the UVerify API directly with your key. A real app must never contain an API key: create sessions on your server (with `@uverifyng/node`, `uverify` for Python or `uverify/uverify-php`) and send the app only the session `url`.

## Run it

```bash
npm install
cp .env.example .env.local      # then put your uvk_test_ key in it
npx expo start
```

Scan the QR code with **Expo Go** on your phone. You can also paste the key into the app instead of using `.env.local`.

Use a sandbox key from the dashboard at uverify.com.ng: the check opens UVerify's hosted page over https, so it needs the production API (a local backend's `http://localhost` pages won't open in the app).

In the sandbox:
- On a simulator with no camera, close the check and tap **Simulate a pass**.
- For the face match, the last two digits of the ID number pick the result: `00` not found, `98` face mismatch, anything else verified.

## How it works

`App.tsx` renders `<UVerifyWebView url={session.url} redirectUrl={RETURN_URL} … />`. When the hosted page finishes it redirects to `RETURN_URL`; the component catches that before it loads and calls `onFinish`. The app then reads the session from the API, because what the page says is only a hint.

`src/uverify.ts` is the small API client (in a real app, this lives on your server).
