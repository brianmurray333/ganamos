// Compile-time contract tests for WalletEngineOptions. This module has no
// meaningful runtime behavior: it exists so `pnpm typecheck` enforces that
// autoStart: true requires config, and that the other valid combinations
// still compile. It is a plain .ts file under src/, so it is picked up by
// tsconfig's "src" include (only src/**/*.test.ts and src/testing are
// excluded) and typechecked on every run.
// autoStart: true without config is rejected.
// @ts-expect-error autoStart: true requires config.
const missingConfig = { client, autoStart: true };
// Valid combinations all compile.
const withAutoStart = { client, config, autoStart: true };
const configOnly = { client, config };
const neither = { client };
const autoStartFalseAlone = { client, autoStart: false };
void missingConfig;
void withAutoStart;
void configOnly;
void neither;
void autoStartFalseAlone;
export {};
