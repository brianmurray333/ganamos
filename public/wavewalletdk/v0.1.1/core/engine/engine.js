import { toError } from "../errors.js";
import { performanceNow, reportPerformance, } from "../performance.js";
import { exitBatch as runExitBatch, } from "../exit.js";
import { WalletState } from "../state.js";
import { ActivityStream } from "./activity.js";
import { ADOPT_INFO_RETRIES, ADOPT_INFO_RETRY_MS, BACKGROUND_REFRESH_FAILURE_LIMIT, MAX_LOGS, RESTORE_POLL_MS, SYNC_POLL_FAILURE_LIMIT, SYNC_POLL_MS, } from "./constants.js";
import { transition } from "./machine.js";
import { Poller } from "./poller.js";
import { SettleReconciler } from "./reconcile.js";
import { stabilize } from "./stabilize.js";
import { SnapshotStore } from "./store.js";
/** Creates a {@link WalletEngine} over any transport client. */
export function createWalletEngine(options) {
    return new WavelengthEngine(options);
}
class WavelengthEngine {
    client;
    #store = new SnapshotStore();
    #config;
    #onPerformance;
    #disposed = false;
    // Counts stops the host asked for, so a start that rejects afterwards can
    // tell an intentional shutdown from a runtime that died underneath it.
    #deliberateStops = 0;
    #unsubscribe;
    // Background refreshes are serialized: two concurrent reads would race on
    // the snapshot, and the slower one would win with the staler data.
    #chain = Promise.resolve();
    #refreshFailures = 0;
    // The background processes the phase machine turns on and off; see #reconcileProcesses.
    #stream;
    #reconciler;
    #syncPoller;
    #restorePoller;
    #syncStartedAt;
    #syncTicks = 0;
    // The pending restore promise, settled exactly once at usability (resolve)
    // or wallet-down failure (reject).
    #restore;
    constructor(options) {
        this.client = options.client;
        this.#config = options.config;
        this.#onPerformance = options.onPerformance;
        this.#stream = new ActivityStream({
            client: this.client,
            onActivity: () => this.#reconciler.trigger(),
            onReconcile: () => this.#reconciler.trigger(),
            onDead: (error) => {
                // A stream death that lands after the phase has already left 'ready'
                // (for example while stopping) would otherwise stamp a fatal error
                // onto a snapshot the wallet is no longer claiming is live, so only
                // dispatch while the phase is actually 'ready'.
                if (this.getSnapshot().phase === 'ready') {
                    this.#dispatch({ type: 'streamLost' }, { error });
                }
            },
        });
        this.#reconciler = new SettleReconciler({
            refresh: () => this.#backgroundRefresh(),
            baseline: () => this.getSnapshot().balance,
        });
        this.#syncPoller = new Poller({
            intervalMs: SYNC_POLL_MS,
            failureLimit: SYNC_POLL_FAILURE_LIMIT,
            tick: () => {
                this.#syncTicks += 1;
                return this.refresh();
            },
            onExhausted: (err) => {
                // A poller tick already in flight when the poller stops can resolve
                // after the phase has left 'syncing', so only dispatch while the
                // phase is actually 'syncing'; otherwise this would stamp a fatal
                // error onto a healthy or stopped snapshot.
                if (this.getSnapshot().phase === 'syncing') {
                    this.#dispatch({ type: 'syncPollExhausted' }, { error: toError(err) });
                }
            },
        });
        this.#restorePoller = new Poller({
            intervalMs: RESTORE_POLL_MS,
            immediate: true,
            tick: () => this.#restoreTick(),
        });
        const readyStartedAt = this.#onPerformance
            ? performanceNow()
            : undefined;
        this.client.ready().then(() => {
            if (readyStartedAt !== undefined) {
                reportPerformance(this.#onPerformance, {
                    stage: 'runtime',
                    phase: 'clientReady',
                    durationMs: performanceNow() - readyStartedAt,
                });
            }
            if (this.#disposed) {
                return;
            }
            this.#dispatch({ type: 'runtimeReady' });
            if (options.autoStart && this.#config) {
                // Failures surface through the startFailed transition; nothing to
                // do with the rejection here.
                void this.start().catch(() => undefined);
            }
        }, (err) => {
            if (readyStartedAt !== undefined) {
                reportPerformance(this.#onPerformance, {
                    stage: 'runtime',
                    phase: 'clientReady',
                    durationMs: performanceNow() - readyStartedAt,
                    detail: { outcome: 'error' },
                });
            }
            if (!this.#disposed) {
                this.#dispatch({ type: 'runtimeFailed' }, { error: toError(err) });
            }
        });
        this.#unsubscribe = this.client.subscribe((event) => this.#onClientEvent(event));
    }
    getSnapshot = () => this.#store.getSnapshot();
    subscribe = (listener) => this.#store.subscribe(listener);
    // Guards a public mutator against running after dispose(): a disposed
    // engine has already torn down its subscriptions and background processes,
    // so any RPC it kicks off would race a client no consumer can observe
    // through the snapshot.
    #assertNotDisposed() {
        if (this.#disposed) {
            throw new Error('the engine has been disposed');
        }
    }
    async start(config) {
        this.#assertNotDisposed();
        const cfg = config ?? this.#config;
        if (!cfg) {
            throw new Error('start() needs a runtime config: pass one, or set config on the engine factory');
        }
        // The machine ignores startRequested while stopping, but without this
        // guard the client RPC below would still fire mid-stop.
        if (this.getSnapshot().phase === 'stopping') {
            throw new Error('cannot start while the runtime is stopping');
        }
        this.#refreshFailures = 0;
        const stopsBefore = this.#deliberateStops;
        this.#dispatch({ type: 'startRequested' }, { error: null });
        try {
            const info = await this.client.start(cfg);
            // A stop the host issued while this start was in flight owns the outcome,
            // the same precedence the catch below applies to a rejected start. The
            // phase has already moved to stopping or stopped; dispatching infoReceived
            // would ignore-transition through the machine but still apply the { info }
            // patch, repopulating a snapshot the host asked to tear down (the hazard
            // #fetchAll guards on its sibling path). Hand the caller the info the RPC
            // returned without touching the snapshot, and skip the refresh with it.
            if (this.#deliberateStops !== stopsBefore) {
                return info;
            }
            this.#dispatch({ type: 'infoReceived', info }, { info });
            try {
                await this.refresh();
            }
            catch {
                // A locked or empty wallet can fail balance/list until bootstrap.
            }
            return info;
        }
        catch (err) {
            const error = toError(err);
            // A stop the host asked for while this start was in flight owns the
            // outcome. Reporting the abandoned start's failure would drag the
            // phase back off 'stopped' and show an error the host already moved
            // past. A runtime that died on its own is different: it reaches
            // 'stopped' without a stop request, and the failure still has to
            // surface (see the machine's startFailed transition).
            if (this.#deliberateStops !== stopsBefore) {
                // The phase intentionally stays 'stopped', so the cause is dropped
                // from the snapshot; log it so it is still recoverable. The promise
                // rejection below carries it too.
                const logs = [
                    ...this.getSnapshot().logs,
                    {
                        level: 'debug',
                        message: 'start failed but a deliberate stop took precedence; error ' +
                            `kept off the phase: ${error.message}`,
                    },
                ].slice(-MAX_LOGS);
                this.#store.update({ logs });
                throw error;
            }
            this.#dispatch({ type: 'startFailed' }, { error });
            throw error;
        }
    }
    async stop() {
        this.#assertNotDisposed();
        this.#deliberateStops += 1;
        this.#dispatch({ type: 'stopRequested' });
        try {
            await this.client.stop();
            this.#dispatch({ type: 'stopCompleted' }, { info: null, balance: null, activity: [], error: null });
            this.#rejectRestoreOnTeardown();
        }
        catch (err) {
            const error = toError(err);
            this.#dispatch({ type: 'stopFailed' }, { error });
            throw error;
        }
    }
    async refresh() {
        this.#assertNotDisposed();
        await this.#fetchAll();
    }
    async createWallet(req) {
        this.#assertNotDisposed();
        return this.#measureWallet('createTotal', async () => {
            const result = await this.#measureWallet('createRpc', () => this.client.createWallet(req));
            await this.#adoptInfo('create');
            this.#kickRefresh();
            return result;
        });
    }
    restoreWallet(req) {
        // A restore with server-assisted recovery blocks createWallet for the
        // whole indexer scan, but the daemon marks the wallet ready before the
        // scan runs. So kick createWallet off without awaiting it, resolve this
        // promise as soon as the wallet is usable (the readiness poll below), and
        // track the scan through snapshot.recovery when the caller opted in.
        if (this.#disposed) {
            return Promise.reject(new Error('the engine has been disposed'));
        }
        if (!req.mnemonic || req.mnemonic.length === 0) {
            return Promise.reject(new Error('a restore needs a mnemonic'));
        }
        if (this.#restore && !this.#restore.settled) {
            // A second concurrent restore would otherwise clobber #restore and
            // strand the first caller's promise; reject the new call up front
            // instead, before dispatching anything, so the first caller's promise
            // stays valid.
            return Promise.reject(new Error('a restore is already in flight'));
        }
        const tracking = Boolean(req.recoverState);
        this.#dispatch({ type: 'restoreRequested' }, {
            error: null,
            recovery: tracking ? { status: 'restoring' } : { status: 'idle' },
        });
        const promise = new Promise((resolve, reject) => {
            this.#restore = { resolve, reject, settled: false };
        });
        this.client.createWallet(req).then(async (result) => {
            // dispose() already rejected #restore; a resolving createWallet must
            // not dispatch, adopt info, or kick a refresh on a torn-down engine.
            if (this.#disposed) {
                return;
            }
            // The scan (or a plain restore) finished, so the wallet is up.
            if (tracking) {
                this.#store.update({ recovery: { status: 'done', result } });
            }
            const info = await this.#adoptWalletUp();
            this.#settleRestore(info);
            this.#kickRefresh();
        }, async (err) => {
            // dispose() already rejected #restore; a settling createWallet must
            // not dispatch, adopt info, or kick a refresh on a torn-down engine.
            if (this.#disposed) {
                return;
            }
            const error = toError(err);
            // Recovery runs after the wallet is created and unlocked, so a
            // failure may leave a usable (if under-populated) wallet. Probe
            // getInfo: if the wallet came up, keep the user in it and surface a
            // failed banner; otherwise the create itself failed, so fall back to
            // onboarding and reject.
            let probe = null;
            try {
                probe = await this.client.getInfo();
            }
            catch {
                // Treat an unreachable daemon as not-came-up.
            }
            const cameUp = Boolean(probe && (probe.walletReady || probe.walletState === WalletState.Ready));
            if (cameUp && probe) {
                this.#dispatch({ type: 'restoreFailedWalletUp' }, {
                    info: probe,
                    recovery: tracking
                        ? { status: 'failed', error, walletUsable: true }
                        : { status: 'idle' },
                });
                this.#settleRestore(probe);
                this.#kickRefresh();
            }
            else {
                // The wallet never came up, so the phase falls back to
                // needsWallet, but recovery still records the failure: without
                // this, a screen that unmounts on the rejection (returning to
                // needsWallet) would lose the error the moment its hook-local
                // state disappears with it. The snapshot survives that unmount.
                this.#dispatch({ type: 'restoreFailedWalletDown' }, { recovery: { status: 'failed', error, walletUsable: false } });
                this.#rejectRestore(error);
            }
        }).catch((err) => this.#rejectRestore(toError(err)));
        return promise;
    }
    // A no-op while a scan is live: a stray banner dismiss must not wipe the
    // in-progress restoring state out from under the poll that is tracking it.
    acknowledgeRecovery() {
        if (this.getSnapshot().recovery.status === 'restoring') {
            return;
        }
        this.#store.update({ recovery: { status: 'idle' } });
    }
    async unlockWallet(req) {
        this.#assertNotDisposed();
        return this.#measureWallet('unlockTotal', async () => {
            const result = await this.#measureWallet('unlockRpc', () => this.client.unlockWallet(req));
            await this.#adoptInfo('unlock');
            this.#kickRefresh();
            return result;
        });
    }
    async openWalletFromPasskey(req) {
        this.#assertNotDisposed();
        return this.#measureWallet('passkeyOpenTotal', async () => {
            const result = await this.#measureWallet('passkeyOpenRpc', () => this.client.openWalletFromPasskey(req));
            await this.#adoptInfo('passkeyOpen');
            this.#kickRefresh();
            return result;
        });
    }
    async deposit(req = {}) {
        this.#assertNotDisposed();
        const result = await this.client.deposit(req);
        this.#kickRefresh();
        return result;
    }
    async receive(req) {
        this.#assertNotDisposed();
        const result = await this.client.receive(req);
        this.#kickRefresh();
        return result;
    }
    prepareSend(req) {
        this.#assertNotDisposed();
        // A quote moves no money, so nothing to refresh.
        return this.client.prepareSend(req);
    }
    async sendPrepared(prepared) {
        this.#assertNotDisposed();
        const result = await this.client.sendPrepared(prepared);
        this.#kickRefresh();
        return result;
    }
    async send(req) {
        this.#assertNotDisposed();
        const result = await this.client.send(req);
        this.#kickRefresh();
        return result;
    }
    async exit(req) {
        this.#assertNotDisposed();
        const result = await this.client.exit(req);
        this.#kickRefresh();
        return result;
    }
    exitStatus(req) {
        this.#assertNotDisposed();
        // Reading status moves no money, so nothing to refresh.
        return this.client.exitStatus(req);
    }
    exitSummary(req = {}) {
        this.#assertNotDisposed();
        return this.client.exitSummary(req);
    }
    getExitPlan(req) {
        this.#assertNotDisposed();
        // Previewing a plan moves no money, so nothing to refresh.
        return this.client.getExitPlan(req);
    }
    async sweepWallet(req) {
        this.#assertNotDisposed();
        const result = await this.client.sweepWallet(req);
        // A preview moves no money; only a broadcast does.
        if (req.broadcast)
            this.#kickRefresh();
        return result;
    }
    async exitBatch(opts) {
        this.#assertNotDisposed();
        return runExitBatch({
            ...opts,
            client: this.client,
            onEvent: (event) => {
                // Each started exit moves money, so refresh as the batch progresses.
                if (event.type === 'started')
                    this.#kickRefresh();
                opts.onEvent?.(event);
            },
        });
    }
    list(req) {
        this.#assertNotDisposed();
        // Listing reads state, so nothing to refresh.
        return this.client.list(req).then((result) => {
            if (!result.activity)
                return result;
            return {
                ...result,
                activity: {
                    ...result.activity,
                    entries: restorePreimages(result.activity.entries, this.#stream.preimages()),
                },
            };
        });
    }
    clearLogs() {
        this.#store.update({ logs: [] });
    }
    dispose() {
        this.#disposed = true;
        this.#unsubscribe?.();
        this.#unsubscribe = undefined;
        this.#stream.stop();
        this.#reconciler.cancel();
        this.#syncPoller.stop();
        this.#restorePoller.stop();
        this.#rejectRestore(new Error('the engine was disposed during the restore'));
    }
    // ----- internals -----
    #onClientEvent(event) {
        if (event.type === 'runtimeReady') {
            this.#dispatch({ type: 'runtimeReady' });
        }
        else if (event.type === 'runtimeStopped') {
            // A clean stop() or a runtime crash (the worker transport surfaces a
            // fatal as runtimeStopped). Either way the engine below is gone.
            this.#dispatch({ type: 'runtimeStopped' }, { info: null, balance: null, activity: [] });
            this.#rejectRestoreOnTeardown();
        }
        else if (event.type === 'log') {
            const logs = [...this.getSnapshot().logs, event.payload].slice(-MAX_LOGS);
            this.#store.update({ logs });
        }
        else if (event.type === 'activity') {
            this.#stream.noteActivity(event.payload);
        }
        else if (event.type === 'activityStream') {
            this.#stream.noteStreamLost();
        }
    }
    // The patch cannot touch phase: phase is derived solely from transition(),
    // so no dispatch site can bypass the machine by smuggling a phase value in
    // through the patch.
    #dispatch(event, patch = {}) {
        const prev = this.getSnapshot().phase;
        const next = transition(prev, event);
        this.#store.update({ ...patch, phase: next });
        if (next !== prev) {
            this.#reconcileProcesses(next);
        }
    }
    // The process ownership table: which background process runs in which phase.
    #reconcileProcesses(phase) {
        if (phase === 'ready') {
            this.#stream.start();
        }
        else {
            this.#stream.stop();
            this.#reconciler.cancel();
        }
        if (phase === 'syncing') {
            if (this.#syncStartedAt === undefined && this.#onPerformance) {
                this.#syncStartedAt = performanceNow();
                this.#syncTicks = 0;
            }
            this.#syncPoller.start();
        }
        else {
            this.#syncPoller.stop();
            if (this.#syncStartedAt !== undefined) {
                reportPerformance(this.#onPerformance, {
                    stage: 'wallet',
                    phase: 'sync',
                    durationMs: performanceNow() - this.#syncStartedAt,
                    detail: { ticks: this.#syncTicks, outcome: phase },
                });
                this.#syncStartedAt = undefined;
                this.#syncTicks = 0;
            }
        }
        if (phase === 'restoring') {
            this.#restorePoller.start();
        }
        else {
            this.#restorePoller.stop();
        }
    }
    // Fetches info, balance, and activity concurrently, applies reference
    // stabilization, and dispatches infoReceived so the phase re-derives.
    async #fetchAll() {
        const [info, balance, rows] = await Promise.all([
            this.client.getInfo(),
            this.client.balance(),
            this.client.list({ view: 'activity', pendingOnly: false }),
        ]);
        const snap = this.getSnapshot();
        // A refresh in flight when stop() lands resolves after the phase has
        // already moved to stopping or stopped. Dispatching infoReceived here
        // would ignore-transition through the phase machine but still apply the
        // patch, repopulating info/balance/activity that stopCompleted just
        // cleared. Bail out before dispatching so a late read cannot resurrect a
        // snapshot the wallet promised was gone.
        if (snap.phase === 'stopping' || snap.phase === 'stopped') {
            return snap.balance;
        }
        const entries = restorePreimages(rows.activity?.entries || [], this.#stream.preimages());
        const nextInfo = stabilize(snap.info, info);
        const nextBalance = stabilize(snap.balance, balance);
        const nextActivity = stabilize(snap.activity, entries);
        this.#dispatch({ type: 'infoReceived', info }, { info: nextInfo, balance: nextBalance, activity: nextActivity });
        return nextBalance;
    }
    // Refetches complete info after a wallet came up (create/unlock/passkey),
    // instead of fabricating a partial. A single failed attempt is transient
    // (the daemon can take a beat to settle right after create/unlock), so this
    // retries up to ADOPT_INFO_RETRIES times, ADOPT_INFO_RETRY_MS apart. If
    // every attempt fails the daemon is presumed gone: escalate via
    // walletAdoptionFailed rather than silently leaving the wallet stuck
    // without info.
    async #adoptInfo(operation) {
        const startedAt = this.#onPerformance ? performanceNow() : undefined;
        let attempts = 0;
        let retryWaitMs = 0;
        let adopted = false;
        for (let attempt = 0; attempt < ADOPT_INFO_RETRIES; attempt++) {
            if (this.#disposed) {
                break;
            }
            attempts += 1;
            try {
                const info = await this.client.getInfo();
                this.#dispatch({ type: 'infoReceived', info }, { info });
                adopted = true;
                if (startedAt !== undefined) {
                    reportPerformance(this.#onPerformance, {
                        stage: 'wallet',
                        phase: 'adoptInfo',
                        durationMs: performanceNow() - startedAt,
                        detail: { operation, attempts, retryWaitMs, outcome: 'success' },
                    });
                }
                return info;
            }
            catch {
                if (attempt < ADOPT_INFO_RETRIES - 1) {
                    retryWaitMs += ADOPT_INFO_RETRY_MS;
                    await new Promise((resolve) => {
                        setTimeout(resolve, ADOPT_INFO_RETRY_MS);
                    });
                }
            }
        }
        if (startedAt !== undefined && !adopted) {
            reportPerformance(this.#onPerformance, {
                stage: 'wallet',
                phase: 'adoptInfo',
                durationMs: performanceNow() - startedAt,
                detail: {
                    operation,
                    attempts,
                    retryWaitMs,
                    outcome: this.#disposed ? 'disposed' : 'exhausted',
                },
            });
        }
        if (!this.#disposed) {
            this.#dispatch({ type: 'walletAdoptionFailed' }, {
                error: new Error('the wallet was created but the daemon stopped responding'),
            });
        }
        return null;
    }
    async #measureWallet(phase, task) {
        if (!this.#onPerformance) {
            return task();
        }
        const startedAt = performanceNow();
        let outcome = 'success';
        try {
            return await task();
        }
        catch (err) {
            outcome = 'error';
            throw err;
        }
        finally {
            reportPerformance(this.#onPerformance, {
                stage: 'wallet',
                phase,
                durationMs: performanceNow() - startedAt,
                detail: { outcome },
            });
        }
    }
    // Serialized background refresh with a consecutive-failure budget. Below
    // the limit failures stay engine-internal; at the limit the phase escalates
    // so a dead daemon cannot hide behind a healthy-looking ready wallet.
    async #backgroundRefresh() {
        const run = () => this.#fetchAll();
        const next = this.#chain.then(run, run);
        this.#chain = next.then(() => undefined, () => undefined);
        try {
            const balance = await next;
            this.#refreshFailures = 0;
            return { ok: true, balance };
        }
        catch {
            this.#refreshFailures += 1;
            // backgroundRefreshExhausted only transitions the machine out of
            // 'ready', so dispatching it from any other phase is an ignored
            // transition that would still apply the error patch. That patch would
            // then mislabel an unrelated failure (for example one surfacing while
            // the runtime is stopping) as the wallet having gone unresponsive, so
            // only dispatch it while the phase is actually 'ready'. The failure
            // counter still increments either way.
            if (this.#refreshFailures >= BACKGROUND_REFRESH_FAILURE_LIMIT &&
                this.getSnapshot().phase === 'ready') {
                this.#dispatch({ type: 'backgroundRefreshExhausted' }, { error: new Error('the wallet stopped responding to background refreshes') });
            }
            return { ok: false, balance: null };
        }
    }
    #kickRefresh() {
        void this.#backgroundRefresh();
    }
    // The readiness poll during a background restore: only a genuinely ready
    // wallet advances; the transient locked-looking states InitWallet passes
    // through are ignored (the machine has no infoReceived entry for
    // 'restoring', and this tick never dispatches infoReceived).
    #restoreTick = async () => {
        let info;
        try {
            info = await this.client.getInfo();
        }
        catch {
            // Transient while the wallet comes up; keep polling.
            return;
        }
        if (info.walletReady || info.walletState === WalletState.Ready) {
            this.#dispatch({ type: 'walletBecameReady' }, { info });
            this.#settleRestore(info);
            this.#kickRefresh();
        }
    };
    // Adopts post-restore info when the scan finished: refetch, dispatch
    // walletBecameReady (a no-op transition if the poll already won).
    async #adoptWalletUp() {
        let info = null;
        try {
            info = await this.client.getInfo();
        }
        catch {
            // The background refresh converges the snapshot.
        }
        this.#dispatch({ type: 'walletBecameReady' }, info ? { info } : {});
        return info;
    }
    #settleRestore(info) {
        if (!this.#restore || this.#restore.settled) {
            return;
        }
        const resolved = info ?? this.getSnapshot().info;
        this.#restore.settled = true;
        if (resolved === null) {
            this.#restore.reject(new Error('the restored wallet came up but its info could not be read'));
        }
        else {
            this.#restore.resolve(resolved);
        }
    }
    #rejectRestore(error) {
        if (this.#restore && !this.#restore.settled) {
            this.#restore.settled = true;
            this.#restore.reject(error);
        }
    }
    // Mirrors dispose()'s pending-restore rejection: the runtime tearing down
    // mid-restore (a clean stop() or a crash) leaves any in-flight restore
    // promise stranded forever unless it is settled here too.
    #rejectRestoreOnTeardown() {
        this.#rejectRestore(new Error('the runtime stopped during the restore'));
    }
}
/**
 * Puts back the preimages the list snapshot drops.
 *
 * The daemon reveals a send's preimage once, on the stream entry it pushes at
 * settle, and never again: every list read returns the entry with the field
 * empty. So a refresh would otherwise erase proof of payment that the SDK had
 * already seen, and a caller who blinked would have no way to get it back.
 *
 * Entries that already carry a preimage, or for which none was ever seen, are
 * returned untouched, so this allocates nothing in the ordinary case and never
 * invents a value it was not given.
 */
export function restorePreimages(entries, preimages) {
    if (preimages.size === 0) {
        return entries;
    }
    return entries.map((entry) => {
        const progress = entry.progress;
        if (!progress?.paymentHash || progress.preimage) {
            return entry;
        }
        const preimage = preimages.get(progress.paymentHash);
        if (preimage === undefined) {
            return entry;
        }
        return { ...entry, progress: { ...progress, preimage } };
    });
}
