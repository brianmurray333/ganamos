/**
 * A fixed-interval async poll with an optional consecutive-failure budget.
 * The sync poll and the restore readiness poll are both instances of this.
 */
export class Poller {
    #timer;
    #failures = 0;
    #inFlight = false;
    #opts;
    constructor(opts) {
        this.#opts = opts;
    }
    get running() {
        return this.#timer !== undefined;
    }
    start() {
        if (this.#timer) {
            return;
        }
        this.#failures = 0;
        this.#timer = setInterval(() => void this.#tick(), this.#opts.intervalMs);
        if (this.#opts.immediate) {
            void this.#tick();
        }
    }
    stop() {
        clearInterval(this.#timer);
        this.#timer = undefined;
    }
    async #tick() {
        // A tick slower than the interval must not stack up behind itself.
        if (this.#inFlight || !this.#timer) {
            return;
        }
        this.#inFlight = true;
        try {
            await this.#opts.tick();
            this.#failures = 0;
        }
        catch (err) {
            this.#failures += 1;
            if (this.#opts.failureLimit && this.#failures >= this.#opts.failureLimit) {
                this.stop();
                this.#opts.onExhausted?.(err);
            }
        }
        finally {
            this.#inFlight = false;
        }
    }
}
