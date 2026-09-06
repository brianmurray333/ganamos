import { camelizeKeys, } from '@lightninglabs/wavelength-core';
export { errorMessage } from '@lightninglabs/wavelength-core';
/**
 * Formats the current time as "YYYY-MM-DD HH:MM:SS" to prefix debug logs.
 */
export function debugTs() {
    return new Date().toISOString().split('T').join(' ').slice(0, -1);
}
/**
 * Maps a non-activity event forwarded across the worker boundary onto the
 * typed {@link WavelengthEvent} union. Activity entries are normalized by the
 * client instance at the shared core boundary.
 */
export function toWavelengthEvent(raw) {
    switch (raw.type) {
        case 'activityStream':
            // The payload is a plain state/message object, not daemon JSON, so it
            // crosses the worker boundary as-is with no camelizing.
            return {
                type: 'activityStream',
                payload: raw.payload,
            };
        case 'log':
            return {
                type: 'log',
                payload: camelizeKeys(raw.payload),
            };
        case 'runtimeStopped':
            return { type: 'runtimeStopped' };
        case 'runtimeReady':
            return { type: 'runtimeReady' };
        default:
            // The postMessage boundary is untyped; surface an unexpected event as a
            // warning instead of silently advancing lifecycle state to runtimeReady.
            return {
                type: 'log',
                payload: { level: 'warn', message: `unknown Wavelength event: ${raw.type}` },
            };
    }
}
