import type { EntryKind } from './generated.ts';
/** Controls the wallet activity replay, filtering, and resume position. */
export type ActivityStreamOptions = {
    /** When true with a zero cursor, replays existing activity before live updates. */
    includeExisting?: boolean;
    /** Restricts updates to the selected activity kinds. */
    kinds?: EntryKind[];
    /**
     * Resumes after this monotonic activity cursor, replaying later events before
     * live updates. Must be a nonnegative safe integer.
     */
    cursor?: number;
};
export declare function validateActivityStreamOptions(opts: ActivityStreamOptions): void;
//# sourceMappingURL=activity-options.d.ts.map