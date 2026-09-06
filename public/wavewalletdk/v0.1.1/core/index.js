// The framework-agnostic contract for Wavelength. This file is a thin barrel that
// re-exports the package's public API from the per-concern modules below; the
// definitions live there. See each module for the documented symbols.
// Network selection and runtime configuration. App code normally builds a
// config through a transport package's defaultConfig helper; networkDefaults
// is the shared endpoint table those helpers compose over.
export { DEBUG_LEVELS, networkDefaults, validateRuntimeConfig, } from "./config.js";
// Wallet lifecycle state and the phases a UI renders.
export { WalletState, normalizeInfo, phaseFromInfo, walletStateFromProto } from "./state.js";
export { FORCE_UNROLL_ACK } from "./requests.js";
export { SendRailUnspecified, SendRailOffchainUnknown, SendRailInArk, SendRailLightning, SendRailOnchain, SendRailCredit, SendRailMixed, SendQuoteStatusUnspecified, SendQuoteStatusComplete, SendQuoteStatusLocalOnly, ListViewActivity, ListViewVTXOs, ListViewOnchain, ExitPathCooperative, ExitPathUnilateral, ExitPathUnilateralFallback, ExitJobStatusUnspecified, ExitJobStatusPending, ExitJobStatusMaterializing, ExitJobStatusCSVPending, ExitJobStatusSweeping, ExitJobStatusCompleted, ExitJobStatusFailed, ExitInfeasibilityReasonUnspecified, ExitInfeasibilityReasonSweepBelowDust, ExitInfeasibilityReasonUneconomical, ExitInfeasibilityReasonWalletUnderfunded, ExitInfeasibilityReasonWalletTooFewInputs, EntryKindSend, EntryKindReceive, EntryKindDeposit, EntryKindExit, EntryStatusPending, EntryStatusComplete, EntryStatusFailed, EntryPhaseUnspecified, EntryPhaseRequestCreated, EntryPhaseWaitingForPayment, EntryPhasePaymentDetected, EntryPhaseSettling, EntryPhaseConfirmed, EntryPhaseRefunding, EntryPhaseRefunded, EntryPhaseFailed, EntryPhaseWaitingForConfirmation, EntryRequestTypeLightning, EntryRequestTypeOnchain, EntryRequestTypeArk, EntryFailureCodeTimedOut, EntryFailureCodeExpired, EntryFailureCodeRefunded, EntryFailureCodeNeedsIntervention, EntryFailureCodeFailed, } from "./results.js";
// Exit-batch orchestration.
export { exitBatch, isExitInfeasibilityFundable } from "./exit.js";
// The transport-agnostic half of the client, for transport implementers:
// extend it and supply invokeFacade, ready, the activity plumbing, and the
// transport flavor.
export { BaseWavelengthClient } from "./base-client.js";
// The SDK error type and its machine-readable codes.
export { WavelengthError, errorMessage, isPasskeyCancelled, PasskeyCancelledError, toError, } from "./errors.js";
// Passkey contract types, the wallet-kind label, and the shared PRF salt.
export { PASSKEY_PRF_NAMESPACE, PASSKEY_PRF_SALT_HEX } from "./passkey.js";
// The daemon facade method catalog shared by every transport.
export { FACADE_METHODS, base64FromUtf8 } from "./facade.js";
// The daemon build this SDK release is paired with (generated types and
// runtime assets alike).
export { RUNTIME_MANIFEST_VERSION } from "./version.js";
// BaseWavelengthClient applies camelizeKeys once to every facade response.
// Transports should return daemon-shaped values instead of normalizing them.
export { camelizeKeys } from "./casing.js";
// classifyDestination decides which fields a send UI should render for a pasted
// destination. It never names a settlement rail; read that from prepareSend.
export { classifyDestination } from "./destination.js";
// The headless wallet engine: the framework-agnostic orchestrator that React
// (and future bindings) subscribe to. Most apps construct one through a
// transport factory (createWebWalletEngine / createNativeWalletEngine).
export { createWalletEngine } from "./engine/engine.js";
