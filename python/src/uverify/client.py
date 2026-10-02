from __future__ import annotations

import base64
import json
import os
import platform
import random
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, Dict, Optional, Tuple, Union

from . import webhooks as _webhooks
from .errors import UVerifyConnectionError, UVerifyError

VERSION = "0.1.1"
DEFAULT_BASE_URL = "https://api.uverify.com.ng/v1"
IMAGE_FIELDS = ("selfie_image", "front_image", "back_image")

#: (method, url, headers, body, timeout seconds) -> (status, headers, body bytes)
Transport = Callable[[str, str, Dict[str, str], Optional[bytes], float], Tuple[int, Dict[str, str], bytes]]

ImageInput = Union[bytes, bytearray, str]
Json = Dict[str, Any]


def _urllib_transport(method: str, url: str, headers: Dict[str, str], body: Optional[bytes], timeout: float) -> Tuple[int, Dict[str, str], bytes]:
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, {k.lower(): v for k, v in r.headers.items()}, r.read()
    except urllib.error.HTTPError as e:  # 4xx/5xx still carry a JSON body
        with e:
            return e.code, {k.lower(): v for k, v in (e.headers or {}).items()}, e.read()


def _new_reference(prefix: str) -> str:
    return f"{prefix}_{secrets.token_urlsafe(9)}"


def _b64(v: ImageInput) -> str:
    return v if isinstance(v, str) else base64.b64encode(bytes(v)).decode()


def _backoff(attempt: int) -> float:
    return min(8.0, 0.5 * 2**attempt) * (0.75 + random.random() * 0.5)


class _DuplicateOnRetry(Exception):
    def __init__(self, err: UVerifyError) -> None:
        self.err = err


class UVerify:
    """The UVerify API client.

    >>> from uverify import UVerify
    >>> uverify = UVerify(api_key="uvk_test_...")
    >>> v = uverify.identity.nin(id_number="12345678901")
    >>> v["status"]
    'verified'
    """

    webhooks = _webhooks

    def __init__(
        self,
        api_key: Optional[str] = None,
        *,
        base_url: Optional[str] = None,
        timeout: float = 60.0,
        max_retries: int = 2,
        transport: Optional[Transport] = None,
    ) -> None:
        key = api_key or os.environ.get("UVERIFY_API_KEY", "")
        if not key:
            raise ValueError("UVerify: pass api_key (uvk_test_... or uvk_live_...) or set UVERIFY_API_KEY.")
        self._key = key
        self._base = (base_url or os.environ.get("UVERIFY_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
        self._timeout = timeout
        self._max_retries = max_retries
        self._transport = transport or _urllib_transport
        self.identity = _Identity(self)
        self.business = _Business(self)
        self.verifications = _Verifications(self)
        self.liveness = _Liveness(self)
        self.documents = _Documents(self)
        self.aml = _Aml(self)
        self.kyc = _Kyc(self)
        self.account = _Account(self)

    @property
    def environment(self) -> str:
        """``"test"`` for a sandbox key, ``"live"`` for a live one."""
        return "live" if "_live_" in self._key else "test"

    # ── transport ──────────────────────────────────────────────────────────

    def _request(self, method: str, path: str, *, query: Optional[Json] = None, body: Optional[Json] = None, retryable: Optional[bool] = None) -> Any:
        url = self._base + path
        q = {k: ("true" if v is True else "false" if v is False else v) for k, v in (query or {}).items() if v is not None}
        if q:
            url += "?" + urllib.parse.urlencode(q)
        data = json.dumps({k: v for k, v in body.items() if v is not None}).encode() if body is not None else None
        headers = {
            "authorization": f"Bearer {self._key}",
            "accept": "application/json",
            "user-agent": f"uverify-python/{VERSION} python/{platform.python_version()}",
        }
        if data is not None:
            headers["content-type"] = "application/json"
        can_retry = (method == "GET") if retryable is None else retryable

        attempt = 0
        while True:
            try:
                status, rh, raw = self._transport(method, url, headers, data, self._timeout)
            except Exception as e:  # timeout, DNS, reset
                if can_retry and attempt < self._max_retries:
                    time.sleep(_backoff(attempt))
                    attempt += 1
                    continue
                raise UVerifyConnectionError(f"Couldn't reach UVerify: {e}") from e

            try:
                payload = json.loads(raw.decode() or "null")
            except ValueError:
                payload = None
            if 200 <= status < 300 and not (isinstance(payload, dict) and payload.get("success") is False):
                return payload.get("data", payload) if isinstance(payload, dict) else payload

            e_obj = (payload or {}).get("error") or {} if isinstance(payload, dict) else {}
            err = UVerifyError(
                e_obj.get("message") or f"UVerify returned HTTP {status}.",
                code=e_obj.get("code") or ("internal_error" if status >= 500 else "http_error"),
                status=status,
                request_id=(payload or {}).get("request_id") if isinstance(payload, dict) else rh.get("x-request-id"),
                details=e_obj.get("details"),
            )
            rate_limited = status == 429 and err.code == "rate_limited"
            if can_retry and attempt < self._max_retries and (rate_limited or (status >= 500 and status != 501)):
                after = (err.details or {}).get("retry_after_seconds") if isinstance(err.details, dict) else None
                time.sleep(min(float(after), 60.0) if rate_limited and after else _backoff(attempt))
                attempt += 1
                continue
            if attempt > 0 and err.code == "duplicate_reference":
                raise _DuplicateOnRetry(err)
            raise err

    def _prepare(self, params: Json, prefix: str) -> Json:
        body = dict(params)
        body.setdefault("reference", None)
        if not body["reference"]:
            body["reference"] = _new_reference(prefix)
        for f in IMAGE_FIELDS:
            if body.get(f) is not None:
                body[f] = _b64(body[f])
        return body

    def _check(self, path: str, params: Json) -> Json:
        """An identity/business check: always carries a reference, so a retry never charges twice."""
        body = self._prepare(params, "sdk")
        try:
            return self._request("POST", path, body=body, retryable=True)
        except _DuplicateOnRetry as d:
            # The first attempt went through but its answer was lost: return that result.
            found = self.verifications.list(reference=body["reference"], per_page=1)
            if found["items"]:
                return self.verifications.get(found["items"][0]["id"])
            raise d.err from None

    def _create(self, path: str, params: Json, prefix: str) -> Json:
        try:
            return self._request("POST", path, body=self._prepare(params, prefix), retryable=True)
        except _DuplicateOnRetry as d:
            raise d.err from None


def _q(v: str) -> str:
    return urllib.parse.quote(v, safe="")


class _Resource:
    def __init__(self, client: UVerify) -> None:
        self._c = client


class _Identity(_Resource):
    def bvn(self, *, id_number: str, first_name: Optional[str] = None, last_name: Optional[str] = None, **kw: Any) -> Json:
        """BVN lookup. Names are optional; when sent they're compared with the record (field_matches). Also: dob, include_photo, reference, aml_screening, aml_monitoring."""
        return self._c._check("/identity/bvn", {"id_number": id_number, "first_name": first_name, "last_name": last_name, **kw})

    def bvn_face_match(self, *, id_number: str, first_name: Optional[str] = None, last_name: Optional[str] = None, liveness_session_id: Optional[str] = None, selfie_image: Optional[ImageInput] = None, **kw: Any) -> Json:
        """BVN lookup + face match. Send liveness_session_id (recommended) or selfie_image (bytes or base64)."""
        return self._c._check("/identity/bvn/face-match", {"id_number": id_number, "first_name": first_name, "last_name": last_name, "liveness_session_id": liveness_session_id, "selfie_image": selfie_image, **kw})

    def nin(self, *, id_number: str, **kw: Any) -> Json:
        return self._c._check("/identity/nin", {"id_number": id_number, **kw})

    def nin_face_match(self, *, id_number: str, liveness_session_id: Optional[str] = None, selfie_image: Optional[ImageInput] = None, **kw: Any) -> Json:
        return self._c._check("/identity/nin/face-match", {"id_number": id_number, "liveness_session_id": liveness_session_id, "selfie_image": selfie_image, **kw})

    def drivers_license(self, *, id_number: str, first_name: str, last_name: str, **kw: Any) -> Json:
        return self._c._check("/identity/drivers-license", {"id_number": id_number, "first_name": first_name, "last_name": last_name, **kw})

    def drivers_license_face_match(self, *, id_number: str, first_name: str, last_name: str, liveness_session_id: Optional[str] = None, selfie_image: Optional[ImageInput] = None, **kw: Any) -> Json:
        return self._c._check("/identity/drivers-license/face-match", {"id_number": id_number, "first_name": first_name, "last_name": last_name, "liveness_session_id": liveness_session_id, "selfie_image": selfie_image, **kw})

    def voters_card(self, *, id_number: str, first_name: str, last_name: str, **kw: Any) -> Json:
        return self._c._check("/identity/voters-card", {"id_number": id_number, "first_name": first_name, "last_name": last_name, **kw})

    def voters_card_face_match(self, *, id_number: str, first_name: str, last_name: str, liveness_session_id: Optional[str] = None, selfie_image: Optional[ImageInput] = None, **kw: Any) -> Json:
        return self._c._check("/identity/voters-card/face-match", {"id_number": id_number, "first_name": first_name, "last_name": last_name, "liveness_session_id": liveness_session_id, "selfie_image": selfie_image, **kw})

    def tin(self, *, id_number: str, reference: Optional[str] = None) -> Json:
        return self._c._check("/identity/tin", {"id_number": id_number, "reference": reference})


class _Business(_Resource):
    def cac(self, *, id_number: str, **kw: Any) -> Json:
        """CAC lookup (RC/BN/IT number). aml_screening=True screens the company and each director."""
        return self._c._check("/business/cac", {"id_number": id_number, **kw})


class _Verifications(_Resource):
    def list(self, **params: Any) -> Json:
        """Filters: type, service, status, reference, page, per_page."""
        return self._c._request("GET", "/verifications", query=params)

    def get(self, id: str) -> Json:
        """One verification, with its record."""
        return self._c._request("GET", f"/verifications/{_q(id)}")


class _Liveness(_Resource):
    def create_session(self, **params: Any) -> Json:
        """A hosted camera check: send the person to session["url"], then pass session["id"] to a face match."""
        return self._c._create("/liveness/sessions", params, "lv")

    def get_session(self, id: str) -> Json:
        return self._c._request("GET", f"/liveness/sessions/{_q(id)}")

    def simulate(self, id: str, *, outcome: str, face: Optional[str] = None) -> Json:
        """Sandbox only: finish a session without a camera (passed, failed or expired)."""
        return self._c._request("POST", f"/liveness/sessions/{_q(id)}/simulate", body={"outcome": outcome, "face": face})


class _Documents(_Resource):
    def verify(self, *, front_image: ImageInput, **params: Any) -> Json:
        """Read and check a photo of an ID. Images: bytes or base64. Also: back_image, document_type, liveness_session_id, selfie_image, verify_with_registry, reference."""
        return self._c._create("/documents/verify", {"front_image": front_image, **params}, "doc")

    def get(self, id: str) -> Json:
        return self._c._request("GET", f"/documents/{_q(id)}")


class _Monitors(_Resource):
    def create(self, *, name: str, **params: Any) -> Json:
        """Screen a name now and keep watching it (billed monthly)."""
        return self._c._create("/aml/monitors", {"name": name, **params}, "amon")

    def list(self, **params: Any) -> Json:
        return self._c._request("GET", "/aml/monitors", query=params)

    def get(self, id: str) -> Json:
        return self._c._request("GET", f"/aml/monitors/{_q(id)}")

    def stop(self, id: str) -> Json:
        return self._c._request("DELETE", f"/aml/monitors/{_q(id)}", retryable=True)


class _Aml(_Resource):
    def __init__(self, client: UVerify) -> None:
        super().__init__(client)
        self.monitors = _Monitors(client)

    def screen(self, *, name: str, **params: Any) -> Json:
        """Screen a person or organisation (entity_type="entity") against the UN, OFAC, UK, EU and Nigeria lists."""
        return self._c._create("/aml/screen", {"name": name, **params}, "aml")

    def get_screening(self, id: str) -> Json:
        return self._c._request("GET", f"/aml/screenings/{_q(id)}")

    def lists(self) -> Any:
        return self._c._request("GET", "/aml/lists")


class _Kyc(_Resource):
    def create_link(self, **params: Any) -> Json:
        """A hosted verification link: send link["url"] to your customer."""
        return self._c._create("/kyc/requests", params, "kyc")

    def get_link(self, id: str) -> Json:
        return self._c._request("GET", f"/kyc/requests/{_q(id)}")

    def list_links(self, **params: Any) -> Json:
        return self._c._request("GET", "/kyc/requests", query=params)


class _Account(_Resource):
    def balance(self) -> Json:
        return self._c._request("GET", "/balance")

    def pricing(self) -> Any:
        return self._c._request("GET", "/pricing")
