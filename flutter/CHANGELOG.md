## 0.2.0

- Address links: the view opens an address link (`address.createLink` on your server), asks for location instead of the camera, lets the page use it on Android, and returns an `AddressResult`. A refused location is `UVerifyCancelled('location_denied')`.
- Proof of address on address links: on Android the page's photo upload opens a camera / gallery choice (via `image_picker`).

## 0.1.0

- First release: `UVerifyLivenessView` and `UVerifyLiveness.start` run UVerify's hosted face check, or a verification link, inside your app, and return a `LivenessResult`, `KycResult`, `RedirectResult` or `UVerifyCancelled`.
