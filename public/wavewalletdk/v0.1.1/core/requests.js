// Request types stay hand-authored: they carry semantics the wire shape does not
// (e.g. a plain password the client base64-encodes into the Go []byte field), so
// core's facade module keeps explicit request mappers for them.
/** Exact acknowledgement required to start a unilateral unroll. */
export const FORCE_UNROLL_ACK = 'I_KNOW_WHAT_I_AM_DOING';
