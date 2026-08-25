import { WavelengthError } from "./errors.js";
export function validateActivityStreamOptions(opts) {
    if (opts.cursor !== undefined &&
        (!Number.isSafeInteger(opts.cursor) || opts.cursor < 0)) {
        throw new WavelengthError('activity cursor must be a nonnegative safe integer', 'invalid_cursor');
    }
}
