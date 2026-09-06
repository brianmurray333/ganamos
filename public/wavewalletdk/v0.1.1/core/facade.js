import { WavelengthError } from "./errors.js";
/** Portable mobile and WASM facade methods available through `callFacade()`. */
export const FACADE_METHODS = [
    'start',
    'stop',
    'getInfo',
    'status',
    'balance',
    'createWallet',
    'unlockWallet',
    'openWalletFromPasskey',
    'deposit',
    'receive',
    'prepareSend',
    'sendPrepared',
    'list',
    'exit',
    'exitStatus',
    'exitSummary',
    'getExitPlan',
    'sweepWallet',
    'confirmedBalanceSat',
    'pendingInboundSat',
    'walletReady',
    'isRunning',
];
const FACADE_METHOD_SET = new Set(FACADE_METHODS);
export function assertFacadeMethod(method) {
    if (typeof method !== 'string' || !FACADE_METHOD_SET.has(method)) {
        throw new WavelengthError(`unsupported facade method: ${String(method)}`, 'unsupported_facade_method');
    }
}
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
export function toMobileConfig(config, serverTransport) {
    const out = {
        data_dir: config.dataDir,
        network: config.network,
        debug_level: config.debugLevel,
        allow_mainnet: config.allowMainnet,
        server_address: config.arkServerAddress,
        server_tls_cert_path: config.arkServerTlsCertPath,
        server_transport: serverTransport,
        server_insecure: config.arkServerInsecure,
        wallet_type: config.walletType ?? 'lwwallet',
        wallet_esplora_url: config.walletEsploraUrl,
        wallet_password_file: config.walletPasswordFile,
        wallet_poll_interval_seconds: config.walletPollIntervalSeconds,
        wallet_recovery_window: config.walletRecoveryWindow,
        wallet_fee_url: config.walletFeeUrl,
        wallet_block_headers_source: config.walletBlockHeadersSource,
        wallet_filter_headers_source: config.walletFilterHeadersSource,
        max_operator_fee_sat: config.maxOperatorFeeSat,
        signing_workers: config.signingWorkers,
        buffer_size: config.bufferSize,
    };
    // Leaving the swap server address unset disables the swap subsystem, so omit
    // every swap field when the host asked to run without swaps.
    if (!config.disableSwaps) {
        out.swap_server_address = config.swapServerAddress;
        out.swap_server_tls_cert_path = config.swapServerTlsCertPath;
        out.swap_server_transport = serverTransport;
        out.swap_server_insecure = config.swapServerInsecure;
        out.swap_database_file_name = config.swapDatabaseFileName;
    }
    for (const key of Object.keys(out)) {
        if (out[key] === undefined) {
            delete out[key];
        }
    }
    return out;
}
// The base64 alphabet, indexed by 6-bit value.
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/**
 * Encodes a string as base64 of its UTF-8 bytes, matching how Go's
 * encoding/json represents a []byte field. Implemented without btoa or
 * TextEncoder so it behaves identically in the browser, a worker, and Hermes.
 */
export function base64FromUtf8(value) {
    const bytes = [];
    for (const ch of value) {
        const cp = ch.codePointAt(0);
        if (cp < 0x80) {
            bytes.push(cp);
        }
        else if (cp < 0x800) {
            bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
        }
        else if (cp < 0x10000) {
            bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        }
        else {
            bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        }
    }
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i];
        const b1 = bytes[i + 1];
        const b2 = bytes[i + 2];
        out += BASE64_ALPHABET[b0 >> 2];
        out += BASE64_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
        out += b1 === undefined ? '=' : BASE64_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
        out += b2 === undefined ? '=' : BASE64_ALPHABET[b2 & 0x3f];
    }
    return out;
}
/**
 * Maps the TS-convention {@link CreateWalletRequest} (with a string password
 * field) to the Go JSON shape the facade expects. Go's encoding/json uses
 * struct field names verbatim and represents []byte as base64, so
 * WalletPassword and SeedPassphrase must arrive as base64.
 */
export function toGoCreateWalletReq(req) {
    return {
        WalletPassword: req.password ? base64FromUtf8(req.password) : undefined,
        Mnemonic: req.mnemonic,
        SeedPassphrase: req.seedPassphrase
            ? base64FromUtf8(req.seedPassphrase)
            : undefined,
        // The Go facade struct has no json tags, so field names stay PascalCase on
        // the wire (unlike the camelCase TS mirror in generated.ts). Pass both
        // recovery fields straight through; JSON drops the undefined ones, letting
        // the daemon apply its own defaults.
        RecoverState: req.recoverState,
        RecoveryWindow: req.recoveryWindow,
    };
}
/**
 * Maps the TS-convention {@link UnlockWalletRequest} to the Go JSON shape,
 * base64-encoding the password string for the []byte field.
 */
export function toGoUnlockWalletReq(req) {
    return {
        WalletPassword: req.password ? base64FromUtf8(req.password) : undefined,
    };
}
