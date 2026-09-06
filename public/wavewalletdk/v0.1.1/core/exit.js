import { FORCE_UNROLL_ACK } from "./requests.js";
/**
 * Distinguishes a fixable exit-infeasibility (the backing wallet needs more
 * confirmed funds or inputs) from a structural one (the VTXO cannot be exited
 * economically at all). Use it to decide whether to show a "fund your wallet"
 * affordance or a terminal "cannot exit this VTXO" message. Mirrors the
 * daemon's own `ExitInfeasibility.Impossible()` split.
 */
export function isExitInfeasibilityFundable(reason) {
    return (reason === 'wallet_underfunded' || reason === 'wallet_too_few_inputs');
}
/**
 * Starts a batch of exits, one outpoint per daemon call, and reports which
 * started, which were skipped, and which never started. It resolves once every
 * exit has been STARTED, not completed: a unilateral exit continues to run for
 * hours or days after this resolves. On the unilateral path it previews funding
 * with `getExitPlan`, skips outpoints already running an exit, refuses to start
 * anything if the wallet cannot fund the batch, and re-plans between starts;
 * because fee inputs are leased only at broadcast time, it also treats a
 * mid-batch `exit` rejection as a clean stop. On the cooperative path it queues
 * each outpoint into the next round.
 */
export async function exitBatch(opts) {
    const { client, signal, onEvent } = opts;
    const started = [];
    const skipped = [];
    let remaining = [...opts.outpoints];
    while (remaining.length > 0) {
        signal?.throwIfAborted();
        if (opts.mode === 'unilateral') {
            const currentPlan = await client.getExitPlan({
                outpoints: remaining,
                confTarget: opts.confTarget,
            });
            onEvent?.({ type: 'planned', plan: currentPlan });
            // Drop outpoints the daemon already runs an exit for: it rejects a
            // second exit for one outpoint, and the plan already flags them.
            const running = new Set(currentPlan.plans.filter((p) => p.exitJobFound).map((p) => p.outpoint));
            if (running.size > 0) {
                const newlySkipped = remaining.filter((o) => running.has(o) && !skipped.includes(o));
                for (const o of newlySkipped)
                    skipped.push(o);
                remaining = remaining.filter((o) => !running.has(o));
                if (remaining.length === 0)
                    break;
                if (newlySkipped.length > 0) {
                    // Re-plan against the reduced set before gating on canStart: the
                    // plan we just read still counted the now-skipped (already-running)
                    // outpoints, whose leased fee inputs can make the aggregate
                    // canStart false.
                    continue;
                }
            }
            // Funding is never reserved, so re-planning each round is the only way
            // to notice an earlier start consumed the inputs a later one needs.
            if (!currentPlan.canStart) {
                const stoppedBy = {
                    reason: 'infeasible',
                    plan: currentPlan,
                };
                onEvent?.({ type: 'stopped', stoppedBy, remaining });
                return { started, skipped, remaining, stoppedBy };
            }
        }
        const outpoint = remaining[0];
        onEvent?.({ type: 'starting', outpoint });
        try {
            const result = await client.exit(opts.mode === 'unilateral'
                ? { outpoint, forceUnrollAck: FORCE_UNROLL_ACK }
                : { outpoint, destination: opts.destination });
            started.push({ outpoint, result });
            remaining = remaining.slice(1);
            onEvent?.({ type: 'started', outpoint, result });
        }
        catch (error) {
            const stoppedBy = {
                reason: 'rejected',
                outpoint,
                error: error,
            };
            onEvent?.({ type: 'stopped', stoppedBy, remaining });
            return { started, skipped, remaining, stoppedBy };
        }
    }
    return { started, skipped, remaining: [] };
}
