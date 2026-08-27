import { WavelengthError, type WavelengthPerformanceListener } from '@lightninglabs/wavelength-core';
/**
 * Resolves a runtime asset name against an optional base URL. With no base the
 * bare name is returned so it resolves relative to the page; otherwise the name
 * is resolved against the base (a trailing slash is added when missing).
 */
export declare function resolveRuntimeAsset(base: string | undefined, name: string): string;
/**
 * Builds an actionable failure for a runtime binary that could not be loaded: it
 * names the URL that failed and points at runtimeBaseUrl, which is almost always
 * the cause (assets not hosted, or the base set wrong). The daemon binaries to
 * host are listed in RUNTIME_ASSET_FILES.
 */
export declare function runtimeAssetError(url: string): WavelengthError;
/**
 * Reports whether a failure message came from {@link runtimeAssetError}. The
 * worker raises it inside its own scope, where the code cannot cross
 * postMessage, so the client recovers the classification from the text. This
 * string is the SDK's own, but the worker is plain JS and cannot import
 * runtimeAssetError: the literal is hand-copied in wavewalletdk-worker.js at the
 * fetch throws (the response was not ok). Those copies are the wording of
 * record; keep this regex in sync with them, not only with runtimeAssetError
 * here. A wasm that fetched but will not instantiate is deliberately left out:
 * the asset arrived, so the worker throws a distinct "failed to instantiate"
 * message that stays a generic error, matching the main-thread path, which lets
 * the raw instantiate failure propagate rather than recode it as asset_load_failed.
 */
export declare function isRuntimeAssetMessage(message: string): boolean;
/**
 * Injects a `<script>` tag for the given source and resolves once it loads. A
 * second call for an already-present src resolves immediately, so the same asset
 * is never loaded twice.
 */
export declare function loadScript(src: string): Promise<void>;
/**
 * Resolves once the wasm runtime is ready, either immediately when the global
 * wavewalletdkCall hook is already installed or on the next 'wavewalletdk-ready'
 * event.
 */
export declare function waitForReadyEvent(): Promise<void>;
/**
 * Returns the global wavewalletdkCall hook the wasm runtime installs, or
 * undefined before the runtime has booted.
 */
export declare function wavewalletdkCall(): ((method: string, params?: unknown) => Promise<unknown>) | undefined;
/**
 * Fetches one runtime asset and instantiates it, inflating first when its bytes
 * are gzip.
 *
 * The response's own Content-Type is deliberately not consulted.
 * `instantiateStreaming` requires `application/wasm` and hosts are unreliable
 * about sending it, so the body is rewrapped in a response this module labels
 * itself. That is also what keeps the compressed path streaming: inflated bytes
 * feed compilation as they arrive rather than being buffered whole first.
 *
 * `path` only tags the performance samples; it never selects behavior.
 */
export declare function instantiateRuntimeAsset(url: string, path: string, importObject: WebAssembly.Imports, onPerformance?: WavelengthPerformanceListener, runtimeCache?: boolean): Promise<WebAssembly.WebAssemblyInstantiatedSource>;
/**
 * Instantiates the wasm module, preferring the gzip-compressed binary and
 * falling back to the uncompressed one (logging a warning) if it cannot be
 * loaded at all.
 *
 * Both assets go through the same loader, which identifies what it actually
 * received rather than trusting the URL or the headers, so a host that serves
 * either file pre-inflated, double-labelled, or behind a transport that decodes
 * for it still lands on one code path.
 */
export declare function instantiateWasm(importObject: WebAssembly.Imports, base: string | undefined, onPerformance?: WavelengthPerformanceListener, runtimeCache?: boolean): Promise<WebAssembly.WebAssemblyInstantiatedSource>;
/**
 * The base the worker resolves daemon assets against when the consumer leaves
 * runtimeBaseUrl unset. The worker resolves bare asset names against its own
 * bundled URL rather than the page, so to match main-thread mode (which resolves
 * page-relative) we hand it the document's directory. Falls back to '' off the
 * main thread, where the worker cannot run.
 */
export declare function defaultWorkerRuntimeBaseUrl(): string;
//# sourceMappingURL=runtime.d.ts.map