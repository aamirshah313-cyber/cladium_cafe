/**
 * When a non-durable store is allowed to stand in for a durable one.
 *
 * ## The failure this exists to prevent
 *
 * The established pattern here caught *any* construction failure and fell
 * back to an in-memory store, logging a warning. Its own doc comment was
 * honest about the residual risk: an environment that is supposed to have
 * real credentials but has a broken one keeps "working" against a `Map`,
 * and durability stops without anyone being told. The mitigation was a
 * `warn` log and an alerting stack that does not exist yet.
 *
 * That risk is not acceptable for takeaway. A silent fallback there means a
 * guest submits an order, sees "Request received", and the request lives in
 * one serverless instance's heap until the next deploy. The guest was told
 * something true-looking and false.
 *
 * ## The rule
 *
 * In-memory storage requires an explicit opt-in. It is not the default and
 * it is not what a missing credential silently gets you. Production sets
 * nothing, so production fails loudly.
 *
 * `ALLOW_IN_MEMORY_STORES=true` is set by exactly two things: the Playwright
 * config, which deliberately runs with no Supabase credentials, and a
 * developer working locally without a database. Both are environments where
 * losing state on restart is expected rather than a data-loss incident.
 *
 * Inverting the default is the whole point. A missing variable used to mean
 * "quietly degrade"; it now means "stop". Anyone who genuinely wants the
 * in-memory path has to say so, in writing, in the environment.
 */

const OPT_IN = 'ALLOW_IN_MEMORY_STORES';

/**
 * `env` is the read-only slice this needs rather than a full
 * `NodeJS.ProcessEnv`, which requires `NODE_ENV` and so cannot be built
 * literally by a test that wants to describe one variable's absence.
 */
export function inMemoryStoresAllowed(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env[OPT_IN] === 'true';
}

/**
 * Thrown when durable storage could not be constructed and the environment
 * has not opted in to running without it.
 *
 * Deliberately carries no cause chain into its message — a Supabase client
 * construction failure can quote the value it rejected, and that value is a
 * service-role key.
 */
export class DurableStorageUnavailableError extends Error {
  constructor(what: string) {
    super(
      `${what} requires durable storage, and it could not be constructed. ` +
        `Set ${OPT_IN}=true only in tests or local development without a database.`,
    );
    this.name = 'DurableStorageUnavailableError';
  }
}

/**
 * Resolves durable deps, or fails.
 *
 * `buildDurable` is expected to throw when its client cannot be constructed;
 * that throw is the signal. The fallback is only ever reached in an
 * environment that has explicitly asked for it.
 */
export function resolveDurableDeps<T>(
  what: string,
  buildDurable: () => T,
  buildInMemory: () => T,
  onFallback?: (error: unknown) => void,
): T {
  try {
    return buildDurable();
  } catch (error) {
    if (!inMemoryStoresAllowed()) {
      throw new DurableStorageUnavailableError(what);
    }
    onFallback?.(error);
    return buildInMemory();
  }
}
