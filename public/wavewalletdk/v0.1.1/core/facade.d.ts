import type { RuntimeConfig } from './config.ts';
import type { CreateWalletRequest, UnlockWalletRequest } from './requests.ts';
/** Portable mobile and WASM facade methods available through `callFacade()`. */
export declare const FACADE_METHODS: readonly ["start", "stop", "getInfo", "status", "balance", "createWallet", "unlockWallet", "openWalletFromPasskey", "deposit", "receive", "prepareSend", "sendPrepared", "list", "exit", "exitStatus", "exitSummary", "getExitPlan", "sweepWallet", "confirmedBalanceSat", "pendingInboundSat", "walletReady", "isRunning"];
/** One portable daemon facade method accepted by `callFacade()`. */
export type FacadeMethod = (typeof FACADE_METHODS)[number];
export declare function assertFacadeMethod(method: unknown): asserts method is FacadeMethod;
/**
 * Selects how the embedded daemon dials the Ark operator and swap server. The
 * browser transport must use 'rest' (a browser cannot speak native gRPC over
 * the wire), while native transports use 'grpc'. The choice also changes what
 * the address fields mean: with 'rest', the Ark and swap server addresses are
 * gateway URLs; with 'grpc', they are host:port gRPC addresses.
 */
export type ServerTransport = 'rest' | 'grpc';
/**
 * The flat, snake_case config the wavewalletdk mobile facade's `start` verb
 * decodes (sdk/wavewalletdk/mobile.mobileConfig). Every transport forwards it
 * verbatim to the facade's Start.
 */
export type MobileConfig = {
    data_dir?: string;
    network?: string;
    debug_level?: string;
    allow_mainnet?: boolean;
    server_address?: string;
    server_tls_cert_path?: string;
    server_transport?: ServerTransport;
    server_insecure?: boolean;
    wallet_type?: 'lwwallet' | 'btcwallet';
    wallet_esplora_url?: string;
    wallet_password_file?: string;
    wallet_poll_interval_seconds?: number;
    wallet_recovery_window?: number;
    wallet_fee_url?: string;
    wallet_block_headers_source?: string;
    wallet_filter_headers_source?: string;
    swap_server_address?: string;
    swap_server_tls_cert_path?: string;
    swap_server_transport?: ServerTransport;
    swap_server_insecure?: boolean;
    swap_database_file_name?: string;
    max_operator_fee_sat?: number;
    signing_workers?: number;
    buffer_size?: number;
};
/**
 * Maps the public RuntimeConfig onto the flat config the mobile facade
 * expects.
 *
 * Mailbox addressing: the facade's MobileConfig has a single server_address
 * (and swap_server_address) per service. Mailbox traffic shares that edge, so
 * RuntimeConfig deliberately does not expose separate mailbox gateway fields.
 * If a future facade version splits the mailbox onto its own address, add the
 * field to RuntimeConfig and thread it through here.
 *
 * @param config - The public runtime configuration.
 * @param serverTransport - How this transport's daemon dials the servers; see
 * {@link ServerTransport}.
 */
export declare function toMobileConfig(config: RuntimeConfig, serverTransport: ServerTransport): MobileConfig;
/**
 * Encodes a string as base64 of its UTF-8 bytes, matching how Go's
 * encoding/json represents a []byte field. Implemented without btoa or
 * TextEncoder so it behaves identically in the browser, a worker, and Hermes.
 */
export declare function base64FromUtf8(value: string): string;
/**
 * Maps the TS-convention {@link CreateWalletRequest} (with a string password
 * field) to the Go JSON shape the facade expects. Go's encoding/json uses
 * struct field names verbatim and represents []byte as base64, so
 * WalletPassword and SeedPassphrase must arrive as base64.
 */
export declare function toGoCreateWalletReq(req: CreateWalletRequest): {
    WalletPassword: string | undefined;
    Mnemonic: string[] | undefined;
    SeedPassphrase: string | undefined;
    RecoverState: boolean | undefined;
    RecoveryWindow: number | undefined;
};
/**
 * Maps the TS-convention {@link UnlockWalletRequest} to the Go JSON shape,
 * base64-encoding the password string for the []byte field.
 */
export declare function toGoUnlockWalletReq(req: UnlockWalletRequest): {
    WalletPassword: string | undefined;
};
//# sourceMappingURL=facade.d.ts.map