import { BaseWavelengthClient } from '@lightninglabs/wavelength-core';
import type { ActivityStreamOptions, FacadeMethod, RuntimeConfig, WalletInfo } from '@lightninglabs/wavelength-core';
import type { WebClientOptions } from '../index.ts';
/**
 * Runs the wasm runtime in a dedicated Web Worker to keep the UI thread free. It
 * is the default transport; the class is not exported directly, so select it via
 * createWebClient() (or pass runtimeThread: 'main' for the main-thread escape
 * hatch). Worker mode needs a daemon that stores the encrypted seed in OPFS
 * rather than localStorage (which is window-only and absent in Workers); the
 * shipped daemon does, as of lightninglabs/wavelength#811.
 */
export declare class WorkerWavelengthClient extends BaseWavelengthClient {
    protected readonly serverTransport: "rest";
    private worker;
    private readonly pending;
    private readonly lock;
    private readonly options;
    private readonly onPerformance;
    private nextRequestID;
    private lease;
    private runtimeExited;
    private disposed;
    constructor(options?: WebClientOptions);
    private spawnWorker;
    private replaceWorker;
    private killWorker;
    private announceRuntimeStopped;
    ready(): Promise<void>;
    start(config: RuntimeConfig): Promise<WalletInfo>;
    stop(): Promise<void>;
    private startLocked;
    protected beforeDaemonStop(): unknown;
    protected afterDaemonStopped(token?: unknown): Promise<void>;
    protected invokeFacade<T = unknown>(method: FacadeMethod, params?: unknown): Promise<T>;
    private request;
    protected openActivityStream(opts: ActivityStreamOptions): Promise<void>;
    stopActivity(): void;
    private handleMessage;
    private logNearMissLock;
    private rejectAll;
    dispose(): void;
}
//# sourceMappingURL=worker.d.ts.map