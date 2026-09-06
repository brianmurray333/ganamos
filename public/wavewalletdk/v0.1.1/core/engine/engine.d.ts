import type { WavelengthClient } from '../client.ts';
import type { RuntimeConfig } from '../config.ts';
import { type WavelengthPerformanceListener } from '../performance.ts';
import { type ExitBatchEvent, type ExitBatchOptions, type ExitBatchResult } from '../exit.ts';
import type { CreateWalletRequest, DepositRequest, ExitRequest, ExitStatusRequest, ExitSummaryRequest, GetExitPlanRequest, ListRequest, OpenWalletFromPasskeyRequest, ReceiveRequest, RestoreWalletRequest, SendRequest, SweepWalletRequest, UnlockWalletRequest } from '../requests.ts';
import type { CreateWalletResult, DepositResult, Entry, ExitResult, ExitStatusResult, ExitSummaryResult, GetExitPlanResult, ListResult, OpenWalletFromPasskeyResult, PrepareSendResult, ReceiveResult, SendResult, SweepWalletResult, UnlockWalletResult } from '../results.ts';
import { type WalletInfo } from '../state.ts';
import type { WalletSnapshot } from './snapshot.ts';
/** The instrumentation options every arm of {@link WalletEngineOptions} shares. */
type WalletEnginePerformanceOptions = {
    /**
     * Receives structured timing samples for runtime readiness, wallet
     * create/open RPCs, post-operation info adoption, and sync polling. Omit it
     * to keep performance instrumentation disabled.
     */
    onPerformance?: WavelengthPerformanceListener;
};
/**
 * Options for {@link createWalletEngine}. A discriminated union: the type
 * requires config when autoStart is true, so autoStart cannot be set without
 * a config to start from.
 */
export type WalletEngineOptions = WalletEnginePerformanceOptions & ({
    /** The transport client the engine drives. */
    client: WavelengthClient;
    /** Default runtime config used by autoStart and by start() with no argument. */
    config: RuntimeConfig;
    /** Start the runtime automatically once it is ready. */
    autoStart: true;
} | {
    /** The transport client the engine drives. */
    client: WavelengthClient;
    /** Default runtime config used by start() with no argument. */
    config?: RuntimeConfig;
    /** Start the runtime automatically once it is ready. Requires config; omit or set false when config is unset. */
    autoStart?: false;
});
/**
 * Removes a key from every arm of a union type. TypeScript's built-in Omit
 * does not distribute over unions (it flattens to the union of all keys
 * first), which would erase the discriminant on types like
 * {@link WalletEngineOptions}. This distributes the omission per arm instead.
 */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/**
 * The headless wallet orchestrator: it owns the lifecycle phase machine, the
 * state snapshot (phase, info, balance, activity, recovery, logs), and the
 * background processes that keep them fresh (activity stream, settle
 * reconcile, syncing poll, restore readiness poll). Framework bindings
 * subscribe via getSnapshot()/subscribe(); vanilla consumers can use it
 * directly. Create one with {@link createWalletEngine} or a transport factory
 * such as createWebWalletEngine.
 */
export interface WalletEngine {
    /** The underlying transport client, as an escape hatch. */
    readonly client: WavelengthClient;
    /** The current immutable state snapshot. */
    getSnapshot(): WalletSnapshot;
    /** Subscribes to snapshot changes; returns the unsubscribe function. */
    subscribe(listener: () => void): () => void;
    /**
     * Starts the runtime. Falls back to the engine's configured config when
     * called without an argument; throws if neither exists. On success it
     * dispatches the info and best-effort refreshes; a failure moves the phase to
     * 'error' and rejects. Either way, a stop() the host issued while the start
     * was in flight takes precedence: that stop governs the phase, and the start
     * leaves the snapshot to it (no info dispatch and no refresh on success, no
     * error surfaced on failure). The promise still settles the ordinary way,
     * resolving with the info or rejecting.
     */
    start(config?: RuntimeConfig): Promise<WalletInfo>;
    /** Stops the runtime and clears the in-memory snapshot (info, balance, activity, error); persisted wallet data is untouched. A failure moves the phase to 'error'. */
    stop(): Promise<void>;
    /** Re-fetches info, balance, and activity concurrently. */
    refresh(): Promise<void>;
    /** Creates a new wallet, refetches info, and refreshes in the background. */
    createWallet(req: CreateWalletRequest): Promise<CreateWalletResult>;
    /**
     * Restores a wallet from a mnemonic. Resolves as soon as the restored
     * wallet is usable; the optional server-assisted recovery scan continues in
     * the background, observed through snapshot.recovery. Rejects when the
     * restore fails before the wallet came up, when a restore is already in
     * flight, when req.mnemonic is missing or empty, or if the engine has been
     * disposed.
     */
    restoreWallet(req: RestoreWalletRequest): Promise<WalletInfo>;
    /** Resets snapshot.recovery to idle (e.g. after dismissing a banner). */
    acknowledgeRecovery(): void;
    /** Unlocks an existing wallet, refetches info, and refreshes in the background. */
    unlockWallet(req: UnlockWalletRequest): Promise<UnlockWalletResult>;
    /** Opens the wallet from a passkey PRF output, refetches info, and refreshes in the background. */
    openWalletFromPasskey(req: OpenWalletFromPasskeyRequest): Promise<OpenWalletFromPasskeyResult>;
    /** Requests an on-chain deposit address and refreshes in the background. */
    deposit(req?: DepositRequest): Promise<DepositResult>;
    /** Requests a Lightning receive and refreshes in the background. */
    receive(req: ReceiveRequest): Promise<ReceiveResult>;
    /** Quotes a payment without dispatching it. No refresh: a quote moves no money. */
    prepareSend(req: SendRequest): Promise<PrepareSendResult>;
    /** Dispatches a payment quoted by prepareSend and refreshes in the background. */
    sendPrepared(prepared: PrepareSendResult): Promise<SendResult>;
    /** Sends a payment and refreshes in the background. */
    send(req: SendRequest): Promise<SendResult>;
    /** Starts a single exit (cooperative or unilateral) and refreshes wallet state. */
    exit(req: ExitRequest): Promise<ExitResult>;
    /** Queries the status of an exit. Read-only; does not refresh. */
    exitStatus(req: ExitStatusRequest): Promise<ExitStatusResult>;
    /** Summarizes all in-progress exits. Read-only; does not refresh. */
    exitSummary(req?: ExitSummaryRequest): Promise<ExitSummaryResult>;
    /** Previews unilateral-exit readiness and funding. Read-only; does not refresh. */
    getExitPlan(req: GetExitPlanRequest): Promise<GetExitPlanResult>;
    /** Previews (broadcast:false) or broadcasts (broadcast:true) a backing-wallet sweep. Refreshes only when broadcasting. */
    sweepWallet(req: SweepWalletRequest): Promise<SweepWalletResult>;
    /**
     * Starts a batch of exits, refreshing wallet state after each one starts.
     * Resolves once every exit is started, not completed.
     */
    exitBatch(opts: ExitBatchOptions & {
        signal?: AbortSignal;
        onEvent?: (event: ExitBatchEvent) => void;
    }): Promise<ExitBatchResult>;
    /** Lists wallet activity, VTXOs, or on-chain outputs. Read-only; does not refresh. */
    list(req: ListRequest): Promise<ListResult>;
    /** Clears the buffered log tail. */
    clearLogs(): void;
    /** Tears down subscriptions, polls, and streams. The engine is done after this. */
    dispose(): void;
}
/** Creates a {@link WalletEngine} over any transport client. */
export declare function createWalletEngine(options: WalletEngineOptions): WalletEngine;
/**
 * Puts back the preimages the list snapshot drops.
 *
 * The daemon reveals a send's preimage once, on the stream entry it pushes at
 * settle, and never again: every list read returns the entry with the field
 * empty. So a refresh would otherwise erase proof of payment that the SDK had
 * already seen, and a caller who blinked would have no way to get it back.
 *
 * Entries that already carry a preimage, or for which none was ever seen, are
 * returned untouched, so this allocates nothing in the ordinary case and never
 * invents a value it was not given.
 */
export declare function restorePreimages(entries: readonly Entry[], preimages: ReadonlyMap<string, string>): Entry[];
export {};
//# sourceMappingURL=engine.d.ts.map