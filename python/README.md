# UVerify for Python

The official Python library for [UVerify](https://uverify.com.ng): BVN, NIN, driver’s licence and voter’s card checks, liveness and face match, ID documents, AML screening and CAC, for Nigerian businesses.

```bash
pip install uverify
```

Python 3.8 or later. No dependencies.

## Quick start

```python
from uverify import UVerify

uverify = UVerify("uvk_test_...")  # or set UVERIFY_API_KEY; uvk_test_ is the free sandbox

v = uverify.identity.nin(id_number="12345678901", first_name="Adaeze", last_name="Okafor")
if v["status"] == "verified":
    print(v["data"], v["field_matches"])
```

In the sandbox the last two digits of the ID number choose the result: `00` not found, `99` registry error, `98` face mismatch, anything else verified.

## A live customer, end to end

```python
session = uverify.liveness.create_session(redirect_url="https://yourapp.com/kyc/done")
# send the person to session["url"]; when they come back:
v = uverify.identity.bvn_face_match(
    id_number="22212345678", first_name="Adaeze", last_name="Okafor",
    liveness_session_id=session["id"],
    aml_screening=True,
)
if v["status"] == "verified" and v["face_match"]["status"] == "matched" and v["aml_screening"]["status"] == "clear":
    ...  # approve
```

## Everything else

```python
uverify.identity.bvn(id_number=..., first_name=..., last_name=...)       # also drivers_license, voters_card, tin
uverify.identity.nin_face_match(id_number=..., selfie_image=open("me.jpg", "rb").read())
uverify.business.cac(id_number="RC123456", aml_screening=True)

uverify.documents.verify(front_image=open("nin.jpg", "rb").read(), document_type="nin_card")
uverify.aml.screen(name="Adaeze Okafor", date_of_birth="1990-01-15")
uverify.aml.monitors.create(name="Adaeze Okafor")
link = uverify.kyc.create_link(customer_name="Ada", require_document=True)   # send link["url"]

uverify.verifications.list(status="verified")
uverify.account.balance()
```

Responses are plain dicts, exactly as in the [API reference](https://uverify.com.ng/docs).

## Errors

```python
from uverify import UVerifyError

try:
    uverify.identity.nin(id_number=id_number)
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
        event = construct_event(request.get_data(), request.headers.get("UVerify-Signature"), WEBHOOK_SECRET)
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
