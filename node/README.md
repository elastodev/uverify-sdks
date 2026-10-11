# ByteID for Node.js

> ByteID was called UVerify. Package names are unchanged, and `UVerify` still works as an alias of `ByteID`.

The official Node.js library for [ByteID](https://byteid.ng): BVN, NIN, driver’s licence and voter’s card checks, liveness and face match, ID documents, AML screening and CAC, for Nigerian businesses.

```bash
npm install @uverifyng/node
```

Node 18 or later. No dependencies. ESM and CommonJS, with TypeScript types.

## Quick start

```ts
import { ByteID } from '@uverifyng/node';

const byteid = new ByteID({ apiKey: process.env.BYTEID_API_KEY }); // uvk_test_… is the free sandbox

const v = await byteid.identity.nin({ id_number: '12345678901', first_name: 'Adaeze', last_name: 'Okafor' });
if (v.status === 'verified') {
  console.log(v.data, v.field_matches); // the record, and which details matched
}
```

In the sandbox the last two digits of the ID number choose the result: `00` not found, `99` registry error, `98` face mismatch, anything else verified.

## A live customer, end to end

```ts
// 1. A liveness session: send the person to session.url (any phone browser)
const session = await byteid.liveness.createSession({ redirect_url: 'https://yourapp.com/kyc/done' });

// 2. When they return, match the face that passed to their BVN photo
const v = await byteid.identity.bvnFaceMatch({
  id_number: '22212345678', first_name: 'Adaeze', last_name: 'Okafor',
  liveness_session_id: session.id,
  aml_screening: true, // also screen the verified person against sanctions lists
});

if (v.status === 'verified' && v.face_match?.status === 'matched' && v.aml_screening?.status === 'clear') {
  // approve
}
```

## Everything else

```ts
await byteid.identity.bvn({ id_number, first_name, last_name });            // also driversLicense, votersCard, tin
await byteid.identity.ninFaceMatch({ id_number, selfie_image: buffer });    // a selfie instead of liveness (Buffer or base64)
await byteid.business.cac({ id_number: 'RC123456', aml_screening: true });  // company + each director screened

await byteid.documents.verify({ front_image: fs.readFileSync('nin.jpg'), document_type: 'nin_card', liveness_session_id });
await byteid.aml.screen({ name: 'Adaeze Okafor', date_of_birth: '1990-01-15' });
await byteid.aml.monitors.create({ name: 'Adaeze Okafor' });                // re-screened after every list update

const link = await byteid.kyc.createLink({ customer_name: 'Ada', require_document: true }); // no-code: send link.url

await byteid.address.verify({ address: '12 Admiralty Way, Lekki Phase 1', lga: 'Eti-Osa', state: 'Lagos' }); // on the map, in that LGA and state?
const home = await byteid.address.createLink({ address: '12 Admiralty Way', state: 'Lagos', customer_name: 'Ada' });
// send home.url: they open it at home and share their phone's location; read home.result / location.distance_m later
// (require_document: true also asks them for a proof of address)
await byteid.address.verifyDocument({ front_image: fs.readFileSync('bill.jpg'), address: '12 Admiralty Way', state: 'Lagos', name: 'Adaeze Okafor' });

await byteid.verifications.list({ status: 'verified' });
await byteid.account.balance();
```

## Errors

Every failure is a `UVerifyError` with a stable `code`:

```ts
import { UVerifyError } from '@uverifyng/node';

try {
  await byteid.identity.nin({ id_number });
} catch (e) {
  if (e instanceof UVerifyError && e.code === 'insufficient_balance') { /* top up */ }
  console.log(e.code, e.message, e.requestId, e.details);
}
```

A check that finds nothing is **not** an error: it returns `status: 'not_found'` (and you aren’t charged).

## Retries

Timeouts, connection errors, 5xx responses and rate limits are retried twice with backoff (`maxRetries`, `timeoutMs`). Every check carries a `reference` (one is generated if you don’t pass your own), so a retry can never charge twice; if the first attempt did go through, the library returns that result.

## Webhooks

```ts
import express from 'express';
import { ByteID } from '@uverifyng/node';

app.post('/webhooks/uverify', express.raw({ type: 'application/json' }), (req, res) => {
  let event;
  try {
    event = ByteID.webhooks.constructEvent(req.body, req.header('ByteID-Signature'), process.env.UVERIFY_WEBHOOK_SECRET!);
  } catch {
    return res.sendStatus(400);
  }
  if (event.type === 'verification.completed') { /* event.data is the verification */ }
  res.sendStatus(200);
});
```

Pass the **raw** body. Deliveries can repeat, so dedupe on `event.id`.

## Tests

```bash
npm test                                            # offline
UVERIFY_TEST_KEY=uvk_test_… npx vitest run test/sandbox.test.ts   # against the real sandbox
```

MIT licence. API reference: https://byteid.ng/docs
