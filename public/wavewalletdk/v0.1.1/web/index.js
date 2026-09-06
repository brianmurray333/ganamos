import { createWalletEngine, } from '@lightninglabs/wavelength-core';
import { assertPasskeyPrf, createWebPasskeyCeremony, registerPasskeyWallet, supportsPasskeyPrf, } from "./passkey.js";
import { MainThreadWavelengthClient } from "./clients/main.js";
import { WorkerWavelengthClient } from "./clients/worker.js";
/**
 * Creates a {@link WavelengthClient} backed by the browser/wasm transport. Defaults
 * to the Web Worker transport; pass runtimeThread: 'main' to run the runtime on
 * the page's main thread instead.
 */
export function createWebClient(options = {}) {
    return options.runtimeThread === 'main'
        ? new MainThreadWavelengthClient(options)
        : new WorkerWavelengthClient(options);
}
/**
 * Creates a {@link WalletEngine} over the browser/wasm transport: the
 * one-call setup for a web app. Pass the engine to WavelengthProvider from
 * \@lightninglabs/wavelength-react, or drive it directly without React.
 */
export function createWebWalletEngine(options = {}) {
    // Every WebClientOptions field has to be named twice here, because the rest
    // has to stay intact for createWalletEngine: spreading it is what preserves
    // the config/autoStart discriminated union. A field missing from these lists
    // is silently dropped rather than rejected, so clientOptionKeys below pins
    // them against the type.
    const { workerURL, runtimeBaseUrl, runtimeThread, debug, runtimeCache, onPerformance, ...engineOptions } = options;
    return createWalletEngine({
        client: createWebClient({
            workerURL,
            runtimeBaseUrl,
            runtimeThread,
            debug,
            runtimeCache,
            onPerformance,
        }),
        onPerformance,
        ...engineOptions,
    });
}
export { assertPasskeyPrf, registerPasskeyWallet, supportsPasskeyPrf };
export { createWebPasskeyCeremony };
/**
 * The browser (WebAuthn/PRF) implementation of the {@link PasskeyCeremony}
 * contract; pass it to useWalletPasskey, or drive it directly.
 */
export const webPasskeyCeremony = createWebPasskeyCeremony();
export { defaultConfig } from "./config.js";
export { MainThreadWavelengthClient } from "./clients/main.js";
export { RUNTIME_ASSETS, RUNTIME_ASSET_FILES } from "./runtime-manifest.js";
// Re-export the core contract so a non-React consumer can import the client and
// every type/enum from this one package, the way wavelength-react already does.
// RUNTIME_MANIFEST_VERSION (the paired daemon version) rides along from core.
export * from '@lightninglabs/wavelength-core';
