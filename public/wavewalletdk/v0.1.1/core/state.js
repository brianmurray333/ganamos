/**
 * The wallet lifecycle, exposed as a lowercase string union to match the SDK's
 * other enums (EntryKind, SendRail, ...). The daemon sends the proto's numeric
 * enum; the client maps it to these strings at the response boundary via
 * {@link walletStateFromProto}.
 */
export const WalletState = {
    /** No wallet exists yet; one must be created. */
    None: 'none',
    /** A wallet exists but is locked and must be unlocked. */
    Locked: 'locked',
    /** The wallet is unlocked and ready to use. */
    Ready: 'ready',
    /** The wallet is unlocked and catching up with the chain. */
    Syncing: 'syncing',
};
/**
 * Maps the daemon's numeric WalletState enum to the SDK string. The daemon never
 * emits 0 (Unspecified); a missing/unknown value maps to 'none', the safe
 * non-ready state.
 */
const PROTO_WALLET_STATE = {
    1: WalletState.None,
    2: WalletState.Locked,
    3: WalletState.Ready,
    4: WalletState.Syncing,
};
/**
 * Normalizes a raw daemon walletState (a proto number) to the SDK string union.
 * Already-string values pass through unchanged.
 *
 * @param value - The raw walletState as a proto number, an SDK string, or undefined.
 * @returns The normalized {@link WalletState} string.
 */
export function walletStateFromProto(value) {
    if (typeof value === 'string') {
        return value;
    }
    // An absent value or the proto's 0 (Unspecified) means no wallet yet.
    if (value === undefined || value === 0) {
        return WalletState.None;
    }
    // A recognized enum maps directly. An unrecognized non-zero value (a future
    // or garbled daemon state) maps to the conservative 'locked', not 'none', so
    // it never drives the UI into creating a wallet over an existing one.
    return PROTO_WALLET_STATE[value] ?? WalletState.Locked;
}
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
export function normalizeInfo(raw) {
    const info = (raw ?? {});
    const walletState = walletStateFromProto(info.walletState);
    return {
        ...info,
        walletState,
        walletReady: info.walletReady ?? walletState === WalletState.Ready,
    };
}
/**
 * Derives the wallet-state phase from a {@link WalletInfo}. Runtime phases are
 * not represented here; the caller owns those.
 *
 * @param info - The wallet state and readiness to derive the phase from.
 * @returns The wallet-state {@link WalletPhase}.
 */
export function phaseFromInfo(info) {
    if (info.walletReady || info.walletState === WalletState.Ready) {
        return 'ready';
    }
    switch (info.walletState) {
        case WalletState.Locked:
            return 'locked';
        case WalletState.Syncing:
            return 'syncing';
        case WalletState.None:
        default:
            return 'needsWallet';
    }
}
