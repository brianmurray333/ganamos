/** Bounds the in-memory log tail the engine keeps. */
export declare const MAX_LOGS = 200;
/** Consecutive failed activity-stream opens before the stream is dead. */
export declare const STREAM_FAILURE_LIMIT = 5;
/** Initial reopen backoff for a lost activity stream. */
export declare const STREAM_BACKOFF_MS = 1000;
/** Safety ceiling on activity-stream reopen backoff. Only approached when reopen attempts hang while losses keep arriving, doubling the backoff each time without incrementing the failure count. */
export declare const STREAM_BACKOFF_CAP_MS = 30000;
/** Debounce applied to activity events before the background refresh runs. */
export declare const ACTIVITY_DEBOUNCE_MS = 250;
/** Interval of the refresh poll while the wallet is syncing. */
export declare const SYNC_POLL_MS = 2000;
/** Consecutive failed sync-poll refreshes before escalating to error. */
export declare const SYNC_POLL_FAILURE_LIMIT = 5;
/** Interval of the readiness poll during a background restore. */
export declare const RESTORE_POLL_MS = 1500;
/**
 * Follow-up refresh delays used to reconcile a possibly-stale balance after an
 * activity event: the daemon can report an entry settled a beat before
 * balance() reflects the new funds.
 */
export declare const SETTLE_RECONCILE_DELAYS_MS: number[];
/** Consecutive failed background refreshes before escalating to error. */
export declare const BACKGROUND_REFRESH_FAILURE_LIMIT = 5;
/** Retries for the post-create/unlock info refetch before escalating. */
export declare const ADOPT_INFO_RETRIES = 3;
/** Delay between #adoptInfo retries. */
export declare const ADOPT_INFO_RETRY_MS = 1000;
//# sourceMappingURL=constants.d.ts.map