import { camelizeKeys } from "./casing.js";
import { normalizeInfo } from "./state.js";
function object(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : undefined;
}
function nilPointer(value) {
    return value === null ? undefined : value;
}
function nilSlice(value) {
    return value === null ? [] : value;
}
function mapEntries(value) {
    const entries = nilSlice(value);
    return Array.isArray(entries) ? entries.map(normalizeEntry) : entries;
}
function normalizeOptionalObject(value, transform) {
    if (value === null)
        return undefined;
    const record = object(value);
    return record ? transform(record) : value;
}
export function normalizeEntry(raw) {
    const camel = camelizeKeys(raw);
    const entry = object(camel);
    if (!entry)
        return camel;
    return {
        ...entry,
        progress: nilPointer(entry.progress),
        request: nilPointer(entry.request),
    };
}
export function normalizeFacadeResult(method, raw) {
    const camel = camelizeKeys(raw);
    if (method === 'getInfo')
        return normalizeInfo(camel);
    const result = object(camel);
    if (!result)
        return camel;
    switch (method) {
        case 'createWallet':
        case 'openWalletFromPasskey':
            return { ...result, mnemonic: nilSlice(result.mnemonic) };
        case 'prepareSend':
            return {
                ...result,
                selectedOutpoints: nilSlice(result.selectedOutpoints),
                creditPreview: nilPointer(result.creditPreview),
            };
        case 'list': {
            const normalized = { ...result };
            if (Object.hasOwn(result, 'activity')) {
                normalized.activity = normalizeOptionalObject(result.activity, (activity) => ({
                    ...activity,
                    entries: mapEntries(activity.entries),
                }));
            }
            if (Object.hasOwn(result, 'vtxos')) {
                normalized.vtxos = normalizeOptionalObject(result.vtxos, (inventory) => ({
                    ...inventory,
                    vtxos: nilSlice(inventory.vtxos),
                }));
            }
            if (Object.hasOwn(result, 'onchain')) {
                normalized.onchain = normalizeOptionalObject(result.onchain, (history) => ({
                    ...history,
                    txs: nilSlice(history.txs),
                }));
            }
            return normalized;
        }
        case 'exit':
            return { ...result, queuedOutpoints: nilSlice(result.queuedOutpoints) };
        case 'exitStatus':
            return {
                ...result,
                progress: nilPointer(result.progress),
                cSV: nilPointer(result.cSV),
                fees: nilPointer(result.fees),
            };
        case 'exitSummary':
            return { ...result, exits: nilSlice(result.exits) };
        case 'getExitPlan':
            return { ...result, plans: nilSlice(result.plans) };
        case 'sweepWallet':
            return { ...result, inputs: nilSlice(result.inputs) };
        case 'deposit':
        case 'receive':
        case 'sendPrepared':
            return {
                ...result,
                entry: result.entry === undefined
                    ? undefined
                    : normalizeEntry(result.entry),
            };
        default:
            return result;
    }
}
