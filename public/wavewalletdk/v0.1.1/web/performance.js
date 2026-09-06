/** Returns a monotonic timestamp when available. */
export function performanceNow() {
    return globalThis.performance?.now?.() ?? Date.now();
}
/** Delivers an opt-in timing sample without affecting wallet behavior. */
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
