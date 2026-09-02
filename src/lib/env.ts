/**
 * Client-safe environment.
 *
 * This module is importable from client components, so it must contain
 * ONLY `NEXT_PUBLIC_*` values. Server variables — including their *names* —
 * live in `env.server.ts`, which refuses to load in a browser. Keeping the
 * two apart means a client import cannot pull server schema symbols into the
 * browser bundle even by accident.
 *
 * Never add a non-public variable here.
 */

import { z } from 'zod';

/**
 * Inlined by Next.js at build time. Publishable values only: the Supabase
 * anon key is safe to ship because RLS remains mandatory server-side.
 *
 * Not a strict object — `process.env` legitimately carries many unrelated
 * keys. Zod strips whatever is not declared, which is exactly the property
 * that keeps server values out of the parsed result.
 */
export const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;

type EnvSource = Record<string, string | undefined>;

/**
 * Real, previously-unexercised bug found live (D-059 follow-up,
 * `staff/reset-password/page.tsx` — the first-ever client-side caller of
 * any accessor in this file): Next.js only inlines a `NEXT_PUBLIC_*` value
 * into the browser bundle when it sees a *literal*, statically-written
 * `process.env.NEXT_PUBLIC_X` member expression in the source. Passing the
 * whole `process.env` object by reference as a default parameter — the
 * previous shape of every accessor below — is invisible to that build-time
 * replacement: Zod then reads keys off it dynamically, which works fine
 * server-side (real `process.env` at runtime there) but leaves every
 * `NEXT_PUBLIC_*` key undefined in the browser forever, regardless of what
 * is actually configured, because no literal text anywhere ever gave the
 * compiler something to replace. Confirmed live: fetched the deployed
 * client chunk directly and found zero occurrences of the Supabase URL or
 * either variable name — the build-time substitution never had anything to
 * substitute. Each accessor's default below is now a literal object built
 * from direct `process.env.NEXT_PUBLIC_X` expressions so the compiler can
 * actually find and replace them; this still evaluates fresh per call
 * (a JS default parameter, not a module-load-time constant), so server-side
 * behavior (reading the real runtime environment) is unchanged.
 */
function defaultClientEnvSource(): EnvSource {
  return {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

/**
 * Parses and validates the client-safe environment. Never runs automatically
 * on import, so a missing value fails at the call site rather than silently
 * during module load or the production build.
 */
export function parseClientEnv(source: EnvSource = defaultClientEnvSource()): ClientEnv {
  return clientEnvSchema.parse(source);
}

const appUrlSchema = clientEnvSchema.pick({ NEXT_PUBLIC_APP_URL: true });

/**
 * Narrow accessor for just `NEXT_PUBLIC_APP_URL`, for callers (origin/CSRF
 * checks — `lib/http/session-route.ts`) that need the app's own origin but
 * must not require unrelated config (Supabase URL/anon key) to be set first.
 */
export function parseAppUrl(source: EnvSource = defaultClientEnvSource()): string {
  return appUrlSchema.parse(source).NEXT_PUBLIC_APP_URL;
}

const supabasePublicCredentialsSchema = clientEnvSchema.pick({
  NEXT_PUBLIC_SUPABASE_URL: true,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: true,
});

export type SupabasePublicCredentials = z.infer<typeof supabasePublicCredentialsSchema>;

/**
 * Narrow accessor for just the Supabase URL/anon key —
 * `modules/integrations/supabase-auth-client.ts` needs these (never the
 * service-role key, which stays server-only, `env.server.ts`) without
 * requiring `NEXT_PUBLIC_APP_URL` to be set first. The anon key is safe to
 * read from either client or server code (it is shipped to the browser
 * either way); this accessor lives here, not `env.server.ts`, for that
 * reason.
 */
export function parseSupabasePublicCredentials(
  source: EnvSource = defaultClientEnvSource(),
): SupabasePublicCredentials {
  return supabasePublicCredentialsSchema.parse(source);
}

/** `undefined` (never throws) when either value is missing — used only to *detect* whether real Supabase auth is configured, not to read it for use. */
export function isSupabasePublicCredentialsConfigured(
  source: EnvSource = defaultClientEnvSource(),
): boolean {
  return supabasePublicCredentialsSchema.safeParse(source).success;
}
