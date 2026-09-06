/**
 * Matches a BOLT-11 human-readable part and captures its optional amount.
 *
 * The network alternation is listed longest-first for legibility, not because
 * it changes the match: JS regex alternation backtracks, so `bc|bcrt` and
 * `bcrt|bc` parse every input identically. What actually makes the parse
 * unambiguous is bech32's data charset, which excludes the digit `1`, so the
 * last `1` in the string before the data part is always the separator and an
 * amount can never contain one. Group 1 is the amount digits and group 2 its
 * multiplier; both are absent for an amountless invoice.
 */
const BOLT11_HRP = /^ln(?:bcrt|tbs|bc|tb)(?:(\d+)([munp])?)?1/i;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
/** The number of decimal places in one satoshi, as an exponent of one bitcoin. */
const SATS_EXPONENT = 8;
/**
 * The BOLT-11 amount multipliers, as the negative power of ten each applies to
 * one bitcoin. An absent multiplier means the digits are already bitcoin. The
 * key type is pinned to the multiplier group of {@link BOLT11_HRP} so a future
 * drift between the two cannot reach `10n ** BigInt(NaN)`, which throws a
 * RangeError during render.
 */
const TEN_EXPONENT = {
    m: 3,
    u: 6,
    n: 9,
    p: 12,
};
/**
 * Converts a BOLT-11 HRP amount to sats, or returns null when the amount is not
 * a whole number of sats (a nano- or pico-bitcoin figure can be sub-satoshi) or
 * is too large to represent exactly.
 *
 * The arithmetic is exact. Every multiplier is a power of ten, so the conversion
 * is a decimal shift and BigInt performs it without rounding. Doing this in
 * floating point silently loses ordinary amounts: 1000n is exactly 100 sats, but
 * `1000 * 1e-9 * 1e8` evaluates to 100.00000000000001.
 */
function satsFromHrp(digits, multiplier) {
    const exponent = SATS_EXPONENT -
        (multiplier
            ? TEN_EXPONENT[multiplier.toLowerCase()]
            : 0);
    const value = BigInt(digits);
    // A non-negative exponent scales up exactly. A negative one yields a whole
    // number of sats only when its divisor divides the digits evenly; anything
    // left over is a sub-satoshi amount the wallet cannot send.
    let sats;
    if (exponent >= 0) {
        sats = value * 10n ** BigInt(exponent);
    }
    else {
        const divisor = 10n ** BigInt(-exponent);
        if (value % divisor !== 0n) {
            return null;
        }
        sats = value / divisor;
    }
    if (sats <= 0n || sats > MAX_SAFE) {
        return null;
    }
    return Number(sats);
}
/**
 * Classifies a pasted destination so a send UI can render only the fields that
 * apply to it. Whitespace is trimmed before matching.
 *
 * Reading the amount from the human-readable part means an amountless invoice
 * is detected without decoding the bech32 payload, so the UI can ask for an
 * amount up front rather than discovering the need after a round trip.
 */
export function classifyDestination(raw) {
    const trimmed = raw.trim();
    if (trimmed === '') {
        return { kind: 'empty' };
    }
    const match = BOLT11_HRP.exec(trimmed);
    if (!match) {
        return { kind: 'address' };
    }
    const [, digits, multiplier] = match;
    if (digits === undefined) {
        return { kind: 'invoice', amount: { status: 'amountless' } };
    }
    const sat = satsFromHrp(digits, multiplier);
    return {
        kind: 'invoice',
        amount: sat === null ? { status: 'unrepresentable' } : { status: 'known', sat },
    };
}
