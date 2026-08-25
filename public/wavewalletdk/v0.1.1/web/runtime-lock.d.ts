/**
 * The Web Locks name guarding the wasm runtime for this origin. The lock is
 * scoped to the whole runtime per origin, not to any single storage path,
 * because the daemon opens several exclusive OPFS SQLite stores whose paths are
 * configured independently: the wallet database under `dataDir`, the swap
 * database at its own `swapDatabaseFileName`, and paths chosen by daemon
 * defaults. Only one tab (or window) per origin can run the wallet at a time,
 * and a second tab detects that here before booting anything. Keying the lock
 * by `dataDir` alone would let two tabs that differ only in `dataDir` but share,
 * for example, the default swap database boot together and collide on it.
 */
export declare const RUNTIME_LOCK_NAME = "wavelength-web-runtime";
/** Options for {@link RuntimeLock}. */
export type RuntimeLockOptions = {
    /**
     * Receives a warning when the lock cannot work as intended: the browser has
     * no Web Locks API, or a release did not settle cleanly. A transport passes
     * one so the message reaches the host's log channel instead of only the
     * developer console, where an end user never sees it.
     */
    onWarn?: (message: string) => void;
};
/**
 * Reports whether a raw daemon or SQLite failure message describes the wallet
 * database being held by another browser context. Used to map such failures to
 * the `wallet_locked` error code on a browser with no Web Locks support, where
 * there is no pre-check to catch them.
 *
 * This is a best-effort backstop, not the guarantee: the Web Lock is what
 * actually keeps a second tab from opening the databases, and on every browser
 * that ships the Web Locks API a second tab is rejected before its daemon runs,
 * so this classifier is never consulted there. Matching daemon prose is
 * inherently partial, and it can drift in either direction (the daemon rewording
 * a contention error, or a failure shape it never anticipated). It only widens
 * the set of contention messages the no-Web-Locks path can still surface as
 * `wallet_locked`; a message it does not match falls through to a generic error,
 * and one it matches by mistake would mislead a sole tab, so the fragments are
 * kept narrow rather than broad. Widening the pattern requires confirming the
 * daemon's actual contention strings first.
 *
 * Every fragment names cross-context contention specifically. Two neighbouring
 * messages are deliberately excluded, because both occur with nothing held by
 * another tab and would send the user hunting for a window that does not
 * exist: the daemon's fail-closed open ("persistent storage required"), which
 * a sole tab in a browser without persistent storage reports too, and the
 * SQLite worker's duplicate-open guard ("already open in this worker"), which
 * describes this tab's own worker.
 */
export declare function isWalletLockedMessage(message: string): boolean;
/**
 * Reports whether a message that {@link isWalletLockedMessage} rejected still
 * names the browser storage layer. Matching daemon prose is inherently brittle:
 * if the daemon rewords a contention error, classification silently degrades to
 * a generic failure and the host stops offering the multi-tab advice. A near
 * miss is the only signal that has happened, so transports log one rather than
 * letting the drift pass unnoticed.
 *
 * It deliberately looks for the storage subsystem rather than the word "lock",
 * which a wallet uses constantly for something unrelated: a wallet waiting to
 * be unlocked reports being locked on a completely routine path, and treating
 * that as a near miss would bury the real signal in noise.
 *
 * The `\bbusy\b` fragment is broader than the SQLite-specific ones and can match
 * unrelated prose (a "server busy" message, say). That is tolerable here: a near
 * miss only escalates a warn-level drift log and never changes control flow, so
 * a rare false positive costs a stray warn, not a misclassified error.
 */
export declare function isNearMissLockMessage(message: string): boolean;
/**
 * A lease identifies one acquisition of the {@link RuntimeLock}. Every
 * {@link RuntimeLock.acquire} mints a fresh lease, and release only frees the
 * grant when handed the lease that currently owns it. A release from a
 * superseded session (a stop whose start has already handed the runtime on, a
 * dead worker's late teardown) presents an old lease and is therefore inert,
 * which is what stops one session from freeing the lock another is relying on.
 */
export type RuntimeLockLease = number;
export declare const NO_RUNTIME_LEASE: RuntimeLockLease;
/**
 * A held-until-released Web Lock around the wallet runtime. acquire() fails
 * fast with a `wallet_locked` {@link WavelengthError} when another tab already
 * holds the runtime, instead of letting the daemon boot and trip over the
 * exclusive OPFS SQLite handles. On browsers without the Web Locks API
 * acquire() is a no-op; the daemon-side "database is locked" failure remains
 * the backstop there.
 *
 * The browser releases the lock automatically when the holding tab closes or
 * crashes, so a stale lock cannot outlive its tab.
 *
 * Every acquire() returns a {@link RuntimeLockLease}; releases must present the
 * lease they took, and act only when it still owns the grant. Callers thread
 * their lease through every teardown path so a release from a session that has
 * already been superseded does nothing.
 */
export declare class RuntimeLock {
    #private;
    constructor(options?: RuntimeLockOptions);
    /**
     * Whether a grant is currently held, i.e. a session is already running under
     * this lock. A caller checks this before {@link acquire} to tell a redundant
     * start (the lock is already ours) from a fresh one, so it can coalesce
     * rather than re-invoke the daemon on an already-running session. It reports
     * only the settled `held` state: while a request is still in flight
     * (`acquiring`) or a release is draining (`settling`) it is false, which is
     * correct, because in neither case is there a live grant to coalesce onto.
     */
    get held(): boolean;
    /**
     * Acquires the runtime lock, resolving with the lease once held. Idempotent
     * while held (a repeat acquire mints a new lease on the same grant, so the
     * newer caller owns the release) and coalescing while a request is in flight.
     *
     * Rejects with `wallet_locked` when another context holds the lock, the
     * expected multi-tab condition a host shows actionable copy for. Rejects with
     * `runtime_lock_unavailable` when the browser refused or dropped the lock
     * request itself (for example while the document is shutting down), which says
     * nothing about other tabs.
     */
    acquire(): Promise<RuntimeLockLease>;
    /**
     * Releases the lock held under `lease` and resolves once the browser has
     * actually freed it. A no-op when `lease` no longer owns the grant (a newer
     * acquire has taken over) or nothing is held, so a release from a superseded
     * session cannot free a lock a live one depends on. Reentrant: a second
     * release while one is settling rides the same settle rather than reporting
     * the lock free early.
     *
     * Asking for a release only settles the promise the holder handed the Web
     * Locks API; the lock becomes available to another context a turn later. Use
     * this wherever the caller is about to tell someone the wallet is free.
     */
    releaseAndSettle(lease: RuntimeLockLease): Promise<void>;
}
//# sourceMappingURL=runtime-lock.d.ts.map