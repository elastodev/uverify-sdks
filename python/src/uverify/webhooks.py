from __future__ import annotations

import hashlib
import hmac
import json
import time
from typing import Any, Dict, Optional, Union

from .errors import UVerifySignatureError


def construct_event(raw_body: Union[bytes, str], signature_header: Optional[str], secret: str, tolerance_seconds: int = 300) -> Dict[str, Any]:
    """Verify a webhook and return its event (a dict: id, type, created_at, environment, data).

    Pass the raw request body exactly as received, the ``UVerify-Signature``
    header and your endpoint's signing secret (``whsec_...``). Raises
    :class:`UVerifySignatureError` if the signature doesn't match or the event
    is older than ``tolerance_seconds`` (a replay). Deliveries can repeat:
    dedupe on ``event["id"]``.
    """
    if not signature_header:
        raise UVerifySignatureError("Missing UVerify-Signature header.")
    if not secret:
        raise UVerifySignatureError("Missing webhook secret.")
    parts = dict(p.strip().split("=", 1) for p in signature_header.split(",") if "=" in p)
    t, v1 = parts.get("t"), parts.get("v1")
    if not t or not v1 or not t.isdigit():
        raise UVerifySignatureError("Malformed UVerify-Signature header.")
    body = raw_body.decode("utf-8") if isinstance(raw_body, (bytes, bytearray)) else raw_body
    expected = hmac.new(secret.encode(), f"{t}.{body}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, v1):
        raise UVerifySignatureError("Signature does not match. Check the secret and that you passed the raw body.")
    if tolerance_seconds > 0 and abs(time.time() - int(t)) > tolerance_seconds:
        raise UVerifySignatureError("Signature is too old (possible replay).")
    try:
        return json.loads(body)
    except ValueError as e:
        raise UVerifySignatureError("Body is not JSON.") from e


def sign_payload(body: str, secret: str, timestamp: Optional[int] = None) -> str:
    """Sign a payload the way UVerify does, for your own tests."""
    t = int(time.time()) if timestamp is None else timestamp
    return f"t={t},v1={hmac.new(secret.encode(), f'{t}.{body}'.encode(), hashlib.sha256).hexdigest()}"
