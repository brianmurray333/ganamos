import { INITIAL_SNAPSHOT } from "./snapshot.js";
/**
 * A minimal immutable snapshot holder: getSnapshot/subscribe for consumers
 * (React's useSyncExternalStore contract) and update(patch) for the engine.
 * getSnapshot and subscribe are arrow-function properties so their identities
 * are stable across the engine's lifetime.
 */
export class SnapshotStore {
    #snapshot = INITIAL_SNAPSHOT;
    #listeners = new Set();
    getSnapshot = () => this.#snapshot;
    subscribe = (listener) => {
        this.#listeners.add(listener);
        return () => {
            this.#listeners.delete(listener);
        };
    };
    /**
     * Shallow-merges the patch into a fresh snapshot and notifies listeners.
     * Skips the allocation and the notification entirely when every key in the
     * patch is already Object.is-equal to the current value: a no-op patch
     * would otherwise still mint a new snapshot object and fire every
     * subscriber for nothing.
     */
    update(patch) {
        let changed = false;
        for (const key in patch) {
            if (!Object.is(this.#snapshot[key], patch[key])) {
                changed = true;
                break;
            }
        }
        if (!changed) {
            return;
        }
        this.#snapshot = { ...this.#snapshot, ...patch };
        for (const listener of [...this.#listeners]) {
            try {
                listener();
            }
            catch {
                // A throwing listener must not break the store or other listeners.
            }
        }
    }
}
