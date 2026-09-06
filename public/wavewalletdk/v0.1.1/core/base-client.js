import { validateRuntimeConfig } from "./config.js";
import { assertFacadeMethod, toGoCreateWalletReq, toGoUnlockWalletReq, toMobileConfig, } from "./facade.js";
import { WavelengthError, errorMessage } from "./errors.js";
import { normalizeEntry, normalizeFacadeResult, } from "./response-normalization.js";
import { validateActivityStreamOptions, } from "./activity-options.js";
/**
 * Implements the transport-agnostic half of {@link WavelengthClient}: every RPC
 * verb is expressed in terms of the abstract invokeFacade, so a transport (web
 * wasm, React Native gomobile, or a future one) supplies only the pipe:
 * invokeFacade, ready, the activity-stream plumbing, and its {@link ServerTransport}
 * flavor. The shared subscribe/emit listener machinery and typed wrappers live
 * here. The facade catalog, public contract, native dispatch, and response
 * normalization remain separate synchronization points.
 */
export class BaseWavelengthClient {
    listeners = new Set();
    // Serializes runtime lifecycle operations for transports that route start and
    // stop through enqueueLifecycle, so a host's overlapping calls (a double
    // click, a stop issued mid-start) run one at a time in invocation order
    // instead of interleaving at the transport's exclusive resources.
    #lifecycleTail = Promise.resolve();
    // The raw facade escape hatch. It rejects the lifecycle verbs 'start' and
    // 'stop' so they can only run through the typed start()/stop(): those are
    // where the web transports take and release the cross-tab runtime lock, and a
    // raw call would bypass it. The typed methods dispatch through
    // callFacadeInternal, which carries no such guard.
    async callFacade(method, params = {}) {
        if (method === 'start' || method === 'stop') {
            throw new WavelengthError(`Call ${method}() instead of callFacade('${method}'): the ${method} ` +
                'lifecycle verb runs through the typed method, which manages the ' +
                'cross-tab runtime lock.');
        }
        return this.callFacadeInternal(method, params);
    }
    // The unguarded facade dispatch behind callFacade. The typed lifecycle verbs
    // (start/stop) call this directly so callFacade's guard does not reject the
    // very verbs they exist to issue.
    async callFacadeInternal(method, params = {}) {
        assertFacadeMethod(method);
        const raw = await this.invokeFacade(method, params);
        return normalizeFacadeResult(method, raw);
    }
    isRunning() {
        return this.callFacade('isRunning');
    }
    async startActivity(opts = {}) {
        validateActivityStreamOptions(opts);
        await this.openActivityStream(opts);
    }
    /**
     * Runs a runtime lifecycle operation serialized against every other one on
     * this client, in invocation order. A transport that owns an exclusive
     * resource for the daemon's lifetime (the web transport's cross-tab runtime
     * lock) routes its start()/stop() through this so overlapping host calls
     * cannot interleave: two starts cannot share one lock lease, and a stop cannot
     * release the lock while a start is still opening the databases. A failed
     * operation does not poison the queue for the next caller.
     */
    enqueueLifecycle(op) {
        const run = this.#lifecycleTail.then(op, op);
        // The tail tracks only completion, never the value or a rejection.
        this.#lifecycleTail = run.then(() => undefined, () => undefined);
        return run;
    }
    // start boots the embedded daemon and returns the post-boot WalletInfo. The
    // facade's start verb resolves nothing useful on its own, so the client
    // fetches getInfo afterwards; the React provider derives the runtime phase
    // from it.
    async start(config) {
        validateRuntimeConfig(config, this.serverTransport);
        await this.callFacadeInternal('start', toMobileConfig(config, this.serverTransport));
        return this.getInfo();
    }
    async stop() {
        // Snapshot any per-session teardown token before the stop is issued, so
        // afterDaemonStopped acts on the session this stop belongs to even if a new
        // start takes over while the stop RPC is in flight.
        const token = this.beforeDaemonStop();
        await this.callFacadeInternal('stop');
        await this.afterDaemonStopped(token);
        this.emit({ type: 'runtimeStopped' });
    }
    /**
     * Called at the very start of a stop, before the daemon RPC, so a transport
     * can capture whatever identifies the session being stopped (the web
     * transport's runtime-lock lease). The value is handed back to
     * {@link afterDaemonStopped}. Default: nothing to capture.
     */
    beforeDaemonStop() {
        return undefined;
    }
    /**
     * Called once the daemon has acknowledged a stop and before subscribers are
     * told about it. A transport holding an exclusive resource for the daemon's
     * lifetime (the web transport's cross-tab runtime lock, say) releases it
     * here: the acknowledgement is the proof the daemon let its storage go, and
     * running before the event means a subscriber that restarts the runtime
     * cannot race the release. Not called when the stop call fails, because an
     * unacknowledged stop is no evidence the daemon is down.
     *
     * Receives the token {@link beforeDaemonStop} captured, so the release can be
     * scoped to the session this stop belongs to and a stop whose start has
     * already been superseded frees nothing. Awaited, so a transport whose
     * release only completes asynchronously (the Web Locks API frees a lock when
     * the holder's promise settles, not when it is asked to) can resolve once the
     * resource is genuinely free.
     */
    afterDaemonStopped(_token) { }
    getInfo() {
        return this.callFacade('getInfo');
    }
    status() {
        return this.callFacade('status');
    }
    balance() {
        // The daemon's Balance shape; generated.ts is the field source of truth.
        return this.callFacade('balance');
    }
    createWallet(req) {
        return this.callFacade('createWallet', toGoCreateWalletReq(req));
    }
    unlockWallet(req) {
        return this.callFacade('unlockWallet', toGoUnlockWalletReq(req));
    }
    openWalletFromPasskey(req) {
        return this.callFacade('openWalletFromPasskey', req);
    }
    deposit(req = {}) {
        return this.callFacade('deposit', req);
    }
    receive(req) {
        return this.callFacade('receive', req);
    }
    // prepareSend quotes a payment without dispatching it, returning the fee and a
    // single-use sendIntentId. Pair it with sendPrepared for a quote -> confirm ->
    // pay flow; send() folds the two steps into one.
    prepareSend(req) {
        return this.callFacade('prepareSend', req);
    }
    // sendPrepared dispatches a payment quoted by prepareSend. It folds the
    // prepare-time paymentHash into the result so a two-step caller sees the same
    // shape send() returns (the daemon omits PaymentHash from sendPrepared).
    async sendPrepared(prepared) {
        const result = await this.callFacade('sendPrepared', {
            SendIntentID: prepared.sendIntentId,
        });
        return {
            ...result,
            paymentHash: result.paymentHash ?? prepared.paymentHash,
        };
    }
    // send composes prepareSend + sendPrepared into one call for the common
    // fire-and-forget path.
    async send(req) {
        return this.sendPrepared(await this.prepareSend(req));
    }
    list(req = {}) {
        return this.callFacade('list', req);
    }
    exit(req) {
        return this.callFacade('exit', req);
    }
    exitStatus(req) {
        return this.callFacade('exitStatus', req);
    }
    exitSummary(req = {}) {
        return this.callFacade('exitSummary', req);
    }
    getExitPlan(req) {
        return this.callFacade('getExitPlan', req);
    }
    sweepWallet(req) {
        return this.callFacade('sweepWallet', req);
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
    emit(event) {
        for (const listener of this.listeners) {
            try {
                listener(event);
            }
            catch (err) {
                // Isolate a throwing subscriber so it cannot suppress the others or
                // abort the transport's event dispatch. Reported as a log event
                // unless the log listener itself is the one that threw.
                if (event.type !== 'log') {
                    this.emit({
                        type: 'log',
                        payload: { level: 'error', message: errorMessage(err) },
                    });
                }
            }
        }
    }
    normalizeActivityEntry(raw) {
        return normalizeEntry(raw);
    }
    /**
     * Closes the activity stream and unsubscribes all listeners. The concrete
     * transports override this to also tear down their runtime (terminate the
     * Worker, or drop the main-thread runtime listener).
     */
    dispose() {
        this.stopActivity();
        this.listeners.clear();
    }
}
