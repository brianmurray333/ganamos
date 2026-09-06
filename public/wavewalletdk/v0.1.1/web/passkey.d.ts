import type { PasskeyAssertion, PasskeyCeremony, WavelengthPerformanceListener } from "@lightninglabs/wavelength-core";
/**
 * Reports whether a user-verifying platform authenticator is available,
 * which is a prerequisite for WebAuthn PRF but does not guarantee that the
 * authenticator will return a PRF result; there is no synchronous
 * PRF-detection API, so a browser may return true here yet fail the
 * ceremony.
 *
 * The underlying probe is memoized at module scope: the first call starts
 * it and every later call reuses the same in-flight or resolved promise, so
 * the platform authenticator check runs at most once per page lifetime. A
 * rejection is not cached: this function still degrades to false on a
 * rejection, but clears the memo first so a later call retries the probe
 * from scratch instead of replaying a poisoned promise.
 */
export declare function supportsPasskeyPrf(): Promise<boolean>;
export declare function registerPasskeyWallet(appName: string, onPerformance?: WavelengthPerformanceListener): Promise<PasskeyAssertion>;
export declare function assertPasskeyPrf(allowCredentialId?: string, onPerformance?: WavelengthPerformanceListener): Promise<PasskeyAssertion>;
/**
 * Builds the browser passkey ceremony with an optional structured performance
 * reporter. The default exported ceremony omits it, while diagnostics and
 * benchmarks can opt in without changing wallet behavior.
 */
export declare function createWebPasskeyCeremony(options?: {
    onPerformance?: WavelengthPerformanceListener;
}): PasskeyCeremony;
//# sourceMappingURL=passkey.d.ts.map