import { type RuntimePhase, type WalletInfo } from '../state.ts';
/**
 * Events the engine dispatches into the phase machine. Events carry no
 * behavior; the engine applies snapshot patches and process changes
 * separately, so transition() stays a pure phase -> phase map.
 */
export type WalletEngineEvent = {
    type: 'runtimeReady';
} | {
    type: 'runtimeFailed';
} | {
    type: 'runtimeStopped';
} | {
    type: 'startRequested';
} | {
    type: 'startFailed';
} | {
    type: 'infoReceived';
    info: WalletInfo;
} | {
    type: 'restoreRequested';
} | {
    type: 'walletBecameReady';
} | {
    type: 'restoreFailedWalletUp';
} | {
    type: 'restoreFailedWalletDown';
} | {
    type: 'walletAdoptionFailed';
} | {
    type: 'streamLost';
} | {
    type: 'syncPollExhausted';
} | {
    type: 'backgroundRefreshExhausted';
} | {
    type: 'stopRequested';
} | {
    type: 'stopCompleted';
} | {
    type: 'stopFailed';
};
/**
 * The pure phase transition table. Any (event, phase) pair without an entry is
 * an identity transition: the event is ignored. Notably, infoReceived has no
 * entry for 'restoring': during a restore the transient locked-looking
 * states InitWallet passes through cannot leak into the UI.
 */
export declare function transition(phase: RuntimePhase, event: WalletEngineEvent): RuntimePhase;
//# sourceMappingURL=machine.d.ts.map