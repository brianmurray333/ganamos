import { BaseWavelengthClient } from '@lightninglabs/wavelength-core';
import type { ActivityStreamOptions, FacadeMethod, RuntimeConfig, WalletInfo } from '@lightninglabs/wavelength-core';
import type { WebClientOptions } from '../index.ts';
/**
 * Runs the wasm runtime on the page's main thread. It is the escape hatch for
 * environments without Web Worker support (or where main-thread execution is
 * preferred); select it via createWebClient({ runtimeThread: 'main' }). Unlike
 * worker mode it blocks rendering while the runtime is busy.
 */
export declare class MainThreadWavelengthClient extends BaseWavelengthClient {
    protected readonly serverTransport: "rest";
    private loadPromise;
    private activityHandle;
    private activityOpen;
    private activityGeneration;
    private readonly lock;
    private lease;
    private runtimeExited;
    private disposed;
    private readonly runtimeBaseUrl;
    private readonly debug;
    private readonly onPerformance;
    private readonly runtimeCache;
    private readonly onRuntimeReady;
    constructor(options?: WebClientOptions);
    dispose(): void;
    ready(): Promise<void>;
    start(config: RuntimeConfig): Promise<WalletInfo>;
    stop(): Promise<void>;
    private startLocked;
    protected beforeDaemonStop(): unknown;
    protected afterDaemonStopped(token?: unknown): Promise<void>;
    protected invokeFacade<T = unknown>(method: FacadeMethod, params?: unknown): Promise<T>;
    private logNearMissLock;
    protected openActivityStream(opts: ActivityStreamOptions): Promise<void>;
    stopActivity(): void;
    private pumpActivity;
    private ensureLoaded;
    private loadRuntime;
}
//# sourceMappingURL=main.d.ts.map