/**
 * The classification of a pasted send destination. It decides which input
 * fields a send UI should render and nothing more.
 *
 * It deliberately does not name a settlement rail: an `invoice` may still
 * quote as `lightning`, `in_ark`, `credit`, or `mixed`. Read `rail` from the
 * `prepareSend` result for that.
 */
export type Destination = 
/** The input is blank. Render no conditional fields. */
{
    kind: 'empty';
} | {
    /** The input is a BOLT-11 invoice. */
    kind: 'invoice';
    /** The amount the invoice carries, when it can be read from the HRP. */
    amount: InvoiceAmount;
}
/** The input is not an invoice. Treat it as a payable address. */
 | {
    kind: 'address';
};
/**
 * The amount an invoice carries, when it can be read from the human-readable
 * part.
 */
export type InvoiceAmount = 
/** A whole number of satoshis, read from the invoice. */
{
    status: 'known';
    sat: number;
}
/** The invoice carries no amount at all. The payer must supply one. */
 | {
    status: 'amountless';
}
/**
 * The invoice carries an amount that cannot be shown as a whole number of
 * satoshis: a sub-satoshi figure, or one too large to represent exactly. The
 * invoice is still amount-bearing and the daemon pays it (a sub-satoshi
 * amount is rounded up to the next satoshi), so a UI must not ask the payer
 * for an amount. It simply cannot display one.
 */
 | {
    status: 'unrepresentable';
};
/**
 * Classifies a pasted destination so a send UI can render only the fields that
 * apply to it. Whitespace is trimmed before matching.
 *
 * Reading the amount from the human-readable part means an amountless invoice
 * is detected without decoding the bech32 payload, so the UI can ask for an
 * amount up front rather than discovering the need after a round trip.
 */
export declare function classifyDestination(raw: string): Destination;
//# sourceMappingURL=destination.d.ts.map