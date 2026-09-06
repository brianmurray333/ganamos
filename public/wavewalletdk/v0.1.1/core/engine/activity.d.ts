import type { WavelengthClient } from '../client.ts';
import type { Entry } from '../results.ts';
/**
 * Owns the daemon activity subscription while the wallet is ready: opening
 * (with an includeExisting replay so changes missed while down are caught),
 * reopening with a capped exponential backoff, debouncing activity events into
 * onActivity, and giving up through onDead after too many consecutive failed
 * opens (the counter includes the initial open, not just reopens).
 */
export declare class ActivityStream {
    #private;
    constructor(opts: {
        client: Pick<WavelengthClient, 'startActivity' | 'stopActivity'>;
        onActivity: () => void;
        onReconcile: () => void;
        onDead: (error: Error) => void;
    });
    start(): void;
    stop(): void;
    /**
     * Returns the preimage seen for a payment hash, or undefined. It is the only
     * route to a settled send's proof of payment; see #preimages.
     */
    preimageFor(paymentHash: string): string | undefined;
    /** Every preimage seen so far, for merging into a refreshed snapshot. */
    preimages(): ReadonlyMap<string, string>;
    /** Forwarded 'activity' client events; debounced into one onActivity call. */
    noteActivity(entry: Pick<Entry, 'cursor'> & Partial<Entry>): void;
    /** Forwarded 'activityStream' client events: the stream was lost; reopen. */
    noteStreamLost(): void;
}
//# sourceMappingURL=activity.d.ts.map