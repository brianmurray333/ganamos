import type { Balance } from '../results.ts';
/**
 * Whether two balance snapshots carry the same figures. The settle reconcile
 * uses it to decide when a post-activity re-read has caught up: once the
 * balance stops changing across reads there is nothing left to reconcile.
 */
export declare function balancesEqual(a: Balance | null, b: Balance | null): boolean;
/** The outcome of one serialized background refresh; never a rejection. */
export type BackgroundRefreshResult = {
    ok: boolean;
    balance: Balance | null;
};
type SettleReconcilerOptions = {
    refresh: () => Promise<BackgroundRefreshResult>;
    baseline: () => Balance | null;
};
/**
 * Balance can lag the activity event that announced a settled entry: the
 * daemon may report the entry complete a beat before balance() reflects the
 * new funds. A single refresh would then capture a stale balance and, with no
 * polling while ready, leave it stale until a manual refresh. Each activity
 * event triggers a cycle: one refresh, then bounded re-reads that stop only
 * once the balance has moved off the pre-event baseline and then held steady.
 * Equality of two consecutive reads alone cannot distinguish settled from
 * still-lagging, so when the balance never moves the whole bounded schedule
 * is probed. A failed refresh deliberately ends the cycle rather than continuing
 * the probe schedule; the next activity event or manual refresh converges it.
 */
export declare class SettleReconciler {
    #private;
    constructor(opts: SettleReconcilerOptions);
    trigger(): void;
    cancel(): void;
}
export {};
//# sourceMappingURL=reconcile.d.ts.map