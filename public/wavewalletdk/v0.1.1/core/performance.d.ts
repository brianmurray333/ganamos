/**
 * A structured timing sample emitted by an opt-in Wavelength performance
 * reporter. Stage identifies the broad subsystem and phase identifies the
 * measured boundary within it.
 */
export type WavelengthPerformanceEvent = {
    /** Broad subsystem being measured, such as runtime, wallet, or passkey. */
    stage: 'runtime' | 'wallet' | 'passkey';
    /** Stable name of the measured operation within the stage. */
    phase: string;
    /** Elapsed wall-clock time in milliseconds. */
    durationMs: number;
    /** Extra low-cardinality context for interpreting the sample. */
    detail?: Record<string, string | number | boolean>;
};
/** Receives opt-in structured Wavelength performance samples. */
export type WavelengthPerformanceListener = (event: WavelengthPerformanceEvent) => void;
/** Returns a monotonic timestamp when available. */
export declare function performanceNow(): number;
/**
 * Delivers a timing sample without allowing diagnostics to break wallet
 * behavior when a host reporter throws.
 */
export declare function reportPerformance(listener: WavelengthPerformanceListener | undefined, event: WavelengthPerformanceEvent): void;
//# sourceMappingURL=performance.d.ts.map