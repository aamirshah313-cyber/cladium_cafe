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
 * Parses and validates the client-safe environment. Never runs automatically
 * on import, so a missing value fails at the call site rather than silently
 * during module load or the production build.
 */
export function parseClientEnv(source: EnvSource = process.env): ClientEnv {
  return clientEnvSchema.parse(source);
}

const appUrlSchema = clientEnvSchema.pick({ NEXT_PUBLIC_APP_URL: true });

/**
 * Narrow accessor for just `NEXT_PUBLIC_APP_URL`, for callers (origin/CSRF
 * checks — `lib/http/session-route.ts`) that need the app's own origin but
 * must not require unrelated config (Supabase URL/anon key) to be set first.
 */
export function parseAppUrl(source: EnvSource = process.env): string {
  return appUrlSchema.parse(source).NEXT_PUBLIC_APP_URL;
}
