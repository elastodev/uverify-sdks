"""Official Python library for the ByteID API (https://byteid.ng/docs), formerly UVerify."""

from .client import VERSION, UVerify
from .errors import UVerifyConnectionError, UVerifyError, UVerifySignatureError
from .webhooks import construct_event, sign_payload

#: UVerify is now ByteID: the same client under its new name.
ByteID = UVerify

__version__ = VERSION
__all__ = ["ByteID", "UVerify", "UVerifyError", "UVerifyConnectionError", "UVerifySignatureError", "construct_event", "sign_payload", "__version__"]
