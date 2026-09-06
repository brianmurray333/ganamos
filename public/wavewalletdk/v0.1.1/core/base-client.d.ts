import type { CreateWalletRequest, DepositRequest, ExitRequest, ExitStatusRequest, ExitSummaryRequest, GetExitPlanRequest, ListRequest, OpenWalletFromPasskeyRequest, ReceiveRequest, SendRequest, SweepWalletRequest, UnlockWalletRequest } from './requests.ts';
import type { Balance, CreateWalletResult, DepositResult, ExitResult, ExitStatusResult, ExitSummaryResult, GetExitPlanResult, ListResult, OpenWalletFromPasskeyResult, PrepareSendResult, ReceiveResult, SendResult, SweepWalletResult, UnlockWalletResult } from './results.ts';
import { type RuntimeConfig } from './config.ts';
import type { WavelengthClient } from './client.ts';
import type { WavelengthEvent, WavelengthListener } from './events.ts';
import type { WalletInfo, WalletStatus } from './state.ts';
import type { FacadeMethod, ServerTransport } from './facade.ts';
import type { Entry } from './generated.ts';
import { type ActivityStreamOptions } from './activity-options.ts';
/**
 * Implements the transport-agnostic half of {@link WavelengthClient}: every RPC
 * verb is expressed in terms of the abstract invokeFacade, so a transport (web
 * wasm, React Native gomobile, or a future one) supplies only the pipe:
 * invokeFacade, ready, the activity-stream plumbing, and its {@link ServerTransport}
 * flavor. The shared subscribe/emit listener machinery and typed wrappers live
 * here. The facade catalog, public contract, native dispatch, and response
 * normalization remain separate synchronization points.
 */
export declare abstract class BaseWavelengthClient implements WavelengthClient {
    #private;
    protected readonly listeners: Set<WavelengthListener>;
    abstract ready(): Promise<void>;
    protected abstract invokeFacade<T = unknown>(method: FacadeMethod, params?: unknown): Promise<T>;
    protected abstract openActivityStream(opts: ActivityStreamOptions): Promise<void>;
    abstract stopActivity(): void;
    /** How this transport's daemon dials the Ark and swap servers. */
    protected abstract readonly serverTransport: ServerTransport;
    callFacade<T = unknown>(method: FacadeMethod, params?: unknown): Promise<T>;
    protected callFacadeInternal<T = unknown>(method: FacadeMethod, params?: unknown): Promise<T>;
    isRunning(): Promise<boolean>;
    startActivity(opts?: ActivityStreamOptions): Promise<void>;
    /**
     * Runs a runtime lifecycle operation serialized against every other one on
     * this client, in invocation order. A transport that owns an exclusive
     * resource for the daemon's lifetime (the web transport's cross-tab runtime
     * lock) routes its start()/stop() through this so overlapping host calls
     * cannot interleave: two starts cannot share one lock lease, and a stop cannot
     * release the lock while a start is still opening the databases. A failed
     * operation does not poison the queue for the next caller.
     */
    protected enqueueLifecycle<T>(op: () => Promise<T>): Promise<T>;
    start(config: RuntimeConfig): Promise<WalletInfo>;
    stop(): Promise<void>;
    /**
     * Called at the very start of a stop, before the daemon RPC, so a transport
     * can capture whatever identifies the session being stopped (the web
     * transport's runtime-lock lease). The value is handed back to
     * {@link afterDaemonStopped}. Default: nothing to capture.
     */
    protected beforeDaemonStop(): unknown;
    /**
     * Called once the daemon has acknowledged a stop and before subscribers are
     * told about it. A transport holding an exclusive resource for the daemon's
     * lifetime (the web transport's cross-tab runtime lock, say) releases it
     * here: the acknowledgement is the proof the daemon let its storage go, and
     * running before the event means a subscriber that restarts the runtime
     * cannot race the release. Not called when the stop call fails, because an
     * unacknowledged stop is no evidence the daemon is down.
     *
     * Receives the token {@link beforeDaemonStop} captured, so the release can be
     * scoped to the session this stop belongs to and a stop whose start has
     * already been superseded frees nothing. Awaited, so a transport whose
     * release only completes asynchronously (the Web Locks API frees a lock when
     * the holder's promise settles, not when it is asked to) can resolve once the
     * resource is genuinely free.
     */
    protected afterDaemonStopped(_token?: unknown): void | Promise<void>;
    getInfo(): Promise<WalletInfo>;
    status(): Promise<WalletStatus>;
    balance(): Promise<Balance>;
    createWallet(req: CreateWalletRequest): Promise<CreateWalletResult>;
    unlockWallet(req: UnlockWalletRequest): Promise<UnlockWalletResult>;
    openWalletFromPasskey(req: OpenWalletFromPasskeyRequest): Promise<OpenWalletFromPasskeyResult>;
    deposit(req?: DepositRequest): Promise<DepositResult>;
    receive(req: ReceiveRequest): Promise<ReceiveResult>;
    prepareSend(req: SendRequest): Promise<PrepareSendResult>;
    sendPrepared(prepared: PrepareSendResult): Promise<SendResult>;
    send(req: SendRequest): Promise<SendResult>;
    list(req?: ListRequest): Promise<ListResult>;
    exit(req: ExitRequest): Promise<ExitResult>;
    exitStatus(req: ExitStatusRequest): Promise<ExitStatusResult>;
    exitSummary(req?: ExitSummaryRequest): Promise<ExitSummaryResult>;
    getExitPlan(req: GetExitPlanRequest): Promise<GetExitPlanResult>;
    sweepWallet(req: SweepWalletRequest): Promise<SweepWalletResult>;
    subscribe(listener: WavelengthListener): () => void;
    protected emit(event: WavelengthEvent): void;
    protected normalizeActivityEntry(raw: unknown): Entry;
    /**
     * Closes the activity stream and unsubscribes all listeners. The concrete
     * transports override this to also tear down their runtime (terminate the
     * Worker, or drop the main-thread runtime listener).
     */
    dispose(): void;
}
//# sourceMappingURL=base-client.d.ts.map