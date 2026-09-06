/**
 * A stable, machine-readable classification on {@link WavelengthError} so consumers
 * can branch without string-matching the message. The SDK's own failures use the
 * named codes; most daemon-originated errors fall back to `'wavelength_error'`
 * (a richer daemon-code mapping is planned), except storage-contention failures
 * on `start()`, which the web transports map to `'wallet_locked'`. `'wallet_locked'` means the wallet
 * runtime is already open in another tab or window of the same origin: the
 * daemon's OPFS databases are exclusive, so a start attempt fails fast with this
 * code until the other tab stops the runtime or closes. `'runtime_lock_unavailable'`
 * means the browser refused or dropped the lock request itself (for example
 * while the document is shutting down), which says nothing about another tab.
 * The `(string & {})` arm keeps the union open for forward
 * compatibility while still offering autocomplete on the known codes.
 */
export type WavelengthErrorCode = 'wavelength_error' | 'runtime_not_ready' | 'asset_load_failed' | 'worker_error' | 'wallet_locked' | 'runtime_lock_unavailable' | 'unsupported_facade_method' | 'invalid_cursor' | 'invalid_config' | (string & {});
/**
 * The error type thrown by the SDK. Carries a machine-readable {@link code} so
 * consumers can branch without string-matching the message.
 */
export declare class WavelengthError extends Error {
    /** The machine-readable error classification. */
    readonly code: WavelengthErrorCode;
    /**
     * @param message - The human-readable error message.
     * @param code - The machine-readable error classification; defaults to `'wavelength_error'`.
     * @param options - Standard error options; pass `{ cause }` to retain the underlying error for debugging.
     */
    constructor(message: string, code?: WavelengthErrorCode, options?: {
        cause?: unknown;
    });
}
/**
 * Extracts a human-readable message from an unknown thrown value. Tries in order:
 * an Error's message, a string value as-is, a .message property on plain objects,
 * and finally JSON serialization of anything else.
 */
export declare function errorMessage(err: unknown): string;
/**
 * Thrown by passkey ceremonies when the user dismisses the OS prompt, so hosts
 * can suppress cancellation copy without string matching. The React binding's
 * useWalletPasskey rethrows it without recording it as an error.
 */
export declare class PasskeyCancelledError extends Error {
    constructor(message?: string);
}
/**
 * Reports whether `err` is a passkey cancellation. Checks `instanceof
 * PasskeyCancelledError` first, then falls back to matching `err.name` on any
 * Error: a duplicate copy of core (a second bundled instance of this package,
 * for example one pulled in by a transport with its own dependency graph)
 * produces a `PasskeyCancelledError` that fails `instanceof` across the
 * bundle boundary even though it is functionally the same error, and the name
 * check still recognizes it.
 */
export declare function isPasskeyCancelled(err: unknown): boolean;
/**
 * Normalizes an unknown thrown value to an Error, preserving an existing
 * instance (and therefore its stack and cause) unchanged.
 */
export declare function toError(value: unknown): Error;
//# sourceMappingURL=errors.d.ts.map