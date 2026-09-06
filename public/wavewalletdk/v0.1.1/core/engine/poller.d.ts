/**
 * A fixed-interval async poll with an optional consecutive-failure budget.
 * The sync poll and the restore readiness poll are both instances of this.
 */
export declare class Poller {
    #private;
    constructor(opts: {
        intervalMs: number;
        /** Run one tick immediately on start, before the first interval. */
        immediate?: boolean;
        /** Consecutive rejected ticks before the poll gives up. Unset means never. */
        failureLimit?: number;
        tick: () => Promise<void>;
        onExhausted?: (error: unknown) => void;
    });
    get running(): boolean;
    start(): void;
    stop(): void;
}
//# sourceMappingURL=poller.d.ts.map