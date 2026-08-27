import type { Info, Status } from './generated.ts';
/**
 * The wallet lifecycle, exposed as a lowercase string union to match the SDK's
 * other enums (EntryKind, SendRail, ...). The daemon sends the proto's numeric
 * enum; the client maps it to these strings at the response boundary via
 * {@link walletStateFromProto}.
 */
export declare const WalletState: {
    /** No wallet exists yet; one must be created. */
    readonly None: "none";
    /** A wallet exists but is locked and must be unlocked. */
    readonly Locked: "locked";
    /** The wallet is unlocked and ready to use. */
    readonly Ready: "ready";
    /** The wallet is unlocked and catching up with the chain. */
    readonly Syncing: "syncing";
};
/**
 * The wallet lifecycle value type: one of the {@link WalletState} string values.
 */
export type WalletState = (typeof WalletState)[keyof typeof WalletState];
/**
 * Normalizes a raw daemon walletState (a proto number) to the SDK string union.
 * Already-string values pass through unchanged.
 *
 * @param value - The raw walletState as a proto number, an SDK string, or undefined.
 * @returns The normalized {@link WalletState} string.
 */
export declare function walletStateFromProto(value: number | WalletState | undefined): WalletState;
export type { ServerInfo } from './generated.ts';
/**
 * The daemon's Info with walletState normalized to the string union and the
 * walletReady predicate backfilled (the facade exposes it as a Go method, so it
 * is absent from the JSON). The client always returns this complete shape from
 * `getInfo()`/`start()`; the engine snapshot holds it as `WalletInfo | null`.
 */
export type WalletInfo = Omit<Info, 'walletState'> & {
    /** The wallet lifecycle as the SDK string union. */
    walletState: WalletState;
    /** True iff the wallet is unlocked and ready (mirrors the Go Info.WalletReady() method). */
    walletReady: boolean;
};
/**
 * Maps a raw daemon Info (numeric walletState, no walletReady) onto the public
 * {@link WalletInfo}: it converts walletState to the string union and backfills
 * walletReady (ready iff walletState === 'ready'), mirroring the Go
 * Info.WalletReady() method. Shared facade normalization applies this after
 * the transport returns getInfo.
 *
 * @param raw - The raw daemon Info payload (untrusted shape).
 * @returns The normalized {@link WalletInfo}.
 */
export declare function normalizeInfo(raw: unknown): WalletInfo;
/**
 * The lifecycle a UI renders. The runtime phases
 * (loading/runtimeReady/starting/stopping/stopped/error) are owned by the host's
 * start/stop flow; the wallet phases (needsWallet/locked/syncing/ready) are
 * derived from {@link WalletInfo} by {@link phaseFromInfo}. It lives in core so
 * non-React and React Native consumers share one vocabulary. 'restoring'
 * means a background restore is bringing a fresh wallet up; the engine owns it
 * (like 'starting'), it is never returned by phaseFromInfo.
 */
export type RuntimePhase = 'loading' | 'runtimeReady' | 'starting' | 'needsWallet' | 'locked' | 'syncing' | 'restoring' | 'ready' | 'stopping' | 'stopped' | 'error';
/**
 * The subset of {@link RuntimePhase} derivable from wallet info: the phases
 * {@link phaseFromInfo} can return. The runtime-owned phases (loading,
 * runtimeReady, starting, restoring, stopping, stopped, error) are not
 * representable here.
 */
export type WalletPhase = 'needsWallet' | 'locked' | 'syncing' | 'ready';
/**
 * Derives the wallet-state phase from a {@link WalletInfo}. Runtime phases are
 * not represented here; the caller owns those.
 *
 * @param info - The wallet state and readiness to derive the phase from.
 * @returns The wallet-state {@link WalletPhase}.
 */
export declare function phaseFromInfo(info: {
    walletState?: WalletState;
    walletReady?: boolean;
}): WalletPhase;
/**
 * The daemon's runtime status snapshot, re-exported verbatim under the SDK's
 * public name.
 */
export type WalletStatus = Status;
//# sourceMappingURL=state.d.ts.map