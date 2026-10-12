# Bytid for Python

> Bytid was called UVerify (and, briefly, ByteID). Package names are unchanged, and `UVerify` and `ByteID` still work as aliases of `Bytid`.

The official Python library for [Bytid](https://www.bytid.com): BVN, NIN, driver’s licence and voter’s card checks, liveness and face match, ID documents, AML screening and CAC, for Nigerian businesses.

```bash
pip install uverify
```

Python 3.8 or later. No dependencies.

## Quick start

```python
from uverify import Bytid

bytid = Bytid("uvk_test_...")  # or set BYTID_API_KEY; uvk_test_ is the free sandbox

v = bytid.identity.nin(id_number="12345678901", first_name="Adaeze", last_name="Okafor")
if v["status"] == "verified":
    print(v["data"], v["field_matches"])
```

In the sandbox the last two digits of the ID number choose the result: `00` not found, `99` registry error, `98` face mismatch, anything else verified.

## A live customer, end to end

```python
session = bytid.liveness.create_session(redirect_url="https://yourapp.com/kyc/done")
# send the person to session["url"]; when they come back:
v = bytid.identity.bvn_face_match(
    id_number="22212345678", first_name="Adaeze", last_name="Okafor",
    liveness_session_id=session["id"],
    aml_screening=True,
)
if v["status"] == "verified" and v["face_match"]["status"] == "matched" and v["aml_screening"]["status"] == "clear":
    ...  # approve
```

## Everything else

```python
bytid.identity.bvn(id_number=..., first_name=..., last_name=...)       # also drivers_license, voters_card, tin
bytid.identity.nin_face_match(id_number=..., selfie_image=open("me.jpg", "rb").read())
bytid.business.cac(id_number="RC123456", aml_screening=True)

bytid.documents.verify(front_image=open("nin.jpg", "rb").read(), document_type="nin_card")
bytid.aml.screen(name="Adaeze Okafor", date_of_birth="1990-01-15")
bytid.aml.monitors.create(name="Adaeze Okafor")
link = bytid.kyc.create_link(customer_name="Ada", require_document=True)   # send link["url"]

bytid.address.verify(address="12 Admiralty Way, Lekki Phase 1", lga="Eti-Osa", state="Lagos")  # on the map, in that LGA and state?
home = bytid.address.create_link(address="12 Admiralty Way", state="Lagos", customer_name="Ada")
# send home["url"]: they open it at home and share their phone's location; read result / location["distance_m"] later
bytid.address.verify_document(front_image=open("bill.jpg", "rb").read(), address="12 Admiralty Way", state="Lagos", name="Adaeze Okafor")

bytid.verifications.list(status="verified")
bytid.account.balance()
```

Responses are plain dicts, exactly as in the [API reference](https://www.bytid.com/docs).

## Errors

```python
from uverify import UVerifyError

try:
    bytid.identity.nin(id_number=id_number)
except UVerifyError as e:
    if e.code == "insufficient_balance":
        ...
    print(e.code, e.message, e.request_id, e.details)
```

A check that finds nothing isn’t an error: it returns `status: "not_found"` (and you aren’t charged).

## Retries

Timeouts, connection errors, 5xx and rate limits are retried twice with backoff (`max_retries`, `timeout`). Every check carries a `reference` (generated if you don’t pass one), so a retry never charges twice, and if the first attempt went through you get that result.

## Webhooks

```python
from uverify import construct_event, UVerifySignatureError

@app.post("/webhooks/uverify")          # Flask/FastAPI/Django: use the raw body
def hook():
    try:
        event = construct_event(request.get_data(), request.headers.get("Bytid-Signature"), WEBHOOK_SECRET)
    except UVerifySignatureError:
        return "", 400
    if event["type"] == "verification.completed":
        ...
    return "", 200
```

Deliveries can repeat: dedupe on `event["id"]`.

## Tests

```bash
python -m unittest discover -s tests                       # offline
UVERIFY_TEST_KEY=uvk_test_... python -m unittest tests.test_sandbox
```

MIT licence.
