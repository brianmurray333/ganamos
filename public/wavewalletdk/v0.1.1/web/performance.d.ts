import type { WavelengthPerformanceEvent, WavelengthPerformanceListener } from '@lightninglabs/wavelength-core';
/** Returns a monotonic timestamp when available. */
export declare function performanceNow(): number;
/** Delivers an opt-in timing sample without affecting wallet behavior. */
export declare function reportPerformance(listener: WavelengthPerformanceListener | undefined, event: WavelengthPerformanceEvent): void;
//# sourceMappingURL=performance.d.ts.map