from __future__ import annotations

from typing import Any, Optional


class UVerifyError(Exception):
    """Every API error. Branch on ``code``: it's stable (https://uverify.com.ng/docs#responses)."""

    def __init__(self, message: str, *, code: str, status: int, request_id: Optional[str] = None, details: Any = None) -> None:
        super().__init__(message)
        self.message = message
        #: e.g. validation_error, insufficient_balance, duplicate_reference, rate_limited
        self.code = code
        #: HTTP status (0 when no response arrived)
        self.status = status
        #: Quote this to UVerify support to trace the request
        self.request_id = request_id
        #: Field errors for validation_error; retry_after_seconds for rate_limited; ...
        self.details = details

    def __repr__(self) -> str:
        return f"UVerifyError(code={self.code!r}, status={self.status}, message={self.message!r}, request_id={self.request_id!r})"


class UVerifyConnectionError(UVerifyError):
    """The request didn't complete (timeout, DNS, connection reset). Safe to retry with the same reference."""

    def __init__(self, message: str) -> None:
        super().__init__(message, code="connection_error", status=0)


class UVerifySignatureError(Exception):
    """A webhook failed signature or timestamp verification. Don't trust its body."""
