'use client';

/**
 * Staff dashboard / sign-in — Runbook Step 24.
 *
 * The sign-in form posts a development-only credential pair
 * (`modules/staff/dev-credentials.ts` — never production auth; disabled by
 * default because `STAFF_DEV_ACCOUNTS` is unset). Once signed in, the three
 * queue links are the entry points into `[entity]/page.tsx`.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { STAFF_ENTITY_CONFIG, STAFF_ENTITY_KEYS } from './entity-config';

interface StaffSession {
  readonly staffId: string;
  readonly displayName: string;
  readonly roles: readonly string[];
}

async function fetchSession(): Promise<StaffSession | null> {
  const response = await fetch('/api/staff/session');
  if (!response.ok) return null;
  return (await response.json()) as StaffSession;
}

export function StaffDashboard() {
  const [session, setSession] = useState<StaffSession | null | 'loading'>('loading');
  const [staffId, setStaffId] = useState('');
  const [devPassword, setDevPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchSession().then((result) => {
      if (!cancelled) setSession(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/staff/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId, devPassword }),
      });
      if (!response.ok) {
        setError('Invalid staff ID or password.');
        return;
      }
      setSession(await fetchSession());
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignOut() {
    await fetch('/api/staff/session', { method: 'DELETE' });
    setSession(null);
  }

  if (session === 'loading') return <p>Loading…</p>;

  if (!session) {
    return (
      <div>
        <h1>Staff sign-in</h1>
        <p>Development sign-in only — not the production staff login.</p>
        <form onSubmit={(event) => void handleSignIn(event)}>
          <div>
            <label htmlFor="staff-id">Staff ID</label>
            <input
              id="staff-id"
              type="text"
              required
              value={staffId}
              onChange={(event) => setStaffId(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="staff-dev-password">Password</label>
            <input
              id="staff-dev-password"
              type="password"
              required
              value={devPassword}
              onChange={(event) => setDevPassword(event.target.value)}
            />
          </div>
          {error ? (
            <p role="alert" aria-live="assertive">
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={submitting}>
            Sign in
          </button>
        </form>
      </div>
    );
  }

  return (
    <div>
      <h1>Cladium staff workspace</h1>
      <p>
        Signed in as {session.displayName} ({session.roles.join(', ')})
      </p>
      <nav aria-label="Queues">
        <ul>
          {STAFF_ENTITY_KEYS.map((key) => (
            <li key={key}>
              <Link href={`/staff/${key}`}>{STAFF_ENTITY_CONFIG[key].label}</Link>
            </li>
          ))}
        </ul>
      </nav>
      <button type="button" onClick={() => void handleSignOut()}>
        Sign out
      </button>
    </div>
  );
}
