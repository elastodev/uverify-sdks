"""Official Python library for the Bytid API (https://www.bytid.com/docs), formerly UVerify."""

from .client import VERSION, UVerify
from .errors import UVerifyConnectionError, UVerifyError, UVerifySignatureError
from .webhooks import construct_event, sign_payload

#: UVerify is now Bytid: the same client under its new name. ByteID, an earlier name, still works.
Bytid = UVerify
ByteID = UVerify

__version__ = VERSION
__all__ = ["Bytid", "ByteID", "UVerify", "UVerifyError", "UVerifyConnectionError", "UVerifySignatureError", "construct_event", "sign_payload", "__version__"]
