import { type WalletSnapshot } from './snapshot.ts';
/**
 * A minimal immutable snapshot holder: getSnapshot/subscribe for consumers
 * (React's useSyncExternalStore contract) and update(patch) for the engine.
 * getSnapshot and subscribe are arrow-function properties so their identities
 * are stable across the engine's lifetime.
 */
export declare class SnapshotStore {
    #private;
    getSnapshot: () => WalletSnapshot;
    subscribe: (listener: () => void) => (() => void);
    /**
     * Shallow-merges the patch into a fresh snapshot and notifies listeners.
     * Skips the allocation and the notification entirely when every key in the
     * patch is already Object.is-equal to the current value: a no-op patch
     * would otherwise still mint a new snapshot object and fire every
     * subscriber for nothing.
     */
    update(patch: Partial<WalletSnapshot>): void;
}
//# sourceMappingURL=store.d.ts.map