/** The snapshot every engine starts from. */
export const INITIAL_SNAPSHOT = Object.freeze({
    phase: 'loading',
    error: null,
    info: null,
    balance: null,
    activity: [],
    recovery: { status: 'idle' },
    logs: [],
});
