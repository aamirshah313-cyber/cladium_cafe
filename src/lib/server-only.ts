/**
 * Runtime guard for server-only modules.
 *
 * Implemented locally rather than via the `server-only` package so the
 * boundary is dependency-free and unit-testable: the package fails at build
 * time only, and cannot be asserted on in a test.
 *
 * Build-time bundling rules still matter — this is a backstop that turns a
 * mistaken client import into a loud, immediate failure instead of a silently
 * shipped secret.
 */

export class ServerOnlyViolationError extends Error {
  constructor(moduleName: string) {
    super(
      `${moduleName} is server-only and must never be imported into client code. ` +
        'Move the call behind a server component, route handler, or server action.',
    );
    this.name = 'ServerOnlyViolationError';
  }
}

/** True when running in a browser-like environment. */
export function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Throws if called in a browser. Call at the top of any module that reads
 * server secrets or talks to a privileged service.
 */
export function assertServerOnly(moduleName: string): void {
  if (isBrowser()) {
    throw new ServerOnlyViolationError(moduleName);
  }
}
