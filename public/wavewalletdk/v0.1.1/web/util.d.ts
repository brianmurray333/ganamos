import { WavelengthEvent, WavelengthEventType } from '@lightninglabs/wavelength-core';
export { errorMessage } from '@lightninglabs/wavelength-core';
/**
 * A single in-flight RPC awaiting its worker response, keyed by request id in
 * the worker client's pending map. resolve/reject settle the promise the caller
 * received from callFacade when the matching worker message arrives.
 */
export type PendingCall = {
    resolve: (value: unknown) => void;
    reject: (err: Error) => void;
};
/**
 * The pull-based subscription the wasm bridge's `subscribe` verb resolves to:
 * next() yields the next activity entry (or null at end of stream) and close()
 * cancels it.
 */
export type ActivityHandle = {
    next: () => Promise<unknown>;
    close: () => unknown;
};
/**
 * Formats the current time as "YYYY-MM-DD HH:MM:SS" to prefix debug logs.
 */
export declare function debugTs(): string;
/**
 * Maps a non-activity event forwarded across the worker boundary onto the
 * typed {@link WavelengthEvent} union. Activity entries are normalized by the
 * client instance at the shared core boundary.
 */
export declare function toWavelengthEvent(raw: {
    type: WavelengthEventType;
    payload?: unknown;
}): WavelengthEvent;
//# sourceMappingURL=util.d.ts.map