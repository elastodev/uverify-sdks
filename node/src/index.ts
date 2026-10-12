export { UVerify, VERSION } from './client.js';
/** UVerify is now Bytid: the same client under its new name. (ByteID, an earlier name, still works.) */
export { UVerify as Bytid } from './client.js';
export { UVerify as ByteID } from './client.js';
export type { UVerifyOptions } from './client.js';
export { UVerifyConnectionError, UVerifyError, UVerifySignatureError } from './errors.js';
export { constructEvent, signPayload } from './webhooks.js';
export type * from './types.js';

import { UVerify } from './client.js';
export default UVerify;
