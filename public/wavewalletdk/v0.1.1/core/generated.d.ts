/**
 * Client is the wallet-facing SDK handle. It is safe for concurrent use.
 */
export interface Client {
}
/**
 * Option mutates the embedded daemon configuration during Start. Functional
 * options express knobs that cannot be modeled by Config's plain-bool
 * enable-only fields, where "leave at zero" cannot be distinguished from
 * "explicit false".
 */
export type Option = any;
/**
 * Config controls the embedded daemon and wallet facade.
 */
export interface Config {
    /**
     * DaemonConfig supplies the full daemon config. When nil, wavewalletdk
     * starts from waved.DefaultConfig and applies the convenience fields
     * below.
     */
    daemonConfig?: any;
    /**
     * DataDir is the root directory for daemon and wallet state.
     */
    dataDir: string;
    /**
     * Network selects the bitcoin network.
     */
    network: string;
    /**
     * DebugLevel controls daemon logging verbosity.
     */
    debugLevel: string;
    /**
     * LogWriter receives daemon logs. Nil uses waved's default stdout.
     */
    logWriter: any;
    /**
     * AllowMainnet must be true when Network is mainnet. This is an
     * enable-only convenience override; set DaemonConfig directly when
     * a caller-owned config needs an explicit false value.
     */
    allowMainnet: boolean;
    /**
     * ServerAddress is the Ark operator mailbox edge server address. Empty
     * selects the daemon network+transport default.
     */
    serverAddress: string;
    /**
     * ServerTransport selects how the embedded daemon talks to the Ark
     * operator and mailbox edge. Empty defaults to gRPC.
     */
    serverTransport: Transport;
    /**
     * ServerTLSCertPath pins the Ark operator TLS certificate.
     */
    serverTLSCertPath: string;
    /**
     * ServerInsecure disables TLS for the Ark operator connection. This
     * is an enable-only convenience override; set DaemonConfig directly
     * when a caller-owned config needs an explicit false value.
     */
    serverInsecure: boolean;
    /**
     * WalletType selects the backing wallet implementation.
     */
    walletType: string;
    /**
     * WalletEsploraURL is used by the lwwallet backend.
     */
    walletEsploraURL: string;
    /**
     * WalletPasswordFile enables daemon auto-unlock for lwwallet.
     */
    walletPasswordFile: string;
    /**
     * WalletPollInterval overrides the lwwallet chain poll interval.
     */
    walletPollInterval: any;
    /**
     * WalletRecoveryWindow overrides the wallet address look-ahead window.
     */
    walletRecoveryWindow: number;
    /**
     * WalletFeeURL is the fee estimator endpoint used by btcwallet.
     */
    walletFeeURL: string;
    /**
     * WalletBtcwalletBlockHeadersSource is a local file path or HTTP(S)
     * URL that btcwallet/neutrino imports block headers from on startup.
     */
    walletBtcwalletBlockHeadersSource: string;
    /**
     * WalletBtcwalletFilterHeadersSource is a local file path or HTTP(S)
     * URL that btcwallet/neutrino imports compact filter headers from on
     * startup.
     */
    walletBtcwalletFilterHeadersSource: string;
    /**
     * SwapServerAddress is the swap server address for the selected
     * transport. Empty selects the daemon network+transport default.
     */
    swapServerAddress: string;
    /**
     * SwapServerTransport selects how the embedded daemon talks to the
     * swap server. Empty defaults to gRPC.
     */
    swapServerTransport: Transport;
    /**
     * SwapServerTLSCertPath pins the swap server TLS certificate.
     */
    swapServerTLSCertPath: string;
    /**
     * SwapServerInsecure disables TLS for the swap server connection.
     * This is an enable-only convenience override; set DaemonConfig
     * directly when a caller-owned config needs an explicit false value.
     */
    swapServerInsecure: boolean;
    /**
     * SwapDatabaseFileName is the daemon-owned swap SQLite database path.
     */
    swapDatabaseFileName: string;
    /**
     * MaxOperatorFeeSat caps the per-round operator fee the daemon accepts.
     */
    maxOperatorFeeSat: number;
    /**
     * AutoRefreshFeeFloorSat is the optional fixed allowance in the
     * automatic-maintenance budget curve. Zero disables the floor.
     */
    autoRefreshFeeFloorSat: number;
    /**
     * AutoRefreshFeeRatePPM is the optional proportional allowance in the
     * automatic-maintenance budget curve. Zero disables this component.
     * MaxOperatorFeeSat remains the hard ceiling over the whole curve.
     */
    autoRefreshFeeRatePPM: number;
    /**
     * SigningWorkers bounds concurrent VTXO MuSig2 signer sessions. Zero
     * selects the wallet-backend default and one forces serial signing.
     */
    signingWorkers: number;
    /**
     * EagerRoundJoin makes the embedded daemon's wallet drive
     * round-joining without waiting for a follow-up Board /
     * LeaveVTXOs RPC. With the flag on, freshly confirmed boarding
     * deposits join the next round automatically, and the wallet's
     * Exit / cooperative-leave path fires registration immediately
     * rather than batching. The wavewalletrpc-tagged embedded build
     * that wavewalletdk targets already defaults this to true via
     * waved.DefaultConfig, so leaving this field at the zero
     * value is the right choice for nearly every host. Set true
     * only to force the override when supplying a caller-owned
     * DaemonConfig that currently carries false. To force eager
     * round-join OFF, pass WithEagerRoundJoinDisabled() to Start
     * rather than mutating this field.
     */
    eagerRoundJoin: boolean;
    /**
     * BufferSize overrides the bufconn listener buffer size.
     */
    bufferSize: number;
}
/**
 * SubscribeGapError signals that a live SubscribeWallet stream fell behind (the
 * server-side send buffer overflowed). No activity is lost: the consumer should
 * open a new subscription with SubscribeRequest.Cursor set to Cursor, and the
 * replay from it is gap-free because the event log retains everything after it.
 */
export interface SubscribeGapError {
    /**
     * Cursor is the resume point: the last event-log position the stream
     * is known to have covered before falling behind.
     */
    cursor: number;
    /**
     * Reason is the daemon's human-readable description of the gap.
     */
    reason: string;
}
/**
 * ConnectConfig controls a wavewalletdk client connected to an external daemon.
 */
export interface ConnectConfig {
    /**
     * Address is the target of a daemon exposing wavewalletrpc. For gRPC
     * transport this is the gRPC address; for REST transport this is the
     * HTTP gateway base address.
     */
    address: string;
    /**
     * Transport selects how Connect talks to the daemon. Empty defaults to
     * TransportGRPC.
     */
    transport: Transport;
    /**
     * TLSCertPath is an optional daemon TLS certificate path. When empty,
     * wavewalletdk uses system roots unless Insecure is set.
     */
    tLSCertPath: string;
    /**
     * MacaroonPath is an optional daemon RPC macaroon path.
     */
    macaroonPath: string;
    /**
     * Insecure disables TLS for local development or injected listeners.
     */
    insecure: boolean;
    /**
     * DialOptions are appended to the transport and auth dial options.
     * Only used with TransportGRPC.
     */
    dialOptions: any[];
    /**
     * HTTPClient is the HTTP client used with TransportREST. Nil uses
     * http.DefaultClient, or a TLS-cert-specific client when TLSCertPath
     * is set.
     */
    hTTPClient?: any;
}
/**
 * Transport selects the RPC transport used by Connect.
 */
export type Transport = "grpc" | "rest";
/**
 * TransportGRPC connects to the daemon with native gRPC.
 */
export declare const TransportGRPC: Transport;
/**
 * TransportREST connects to the daemon through grpc-gateway HTTP/JSON.
 */
export declare const TransportREST: Transport;
/**
 * WalletState mirrors the daemon's wallet lifecycle enum so SDK
 * consumers can render wallet setup progress without collapsing
 * LOCKED and SYNCING into one "not ready" state. WalletStateSyncing
 * and WalletStateReady mean seed material is loaded; only
 * WalletStateReady means the wallet is fully usable.
 */
export type WalletState = 0 | 1 | 2 | 3 | 4;
/**
 * WalletStateUnspecified is the proto3 zero value. The daemon
 * never emits this; reserved so a missing field deserializes to
 * a safe non-ready state.
 */
export declare const WalletStateUnspecified: WalletState;
/**
 * WalletStateNone indicates no wallet has been created yet.
 */
export declare const WalletStateNone: WalletState;
/**
 * WalletStateLocked indicates a wallet database exists but its
 * password has not been provided; signing is unavailable.
 */
export declare const WalletStateLocked: WalletState;
/**
 * WalletStateReady indicates the wallet is initialized, unlocked,
 * and signing is available.
 */
export declare const WalletStateReady: WalletState;
/**
 * WalletStateSyncing indicates the wallet is unlocked and the
 * backing chain source is catching up before wallet RPCs are safe.
 */
export declare const WalletStateSyncing: WalletState;
/**
 * Info summarizes daemon readiness for wallet applications.
 */
export interface Info {
    version: string;
    commit: string;
    network: string;
    blockHeight: number;
    serverConnected: boolean;
    walletType: string;
    walletState: WalletState;
    identityPubKey: string;
    serverInfo?: ServerInfo;
}
/**
 * ServerInfo contains the operator policy hints needed by wallet hosts.
 */
export interface ServerInfo {
    /**
     * FreeRefreshWindowBlocks is the late-lifetime window in which a
     * pure refresh receives a fee waiver.
     */
    freeRefreshWindowBlocks: number;
}
/**
 * CreateWalletRequest creates or imports a daemon wallet.
 */
export interface CreateWalletRequest {
    mnemonic: string[];
    seedPassphrase: string;
    walletPassword: string;
    recoverState: boolean;
    recoveryWindow: number;
}
/**
 * CreateWalletResult returns the seed words, daemon identity, and optional
 * recovery counters.
 */
export interface CreateWalletResult {
    mnemonic: string[];
    encipheredSeed: string;
    identityPubKey: string;
    recoveryRan: boolean;
    recoveredBoardingAddresses: number;
    recoveredBoardingUTXOs: number;
    recoveredVTXOs: number;
    recoveredOORReceiveScripts: number;
    recoveredOORRecipientEvents: number;
}
/**
 * UnlockWalletRequest unlocks an existing embedded daemon wallet.
 */
export interface UnlockWalletRequest {
    walletPassword: string;
}
/**
 * UnlockWalletResult returns the daemon identity after unlock.
 */
export interface UnlockWalletResult {
    identityPubKey: string;
}
/**
 * OpenWalletResult reports the outcome of OpenWalletFromPasskey. Imported is
 * true when a new local wallet was created from the derived seed (fresh
 * device); false when an existing local wallet was unlocked. Mnemonic is set
 * only on import, for backup display.
 */
export interface OpenWalletResult {
    imported: boolean;
    mnemonic: string[];
    identityPubKey: string;
}
/**
 * Balance is the wallet-level balance view.
 */
export interface Balance {
    confirmedSat: number;
    pendingInSat: number;
    pendingOutSat: number;
    creditAvailableSat: number;
    creditReservedSat: number;
}
/**
 * DepositRequest creates a tracked boarding address.
 */
export interface DepositRequest {
    amountSatHint: number;
}
/**
 * DepositResult returns a boarding address and its initial activity entry.
 */
export interface DepositResult {
    address: string;
    entry: Entry;
}
/**
 * ReceiveRequest creates a Lightning invoice payable into the wallet.
 */
export interface ReceiveRequest {
    amountSat: number;
    memo: string;
}
/**
 * ReceiveResult contains the invoice and initial wallet entry.
 */
export interface ReceiveResult {
    invoice: string;
    entry: Entry;
}
/**
 * PrepareSendRequest validates and previews an outbound payment without
 * moving funds.
 */
export interface PrepareSendRequest {
    invoice: string;
    onchainAddress: string;
    amountSat: number;
    note: string;
    maxFeeSat: number;
    /**
     * SweepAll drains every live VTXO to OnchainAddress. PrepareSend
     * snapshots the live VTXO set and SendPrepared later spends that
     * exact set. Ignored on the invoice path.
     */
    sweepAll: boolean;
}
/**
 * SendRail identifies the expected settlement rail for a prepared send.
 */
export type SendRail = "unspecified" | "offchain_unknown" | "in_ark" | "lightning" | "onchain" | "credit" | "mixed";
export declare const SendRailUnspecified: SendRail;
export declare const SendRailOffchainUnknown: SendRail;
export declare const SendRailInArk: SendRail;
export declare const SendRailLightning: SendRail;
export declare const SendRailOnchain: SendRail;
export declare const SendRailCredit: SendRail;
export declare const SendRailMixed: SendRail;
/**
 * SendQuoteStatus describes how complete the prepare-time quote is.
 */
export type SendQuoteStatus = "unspecified" | "complete" | "local_only";
export declare const SendQuoteStatusUnspecified: SendQuoteStatus;
export declare const SendQuoteStatusComplete: SendQuoteStatus;
export declare const SendQuoteStatusLocalOnly: SendQuoteStatus;
/**
 * PrepareSendResult contains the preview and intent id for a send.
 */
export interface PrepareSendResult {
    sendIntentId: string;
    amountSat: number;
    expectedFeeSat: number;
    feeKnown: boolean;
    expectedTotalOutflowSat: number;
    totalOutflowKnown: boolean;
    rail: SendRail;
    quoteStatus: SendQuoteStatus;
    destinationSummary: string;
    invoiceDescription: string;
    paymentHash: string;
    expiresAtUnix: number;
    selectedOutpoints: string[];
    warning: string;
    creditPreview?: CreditPreview;
}
/**
 * CreditPreview describes how a prepared invoice send will use sat-native
 * server credits.
 */
export interface CreditPreview {
    mustUseCredit: boolean;
    creditAppliedSat: number;
    creditShortfallSat: number;
    creditTopupSat: number;
    arkFundingSat: number;
}
/**
 * SendPreparedRequest dispatches a prepared outbound payment.
 */
export interface SendPreparedRequest {
    /**
     * SendIntentID is consumed before dispatch. If dispatch returns an
     * error, callers should prepare a fresh send before retrying.
     */
    sendIntentId: string;
}
/**
 * SendResult contains the initial wallet entry for an outbound payment.
 */
export interface SendResult {
    entry: Entry;
    /**
     * ActualAmountSat is the real amount that will leave the wallet for
     * this operation. For invoice sends it matches the invoice principal.
     * For a bounded onchain send it matches the requested amount (the
     * seal-time fee handshake returns change). For a sweep-all onchain
     * send it reflects the swept VTXO total, so host UIs SHOULD echo it
     * back to the user before treating the send as confirmed.
     */
    actualAmountSat: number;
}
/**
 * ListView selects which slice of wallet state List returns. The empty
 * value is treated as ListViewActivity for backwards-feel.
 */
export type ListView = "activity" | "vtxos" | "onchain";
/**
 * ListViewActivity returns the merged WalletEntry stream
 * (send / recv / deposit / exit). Default.
 */
export declare const ListViewActivity: ListView;
/**
 * ListViewVTXOs returns the live VTXO inventory.
 */
export declare const ListViewVTXOs: ListView;
/**
 * ListViewOnchain returns the on-chain transaction history
 * (boarding, sweeps, leave outputs).
 */
export declare const ListViewOnchain: ListView;
/**
 * ListRequest controls wallet activity listing. View selects the slice
 * of wallet state to return; PendingOnly and Kinds apply only when
 * View is ListViewActivity (or empty).
 */
export interface ListRequest {
    /**
     * View selects the response shape. Empty is treated as
     * ListViewActivity.
     */
    view: ListView;
    /**
     * PendingOnly applies to ListViewActivity only.
     */
    pendingOnly: boolean;
    /**
     * Kinds applies to ListViewActivity only.
     */
    kinds: EntryKind[];
    /**
     * Limit caps the page size; zero uses the daemon default.
     */
    limit: number;
    /**
     * Offset is the pagination offset. It applies to the VTXOs and
     * Onchain views; the Activity view paginates by Cursor and ignores
     * Offset.
     */
    offset: number;
    /**
     * Cursor is the opaque pagination token for the Activity view. Empty
     * starts from the newest entry; otherwise pass the NextCursor returned
     * by the previous ActivityList page.
     */
    cursor: string;
}
/**
 * ListResult is a tagged union: exactly one of Activity, VTXOs, or
 * Onchain is populated according to the view requested. Callers should
 * switch on View to pick the right field.
 */
export interface ListResult {
    /**
     * View is the populated variant. Mirrors ListRequest.View; an
     * empty request view is reported as ListViewActivity.
     */
    view: ListView;
    /**
     * Activity is populated when View == ListViewActivity.
     */
    activity?: ActivityList;
    /**
     * VTXOs is populated when View == ListViewVTXOs.
     */
    vtxos?: VTXOInventory;
    /**
     * Onchain is populated when View == ListViewOnchain.
     */
    onchain?: OnchainHistory;
}
/**
 * ActivityList is the merged WalletEntry stream returned by the
 * activity view.
 */
export interface ActivityList {
    entries: Entry[];
    /**
     * Total is the number of entries on this page, not a full-feed count:
     * the feed is cursor-paged, so use HasMore to decide whether to fetch
     * again.
     */
    total: number;
    /**
     * HasMore reports whether more entries exist after this page.
     */
    hasMore: boolean;
    /**
     * NextCursor is the token to pass as ListRequest.Cursor to fetch the
     * next page. Empty when HasMore is false.
     */
    nextCursor: string;
}
/**
 * VTXOInventory is the live VTXO inventory returned by the vtxos view.
 */
export interface VTXOInventory {
    vtxos: WalletVTXO[];
    total: number;
}
/**
 * WalletVTXO is the wallet-facing view of one VTXO. Internal lifecycle
 * detail (forfeiting flow, chain depth) is hidden; power-users reach
 * the full shape via `ark vtxos list`.
 */
export interface WalletVTXO {
    outpoint: string;
    amountSat: number;
    status: string;
    batchExpiry: number;
    relativeExpiry: number;
    commitmentTxid: string;
}
/**
 * OnchainHistory is the on-chain transaction history returned by the
 * onchain view.
 */
export interface OnchainHistory {
    txs: OnchainTx[];
    total: number;
    hasMore: boolean;
}
/**
 * OnchainTx is the wallet-facing view of one on-chain transaction.
 */
export interface OnchainTx {
    txid: string;
    kind: string;
    amountSat: number;
    feeSat: number;
    status: string;
    confirmationHeight: number;
    createdAt: string;
    description: string;
}
/**
 * ExitRequest triggers an exit for a VTXO outpoint. When Destination is
 * set, the SDK first attempts a cooperative leave (LeaveVTXOs RPC) with
 * the leave output bound for the supplied on-chain address; if that path
 * succeeds, the SDK returns a cooperative result. Unilateral unroll is
 * reachable only when ForceUnrollAck carries the daemon's exact
 * acknowledgement string.
 */
export interface ExitRequest {
    /**
     * Outpoint identifies the VTXO to exit in "txid:index" format.
     */
    outpoint: string;
    /**
     * Destination is the on-chain address that receives the leave
     * output when the cooperative path succeeds. The address must be
     * valid for the daemon's configured network. Empty asks the daemon
     * to generate a fresh backing-wallet destination internally.
     */
    destination: string;
    /**
     * ForceUnrollAck must be exactly "I_KNOW_WHAT_I_AM_DOING" to bypass
     * cooperative leave and start unilateral unroll. Cannot be combined
     * with Destination; the server rejects the pair with InvalidArgument.
     */
    forceUnrollAck: string;
}
/**
 * ExitPath identifies which branch of the Exit decision tree the
 * daemon ended up taking. Callers should switch on Path rather than
 * chaining nil-checks across the result's variant fields.
 */
export type ExitPath = "cooperative" | "unilateral" | "unilateral_fallback";
/**
 * ExitPathCooperative means the cooperative leave was admitted by
 * the operator; QueuedOutpoints carries the round's selection
 * echo. Cooperative round completion is asynchronous; subscribe
 * via wavewalletrpc.SubscribeWallet to confirm terminal state.
 */
export declare const ExitPathCooperative: ExitPath;
/**
 * ExitPathUnilateral means the caller supplied the exact force
 * acknowledgement and the daemon started unilateral unroll. Created
 * and ActorID describe the unilateral unroll job.
 */
export declare const ExitPathUnilateral: ExitPath;
/**
 * ExitPathUnilateralFallback is retained for source compatibility
 * with the prior SDK result shape. New forced unrolls return
 * ExitPathUnilateral; current wallet RPC behavior never returns this
 * path because cooperative failures are surfaced directly.
 */
export declare const ExitPathUnilateralFallback: ExitPath;
/**
 * ExitResult is a tagged union over the three exit paths. Callers
 * should read Path first and only inspect the variant fields
 * associated with that path; the remaining fields are zero-valued.
 */
export interface ExitResult {
    /**
     * Path discriminates between the three legal outcomes; callers
     * MUST switch on Path before reading the variant fields below.
     */
    path: ExitPath;
    /**
     * Cooperative is true iff Path == ExitPathCooperative. Retained
     * for backwards compatibility with the v1 result shape; new
     * callers should prefer Path.
     */
    cooperative: boolean;
    /**
     * QueuedOutpoints lists the outpoints the cooperative leave
     * admitted into a round. Populated only when
     * Path == ExitPathCooperative.
     */
    queuedOutpoints: string[];
    /**
     * Created reports whether the unilateral-unroll path spawned a
     * fresh job. Populated when Path is ExitPathUnilateral or
     * ExitPathUnilateralFallback.
     */
    created: boolean;
    /**
     * ActorID identifies the durable unroll job that owns the
     * unilateral path. Populated when Path is ExitPathUnilateral or
     * ExitPathUnilateralFallback.
     */
    actorID: string;
    /**
     * CooperativeError is retained for source compatibility with the
     * prior SDK fallback result shape. Current wallet RPC behavior never
     * populates it because cooperative failures are returned directly
     * instead of falling back to unilateral unroll.
     */
    cooperativeError: string;
}
/**
 * ExitStatusRequest queries the current phase of an exit job.
 */
export interface ExitStatusRequest {
    outpoint: string;
    /**
     * Detailed requests recovery-tree progress, a CSV maturity countdown,
     * a fee breakdown, and a best-case block countdown. It costs one live
     * actor round-trip plus a fee estimate, so leave it false for a coarse,
     * cheaper phase-only status.
     */
    detailed: boolean;
}
/**
 * ExitJobStatus collapses the underlying unroll job phases to a short
 * wallet-facing string set.
 */
export type ExitJobStatus = "unspecified" | "pending" | "materializing" | "csv_pending" | "sweeping" | "completed" | "failed";
export declare const ExitJobStatusUnspecified: ExitJobStatus;
export declare const ExitJobStatusPending: ExitJobStatus;
export declare const ExitJobStatusMaterializing: ExitJobStatus;
export declare const ExitJobStatusCSVPending: ExitJobStatus;
export declare const ExitJobStatusSweeping: ExitJobStatus;
export declare const ExitJobStatusCompleted: ExitJobStatus;
export declare const ExitJobStatusFailed: ExitJobStatus;
/**
 * ExitStatusResult reports the status of one exit job. Found is false
 * when no job exists for the requested outpoint (not an error).
 */
export interface ExitStatusResult {
    found: boolean;
    status: ExitJobStatus;
    sweepTxid: string;
    lastError: string;
    /**
     * PhaseDetail is a one-line human description of the current phase.
     * Empty on a coarse (non-detailed) query.
     */
    phaseDetail: string;
    /**
     * Progress is the recovery-tree materialization progress. Nil on a
     * coarse query, or when no live actor backs the job.
     */
    progress?: ExitProgress;
    /**
     * CSV is the target's CSV maturity countdown. Nil until the target
     * confirms.
     */
    cSV?: ExitCSV;
    /**
     * Fees is the on-chain cost breakdown for the exit. Nil on a coarse
     * query.
     */
    fees?: ExitFees;
    /**
     * BestCaseBlocksRemaining is the optimistic block count until a
     * confirmed sweep. Zero on a coarse query.
     */
    bestCaseBlocksRemaining: number;
    /**
     * CurrentHeight is the best block height the exit job has observed.
     * Zero on a coarse query, or when no live actor backs the job.
     */
    currentHeight: number;
}
/**
 * ExitProgress describes materialization progress through the recovery tree.
 */
export interface ExitProgress {
    confirmedTxs: number;
    inFlightTxs: number;
    readyTxs: number;
    blockedTxs: number;
    totalTxs: number;
    currentLayer: number;
    totalLayers: number;
    targetConfirmed: boolean;
    allProofConfirmed: boolean;
}
/**
 * ExitCSV describes the target's CSV maturity countdown, populated once the
 * target transaction confirms.
 */
export interface ExitCSV {
    targetConfirmHeight: number;
    maturityHeight: number;
    blocksRemaining: number;
    mature: boolean;
}
/**
 * ExitFees breaks down the on-chain cost of the exit. The CPFP total is
 * estimated; SweepFeeActual reports whether SweepFeeSat is the real built-sweep
 * fee rather than an estimate. SpentSoFarSat is the estimated fee committed so
 * far, while TotalCostSat is the projected cost of the whole exit.
 */
export interface ExitFees {
    cPFPFeeSat: number;
    sweepFeeSat: number;
    totalCostSat: number;
    spentSoFarSat: number;
    vTXOAmountSat: number;
    netRecoveredSat: number;
    feeRateSatVByte: number;
    sweepFeeActual: boolean;
}
/**
 * ExitSummaryRequest asks for the wallet-wide portfolio of in-progress exits.
 */
export interface ExitSummaryRequest {
}
/**
 * ExitSummaryResult is the wallet-wide portfolio of in-progress exits plus
 * aggregate totals. Only non-terminal exits are included.
 */
export interface ExitSummaryResult {
    exits: ExitSummaryEntry[];
    totalExits: number;
    totalVTXOAmountSat: number;
    totalEstFeeSat: number;
    totalEstNetRecoveredSat: number;
}
/**
 * ExitSummaryEntry is one in-progress exit's coarse contribution to the
 * portfolio.
 */
export interface ExitSummaryEntry {
    outpoint: string;
    status: ExitJobStatus;
    vTXOAmountSat: number;
    estTotalFeeSat: number;
    estNetRecoveredSat: number;
}
/**
 * GetExitPlanRequest previews unilateral-exit readiness for a slice of VTXOs.
 */
export interface GetExitPlanRequest {
    outpoints: string[];
    confTarget: number;
}
/**
 * ExitPlanEntry describes how to fund the backing wallet before Exit for a
 * single previewed VTXO outpoint.
 */
export interface ExitPlanEntry {
    outpoint: string;
    fundingAddress: string;
    requiredConfirmations: number;
    requiredFeeUTXOCount: number;
    usableFeeUTXOCount: number;
    recommendedUTXOAmountSat: number;
    recommendedTotalFundingSat: number;
    fundingShortfallSat: number;
    canStart: boolean;
    /**
     * InfeasibilityReason explains why CanStart is false. It may be a
     * structural block - a dust or uneconomical VTXO the wallet can never
     * make exitable (FundingShortfallSat is zero) - or a funding shortfall
     * the wallet could cover (wallet underfunded or too few fee inputs,
     * also reflected in FundingShortfallSat). It is
     * ExitInfeasibilityReasonUnspecified when CanStart is true.
     */
    infeasibilityReason: ExitInfeasibilityReason;
    exitJobFound: boolean;
    exitStatus: ExitJobStatus;
    sweepTxid: string;
    lastError: string;
    /**
     * Err is a per-outpoint failure (empty on success).
     */
    err: string;
}
/**
 * ExitInfeasibilityReason explains why a previewed exit cannot start. The
 * block may be structural (a dust or uneconomical VTXO) or a funding
 * shortfall the wallet could cover (wallet underfunded or too few fee
 * inputs). It is a wrapper-owned lowercase string set, decoupled from the
 * proto enum numbering.
 */
export type ExitInfeasibilityReason = "unspecified" | "sweep_below_dust" | "uneconomical" | "wallet_underfunded" | "wallet_too_few_inputs";
export declare const ExitInfeasibilityReasonUnspecified: ExitInfeasibilityReason;
export declare const ExitInfeasibilityReasonSweepBelowDust: ExitInfeasibilityReason;
export declare const ExitInfeasibilityReasonUneconomical: ExitInfeasibilityReason;
export declare const ExitInfeasibilityReasonWalletUnderfunded: ExitInfeasibilityReason;
export declare const ExitInfeasibilityReasonWalletTooFewInputs: ExitInfeasibilityReason;
/**
 * GetExitPlanResult describes the combined backing-wallet funding plan for
 * every previewed outpoint plus aggregate totals.
 */
export interface GetExitPlanResult {
    plans: ExitPlanEntry[];
    feeRateSatPerVByte: number;
    canStart: boolean;
    totalFundingShortfallSat: number;
    totalRecommendedFundingSat: number;
}
/**
 * SweepWalletRequest previews or broadcasts a backing-wallet sweep.
 */
export interface SweepWalletRequest {
    destinationAddress: string;
    broadcast: boolean;
    feeRateSatPerVByte: number;
    confTarget: number;
}
/**
 * WalletSweepInput describes one backing-wallet UTXO selected by SweepWallet.
 */
export interface WalletSweepInput {
    outpoint: string;
    amountSat: number;
}
/**
 * SweepWalletResult contains the selected inputs and optional broadcast txid.
 */
export interface SweepWalletResult {
    inputs: WalletSweepInput[];
    totalInputSat: number;
    estimatedFeeSat: number;
    netAmountSat: number;
    feeRateSatPerVByte: number;
    canBroadcast: boolean;
    txid: string;
    failureReason: string;
}
/**
 * Status summarizes wallet readiness and pending activity.
 */
export interface Status {
    ready: boolean;
    unlocked: boolean;
    network: string;
    balance: Balance;
    pendingCount: number;
}
/**
 * SubscribeRequest controls wallet activity subscriptions.
 */
export interface SubscribeRequest {
    includeExisting: boolean;
    kinds: EntryKind[];
    /**
     * Cursor resumes the stream after a prior Entry.Cursor (or a
     * *SubscribeGapError.Cursor): the daemon replays every activity event
     * after it, then streams live. Zero replays the full history when
     * IncludeExisting is set, or streams live-only otherwise.
     */
    cursor: number;
}
/**
 * EntryKind is the user-visible wallet activity category.
 */
export type EntryKind = "send" | "receive" | "deposit" | "exit";
/**
 * EntryKindSend is an outbound wallet payment.
 */
export declare const EntryKindSend: EntryKind;
/**
 * EntryKindReceive is an inbound Lightning-to-wallet receive.
 */
export declare const EntryKindReceive: EntryKind;
/**
 * EntryKindDeposit is a boarding on-chain deposit.
 */
export declare const EntryKindDeposit: EntryKind;
/**
 * EntryKindExit is a cooperative wallet-to-on-chain exit.
 */
export declare const EntryKindExit: EntryKind;
/**
 * EntryStatus is the collapsed wallet activity state.
 */
export type EntryStatus = "pending" | "complete" | "failed";
/**
 * EntryStatusPending means the activity is still in flight.
 */
export declare const EntryStatusPending: EntryStatus;
/**
 * EntryStatusComplete means the activity finished successfully.
 */
export declare const EntryStatusComplete: EntryStatus;
/**
 * EntryStatusFailed means the activity reached a terminal failure.
 */
export declare const EntryStatusFailed: EntryStatus;
/**
 * Entry is the wallet-facing activity row used by UI and bridge layers.
 */
export interface Entry {
    id: string;
    kind: EntryKind;
    status: EntryStatus;
    amountSat: number;
    feeSat: number;
    counterparty: string;
    createdAt: string;
    updatedAt: string;
    note: string;
    failureReason: string;
    /**
     * Cursor is the monotonic event-log position of this update on a
     * SubscribeWallet stream. Persist it and pass it back as
     * SubscribeRequest.Cursor to resume without gaps. It is zero outside
     * the subscription path (List / Send / Recv / Deposit results).
     */
    cursor: number;
    /**
     * Progress carries the lifecycle metadata the daemon already
     * normalized for this entry (phase, payment hash, txid, confirmation
     * height, vHTLC outpoint). It is nil when the backing subsystem
     * supplied no progress hint.
     */
    progress?: EntryProgress;
    /**
     * Request echoes the user-recognizable request that created the entry
     * (a Lightning invoice, an on-chain address, or an Ark address). It is
     * nil when the backing subsystem did not persist one.
     */
    request?: EntryRequest;
    /**
     * FailureCode is a stable, machine-readable classification of why the
     * entry failed. It is empty unless Status is failed, mirroring
     * FailureReason, which remains the human-readable supplement.
     */
    failureCode: EntryFailureCode;
}
/**
 * EntryPhase is a coarse, wrapper-owned lifecycle phase for an Entry. It does
 * not replace Status: Status answers pending/complete/failed, while Phase
 * explains the current backing-system step. Like the other Entry enums it is
 * a lowercase string decoupled from the proto enum so renumbering cannot break
 * callers; switch on it rather than comparing proto values.
 */
export type EntryPhase = "unspecified" | "request_created" | "waiting_for_payment" | "payment_detected" | "settling" | "confirmed" | "refunding" | "refunded" | "failed" | "waiting_for_confirmation";
/**
 * EntryPhaseUnspecified means the backing subsystem provided no
 * lifecycle hint.
 */
export declare const EntryPhaseUnspecified: EntryPhase;
/**
 * EntryPhaseRequestCreated means the request was created but no payment
 * has been observed yet.
 */
export declare const EntryPhaseRequestCreated: EntryPhase;
/**
 * EntryPhaseWaitingForPayment means the wallet is waiting for an
 * inbound payment or swap funding.
 */
export declare const EntryPhaseWaitingForPayment: EntryPhase;
/**
 * EntryPhasePaymentDetected means a payment was detected but is not yet
 * settled.
 */
export declare const EntryPhasePaymentDetected: EntryPhase;
/**
 * EntryPhaseSettling means the operation is settling through Ark,
 * Lightning, or on-chain machinery.
 */
export declare const EntryPhaseSettling: EntryPhase;
/**
 * EntryPhaseConfirmed means the backing operation is confirmed or
 * otherwise durably complete.
 */
export declare const EntryPhaseConfirmed: EntryPhase;
/**
 * EntryPhaseRefunding means the operation is currently refunding.
 */
export declare const EntryPhaseRefunding: EntryPhase;
/**
 * EntryPhaseRefunded means the refund path completed.
 */
export declare const EntryPhaseRefunded: EntryPhase;
/**
 * EntryPhaseFailed means the backing operation reached a terminal
 * failed state.
 */
export declare const EntryPhaseFailed: EntryPhase;
/**
 * EntryPhaseWaitingForConfirmation means an on-chain payment was
 * detected and is waiting for block confirmation.
 */
export declare const EntryPhaseWaitingForConfirmation: EntryPhase;
/**
 * EntryProgress is the wrapper-owned view of the lifecycle metadata the daemon
 * computes for an Entry. Fields are populated on a best-effort basis by the
 * backing subsystem; an empty field means "not applicable / not yet known".
 */
export interface EntryProgress {
    /**
     * Phase is the coarse lifecycle phase for the entry.
     */
    phase: EntryPhase;
    /**
     * PhaseLabel is the short lowercase label the daemon emitted; clients
     * may render it directly instead of switching on Phase.
     */
    phaseLabel: string;
    /**
     * PaymentHash is populated for Lightning-backed send/recv entries.
     */
    paymentHash: string;
    /**
     * Txid is populated when the backing ledger row has an on-chain txid.
     */
    txid: string;
    /**
     * ConfirmationHeight is populated once the source records it.
     */
    confirmationHeight: number;
    /**
     * VTXOOutpoint is populated when a swap observes the Ark vHTLC output.
     */
    vTXOOutpoint: string;
    /**
     * Preimage is the hex-encoded Lightning payment preimage once the swap
     * revealed it. For a completed Lightning-backed send this is the proof
     * of payment for the paid invoice (sha256(preimage) == PaymentHash); it
     * is empty until durably known and for non-Lightning entries.
     */
    preimage: string;
}
/**
 * EntryRequestType discriminates which request shape an EntryRequest carries.
 * Callers should switch on Type before reading the variant fields.
 */
export type EntryRequestType = "lightning" | "onchain" | "ark";
/**
 * EntryRequestTypeLightning marks a Lightning send/recv request; the
 * LightningInvoice and PaymentHash fields are populated.
 */
export declare const EntryRequestTypeLightning: EntryRequestType;
/**
 * EntryRequestTypeOnchain marks a deposit/exit request; the
 * OnchainAddress field is populated.
 */
export declare const EntryRequestTypeOnchain: EntryRequestType;
/**
 * EntryRequestTypeArk marks a direct Ark send/recv request; the
 * ArkAddress field is populated.
 */
export declare const EntryRequestTypeArk: EntryRequestType;
/**
 * EntryRequest is the wrapper-owned, flattened view of the proto request
 * oneof. Exactly one variant's fields are populated, named by Type; read Type
 * first and treat the other fields as zero.
 */
export interface EntryRequest {
    /**
     * Type names the populated variant.
     */
    type: EntryRequestType;
    /**
     * LightningInvoice is the BOLT-11 payment request. Populated when Type
     * is EntryRequestTypeLightning.
     */
    lightningInvoice: string;
    /**
     * PaymentHash identifies the Lightning invoice and stays stable after
     * the invoice is no longer convenient to display. Populated when Type
     * is EntryRequestTypeLightning.
     */
    paymentHash: string;
    /**
     * OnchainAddress is the bech32 on-chain address originally issued or
     * targeted. Populated when Type is EntryRequestTypeOnchain.
     */
    onchainAddress: string;
    /**
     * ArkAddress is the Ark address originally issued or targeted.
     * Populated when Type is EntryRequestTypeArk.
     */
    arkAddress: string;
}
/**
 * EntryFailureCode is a wrapper-owned, stable classification of why a failed
 * Entry failed. Like the other Entry enums it is a lowercase string decoupled
 * from the proto enum; switch on it rather than comparing proto values.
 */
export type EntryFailureCode = "timed_out" | "expired" | "refunded" | "needs_intervention" | "failed";
/**
 * EntryFailureCodeTimedOut means the operation exceeded the wallet
 * deadline before reaching a terminal state.
 */
export declare const EntryFailureCodeTimedOut: EntryFailureCode;
/**
 * EntryFailureCodeExpired means the swap expired before it was funded.
 */
export declare const EntryFailureCodeExpired: EntryFailureCode;
/**
 * EntryFailureCodeRefunded means an outbound payment was refunded back
 * to the wallet.
 */
export declare const EntryFailureCodeRefunded: EntryFailureCode;
/**
 * EntryFailureCodeNeedsIntervention means the swap reached an anomalous
 * state requiring manual recovery.
 */
export declare const EntryFailureCodeNeedsIntervention: EntryFailureCode;
/**
 * EntryFailureCodeFailed is a generic terminal failure with no more
 * specific classification.
 */
export declare const EntryFailureCodeFailed: EntryFailureCode;
//# sourceMappingURL=generated.d.ts.map