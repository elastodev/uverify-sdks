export { UVerify, VERSION } from './client.js';
/** UVerify is now ByteID: the same client under its new name. */
export { UVerify as ByteID } from './client.js';
export type { UVerifyOptions } from './client.js';
export { UVerifyConnectionError, UVerifyError, UVerifySignatureError } from './errors.js';
export { constructEvent, signPayload } from './webhooks.js';
export type * from './types.js';

import { UVerify } from './client.js';
export default UVerify;
