"""Official Python library for the UVerify API (https://uverify.com.ng/docs)."""

from .client import VERSION, UVerify
from .errors import UVerifyConnectionError, UVerifyError, UVerifySignatureError
from .webhooks import construct_event, sign_payload

__version__ = VERSION
__all__ = ["UVerify", "UVerifyError", "UVerifyConnectionError", "UVerifySignatureError", "construct_event", "sign_payload", "__version__"]
