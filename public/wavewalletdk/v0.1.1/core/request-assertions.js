import { FORCE_UNROLL_ACK } from "./requests.js";
const cooperativeExit = { outpoint: 'tx:0', destination: 'bcrt1q...' };
const unilateralExit = { outpoint: 'tx:0', forceUnrollAck: FORCE_UNROLL_ACK };
// @ts-expect-error destination and force acknowledgement are mutually exclusive.
const invalidExit = {
    outpoint: 'tx:0',
    destination: 'bcrt1q...',
    forceUnrollAck: FORCE_UNROLL_ACK,
};
void cooperativeExit;
void unilateralExit;
void invalidExit;
