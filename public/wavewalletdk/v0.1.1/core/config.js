import { WavelengthError } from "./errors.js";
/**
 * The daemon log verbosity levels accepted by {@link RuntimeConfig.debugLevel},
 * from most to least verbose. Exported for UIs that render a level picker.
 * debugLevel itself stays a plain string because the daemon also accepts a
 * per-subsystem list such as 'ROND=debug,info'.
 */
export const DEBUG_LEVELS = [
    'trace',
    'debug',
    'info',
    'warn',
    'error',
    'critical',
    'off',
];
const lwwalletOnly = [
    'walletEsploraUrl',
    'walletPasswordFile',
    'walletPollIntervalSeconds',
];
const btcwalletOnly = [
    'walletFeeUrl',
    'walletBlockHeadersSource',
    'walletFilterHeadersSource',
];
const numericFields = [
    'walletPollIntervalSeconds',
    'walletRecoveryWindow',
    'maxOperatorFeeSat',
    'signingWorkers',
    'bufferSize',
];
function invalidConfig(message) {
    throw new WavelengthError(message, 'invalid_config');
}
/** Validates host-owned runtime settings before the typed start dispatches. */
export function validateRuntimeConfig(config, transport) {
    const walletType = config.walletType ?? 'lwwallet';
    if (walletType !== 'lwwallet' && walletType !== 'btcwallet') {
        invalidConfig(`unsupported walletType: ${String(walletType)}`);
    }
    if (config.network === 'mainnet' && config.allowMainnet !== true) {
        invalidConfig('mainnet requires allowMainnet: true');
    }
    if (walletType === 'lwwallet') {
        for (const field of btcwalletOnly) {
            if (config[field] !== undefined) {
                invalidConfig(`${field} applies only to walletType btcwallet`);
            }
        }
    }
    else {
        for (const field of lwwalletOnly) {
            if (config[field] !== undefined) {
                invalidConfig(`${field} applies only to walletType lwwallet`);
            }
        }
    }
    for (const field of numericFields) {
        const value = config[field];
        if (value !== undefined &&
            (!Number.isSafeInteger(value) || value < 0)) {
            invalidConfig(`${field} must be a nonnegative safe integer`);
        }
    }
    if (config.walletRecoveryWindow !== undefined &&
        config.walletRecoveryWindow > 0xffff_ffff) {
        invalidConfig('walletRecoveryWindow must fit in uint32');
    }
    if (transport === 'rest' && config.arkServerTlsCertPath !== undefined) {
        invalidConfig('arkServerTlsCertPath is unavailable on the web transport');
    }
    if (transport === 'rest' &&
        !config.disableSwaps &&
        config.swapServerTlsCertPath !== undefined) {
        invalidConfig('swapServerTlsCertPath is unavailable on the web transport');
    }
}
// The hosted public deployments per network, mirroring the daemon's own
// per-network defaults. Record over PresetNetwork so that adding a preset
// network without its endpoints here is a compile error.
const NETWORK_ENDPOINTS = {
    signet: {
        ark: {
            rest: 'https://signet.wavelength-rest.lightning.finance',
            grpc: 'signet.wavelength.lightning.finance:443',
        },
        swap: {
            rest: 'https://signet.swapd-rest.lightning.finance',
            grpc: 'swap.signet.wavelength.lightning.finance:443',
        },
        esplora: 'https://mempool-signet.testnet.lightningcluster.com/api',
    },
    testnet: {
        ark: {
            rest: 'https://test.wavelength-rest.lightning.finance',
            grpc: 'test.wavelength.lightning.finance:443',
        },
        swap: {
            rest: 'https://test.swapd-rest.lightning.finance',
            grpc: 'swap.test.wavelength.lightning.finance:443',
        },
        esplora: 'https://mempool-testnet3.testnet.lightningcluster.com/api',
    },
    testnet4: {
        ark: {
            rest: 'https://test4.wavelength-rest.lightning.finance',
            // testnet4's public gRPC NLB is still disabled, so the daemon keeps
            // dialing the raw cluster hostname; a friendly-domain CNAME follows
            // once its certificate work lands.
            grpc: 'lumosd-testnet4.testnet.lightningcluster.com:443',
        },
        swap: {
            rest: 'https://test4.swapd-rest.lightning.finance',
            grpc: 'swapd-testnet4.testnet.lightningcluster.com:443',
        },
        esplora: 'https://mempool-testnet4.testnet.lightningcluster.com/api',
    },
};
/**
 * Returns the canonical public endpoint preset for a network in one
 * transport's flavor: REST gateway URLs for 'rest' (the web transport),
 * host:port gRPC addresses for 'grpc' (native transports). This is the
 * building block the transport packages' defaultConfig helpers compose over;
 * app code normally calls those instead.
 *
 * Only the preset networks are accepted (see {@link PresetNetwork}); mainnet
 * and regtest have no preset and their {@link RuntimeConfig} is built by hand.
 *
 * @param network - The Bitcoin network to look up.
 * @param transport - The endpoint flavor the caller's transport dials.
 * @returns The preset config fields for that network and transport.
 */
export function networkDefaults(network, transport) {
    const endpoints = NETWORK_ENDPOINTS[network];
    return {
        arkServerAddress: endpoints.ark[transport],
        walletEsploraUrl: endpoints.esplora,
        swapServerAddress: endpoints.swap[transport],
    };
}
