import base64
import json
import os
import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from uverify import UVerify, UVerifyConnectionError, UVerifyError, UVerifySignatureError, construct_event, sign_payload  # noqa: E402
from uverify import client as client_mod  # noqa: E402

client_mod._backoff = lambda attempt: 0.0  # no real waiting in tests


def ok(data, status=200):
    return status, {"content-type": "application/json"}, json.dumps({"success": True, "data": data, "request_id": "req_1"}).encode()


def fail(status, code, message="nope", details=None):
    return status, {}, json.dumps({"success": False, "error": {"code": code, "message": message, "details": details}, "request_id": "req_err"}).encode()


class Fake:
    """A transport that answers from handlers in order, recording each call."""

    def __init__(self, *handlers):
        self.handlers = handlers
        self.calls = []

    def __call__(self, method, url, headers, body, timeout):
        call = {"method": method, "url": url, "headers": headers, "body": json.loads(body) if body else None}
        self.calls.append(call)
        h = self.handlers[min(len(self.calls) - 1, len(self.handlers) - 1)]
        r = h(call)
        if r == "network-error":
            raise OSError("connection reset")
        return r


def client(t, **kw):
    return UVerify("uvk_test_abc", base_url="https://api.test/v1", transport=t, **kw)


class Requests(unittest.TestCase):
    def test_auth_reference_and_unwrap(self):
        t = Fake(lambda c: ok({"id": "v1", "status": "verified"}))
        v = client(t).identity.nin(id_number="12345678901")
        self.assertEqual(v, {"id": "v1", "status": "verified"})
        self.assertEqual(t.calls[0]["url"], "https://api.test/v1/identity/nin")
        self.assertEqual(t.calls[0]["headers"]["authorization"], "Bearer uvk_test_abc")
        self.assertTrue(t.calls[0]["headers"]["user-agent"].startswith("uverify-python/"))
        self.assertTrue(t.calls[0]["body"]["reference"].startswith("sdk_"))

    def test_own_reference_and_no_nones(self):
        t = Fake(lambda c: ok({}))
        client(t).identity.bvn(id_number="22212345678", first_name="Ada", last_name="Okafor", reference="mine-1", dob=None)
        self.assertEqual(t.calls[0]["body"], {"id_number": "22212345678", "first_name": "Ada", "last_name": "Okafor", "reference": "mine-1"})

    def test_bytes_images_become_base64(self):
        t = Fake(lambda c: ok({}))
        client(t).identity.nin_face_match(id_number="1", selfie_image=b"jpeg-bytes")
        client(t).documents.verify(front_image=bytes([1, 2, 3]), back_image="already-base64")
        self.assertEqual(t.calls[0]["body"]["selfie_image"], base64.b64encode(b"jpeg-bytes").decode())
        self.assertEqual(t.calls[1]["body"]["front_image"], "AQID")
        self.assertEqual(t.calls[1]["body"]["back_image"], "already-base64")

    def test_list_query(self):
        t = Fake(lambda c: ok({"items": [], "pagination": {}}))
        client(t).verifications.list(status="verified", page=2)
        self.assertEqual(t.calls[0]["url"], "https://api.test/v1/verifications?status=verified&page=2")

    def test_environment_and_key(self):
        self.assertEqual(UVerify("uvk_live_x").environment, "live")
        self.assertEqual(UVerify("uvk_test_x").environment, "test")
        was = os.environ.pop("UVERIFY_API_KEY", None)
        with self.assertRaises(ValueError):
            UVerify()
        if was:
            os.environ["UVERIFY_API_KEY"] = was


class Errors(unittest.TestCase):
    def test_error_fields(self):
        t = Fake(lambda c: fail(400, "validation_error", "One or more fields are invalid.", ["id_number must be the 11-digit NIN"]))
        with self.assertRaises(UVerifyError) as cm:
            client(t).identity.nin(id_number="x")
        e = cm.exception
        self.assertEqual((e.code, e.status, e.request_id, e.details), ("validation_error", 400, "req_err", ["id_number must be the 11-digit NIN"]))

    def test_4xx_not_retried(self):
        t = Fake(lambda c: fail(402, "insufficient_balance"))
        with self.assertRaises(UVerifyError):
            client(t).identity.nin(id_number="1")
        self.assertEqual(len(t.calls), 1)


class Retries(unittest.TestCase):
    def test_5xx_then_ok_same_reference(self):
        t = Fake(lambda c: fail(503, "internal_error"), lambda c: ok({"id": "v1"}))
        self.assertEqual(client(t).identity.nin(id_number="1"), {"id": "v1"})
        self.assertEqual(t.calls[0]["body"]["reference"], t.calls[1]["body"]["reference"])

    def test_rate_limit(self):
        t = Fake(lambda c: fail(429, "rate_limited", "slow", {"retry_after_seconds": 0}), lambda c: ok({"balance": 5}))
        self.assertEqual(client(t).account.balance(), {"balance": 5})
        self.assertEqual(len(t.calls), 2)

    def test_recovers_lost_answer(self):
        t = Fake(
            lambda c: "network-error",
            lambda c: fail(409, "duplicate_reference"),
            lambda c: ok({"items": [{"id": "v9"}], "pagination": {}}) if "/verifications?" in c["url"] else fail(500, "x"),
            lambda c: ok({"id": "v9", "data": {"first_name": "ADA"}}) if c["url"].endswith("/verifications/v9") else fail(500, "x"),
        )
        v = client(t).identity.nin(id_number="1")
        self.assertEqual(v["id"], "v9")
        self.assertIn(f"reference={t.calls[0]['body']['reference']}", t.calls[2]["url"])

    def test_gives_up(self):
        t = Fake(lambda c: "network-error")
        with self.assertRaises(UVerifyConnectionError):
            client(t, max_retries=1).identity.nin(id_number="1")
        self.assertEqual(len(t.calls), 2)

    def test_simulate_not_retried(self):
        t = Fake(lambda c: fail(500, "internal_error"))
        with self.assertRaises(UVerifyError):
            client(t).liveness.simulate("s1", outcome="passed")
        self.assertEqual(len(t.calls), 1)


class Webhooks(unittest.TestCase):
    secret = "whsec_test123"
    body = json.dumps({"id": "evt_1", "type": "verification.completed", "created_at": "2026-09-30T10:00:00Z", "environment": "live", "data": {"id": "v1"}})

    def test_valid(self):
        e = construct_event(self.body, sign_payload(self.body, self.secret), self.secret)
        self.assertEqual(e["id"], "evt_1")
        self.assertEqual(UVerify.webhooks.construct_event(self.body.encode(), sign_payload(self.body, self.secret), self.secret)["type"], "verification.completed")

    def test_rejects(self):
        sig = sign_payload(self.body, self.secret)
        for args in [(self.body.replace("v1", "v2"), sig, self.secret), (self.body, sig, "whsec_other"), (self.body, None, self.secret), (self.body, "v1=abc", self.secret)]:
            with self.assertRaises(UVerifySignatureError):
                construct_event(*args)
        old = sign_payload(self.body, self.secret, int(time.time()) - 3600)
        with self.assertRaises(UVerifySignatureError):
            construct_event(self.body, old, self.secret)
        self.assertEqual(construct_event(self.body, old, self.secret, tolerance_seconds=0)["id"], "evt_1")

    def test_matches_node_and_server(self):
        # Same inputs as the Node SDK's test: identical signatures across languages.
        import hashlib
        import hmac
        t = 1790590000
        expected = hmac.new(self.secret.encode(), f"{t}.{self.body}".encode(), hashlib.sha256).hexdigest()
        self.assertEqual(sign_payload(self.body, self.secret, t), f"t={t},v1={expected}")


class Contract(unittest.TestCase):
    def test_covers_every_public_route(self):
        routes = json.loads((Path(__file__).resolve().parents[2] / "contract" / "public-api.json").read_text())["routes"]
        seen = set()

        def transport(method, url, headers, body, timeout):
            path = url.split("/v1", 1)[1].split("?")[0].replace("/id-x", "/{id}")
            seen.add(f"{method} {path}")
            return ok({"items": [], "pagination": {}})

        u = client(transport)
        p = dict(id_number="1", first_name="A", last_name="B")
        u.identity.bvn(**p); u.identity.bvn_face_match(**p, liveness_session_id="s"); u.identity.nin(id_number="1"); u.identity.nin_face_match(id_number="1", liveness_session_id="s")
        u.identity.drivers_license(**p); u.identity.drivers_license_face_match(**p, liveness_session_id="s"); u.identity.voters_card(**p); u.identity.voters_card_face_match(**p, liveness_session_id="s")
        u.identity.tin(id_number="1"); u.business.cac(id_number="RC1")
        u.verifications.list(); u.verifications.get("id-x"); u.account.balance(); u.account.pricing()
        u.liveness.create_session(); u.liveness.get_session("id-x"); u.liveness.simulate("id-x", outcome="passed")
        u.documents.verify(front_image="x"); u.documents.get("id-x")
        u.aml.screen(name="A B"); u.aml.get_screening("id-x"); u.aml.lists()
        u.aml.monitors.create(name="A B"); u.aml.monitors.list(); u.aml.monitors.get("id-x"); u.aml.monitors.stop("id-x")
        u.kyc.create_link(); u.kyc.list_links(); u.kyc.get_link("id-x")
        self.assertEqual([r for r in routes if r not in seen], [])


if __name__ == "__main__":
    unittest.main()
