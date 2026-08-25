/** Returns a monotonic timestamp when available. */
export function performanceNow() {
    return globalThis.performance?.now?.() ?? Date.now();
}
/**
 * Delivers a timing sample without allowing diagnostics to break wallet
 * behavior when a host reporter throws.
 */
export function reportPerformance(listener, event) {
    if (!listener) {
        return;
    }
    try {
        listener(event);
    }
    catch {
        // Performance reporting is diagnostic and must never break wallet work.
    }
}
