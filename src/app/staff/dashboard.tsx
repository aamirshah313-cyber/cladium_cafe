'use client';

/**
 * Staff dashboard / sign-in — Runbook Step 24, notifications added Step 25,
 * real Supabase sign-in added Step 45 (D-049).
 *
 * Two sign-in forms, never both mounted at once (so a Playwright
 * `getByLabel('Password')` lookup — `tests/e2e/staff-roles.spec.ts` — never
 * becomes ambiguous): the development-only credential form
 * (`modules/staff/dev-credentials.ts`, unchanged since Step 24, still the
 * default) and the real Supabase-backed form (`modules/staff/
 * supabase-credentials.ts`), reachable via a plain toggle link. The real
 * form has three phases — password, a 6-digit MFA code, or (only the very
 * first time an OWNER/MANAGER account signs in with no factor enrolled
 * yet) a QR-code enrollment step — driven entirely by what
 * `POST /api/staff/session`'s real-auth branch responds with, never
 * guessed client-side.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { STAFF_ENTITY_CONFIG, STAFF_ENTITY_KEYS } from './entity-config';

interface StaffSession {
  readonly staffId: string;
  readonly displayName: string;
  readonly roles: readonly string[];
}

interface StaffNotification {
  readonly id: string;
  readonly eventType: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly deliveredAt: string;
}

async function fetchSession(): Promise<StaffSession | null> {
  const response = await fetch('/api/staff/session');
  if (!response.ok) return null;
  return (await response.json()) as StaffSession;
}

function DevStaffSignInForm({ onSignedIn }: { onSignedIn: () => void }) {
  const [staffId, setStaffId] = useState('');
  const [devPassword, setDevPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
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
      onSignedIn();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
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
  );
}

type RealSignInPhase =
  | { readonly step: 'password' }
  | { readonly step: 'mfa' }
  | { readonly step: 'enroll'; readonly qrCodeDataUri: string; readonly secret: string };

function RealStaffSignInForm({ onSignedIn }: { onSignedIn: () => void }) {
  const [phase, setPhase] = useState<RealSignInPhase>({ step: 'password' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/staff/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'password', email, password }),
      });
      if (!response.ok) {
        setError('Invalid email or password.');
        return;
      }
      const body = (await response.json()) as {
        mfaRequired?: boolean;
        mfaEnrollmentRequired?: boolean;
      };
      if (body.mfaRequired) {
        setPhase({ step: 'mfa' });
        return;
      }
      if (body.mfaEnrollmentRequired) {
        const started = await fetch('/api/staff/mfa/enroll', { method: 'POST' });
        if (!started.ok) {
          setError('Could not start MFA enrollment. Please try again.');
          return;
        }
        const enrollment = (await started.json()) as {
          qrCodeDataUri: string;
          secret: string;
        };
        setPhase({
          step: 'enroll',
          qrCodeDataUri: enrollment.qrCodeDataUri,
          secret: enrollment.secret,
        });
        return;
      }
      onSignedIn();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMfaSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/staff/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'mfa', code }),
      });
      if (!response.ok) {
        setError('Incorrect code. Please try again.');
        return;
      }
      onSignedIn();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEnrollVerifySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/staff/mfa/enroll/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!response.ok) {
        setError('Incorrect code. Please try again.');
        return;
      }
      onSignedIn();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (phase.step === 'enroll') {
    return (
      <div>
        <h2>Set up two-factor authentication</h2>
        <p>
          Owner and manager accounts require an authenticator app (e.g. Google Authenticator,
          1Password, Authy). Scan this QR code, or enter the secret manually, then confirm with a
          6-digit code.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element -- a Supabase-issued data: URI, not a Next.js Image-eligible remote asset */}
        <img
          src={phase.qrCodeDataUri}
          alt="Scan with your authenticator app"
          width={200}
          height={200}
        />
        <p>
          Or enter this secret manually: <code>{phase.secret}</code>
        </p>
        <form onSubmit={(event) => void handleEnrollVerifySubmit(event)}>
          <div>
            <label htmlFor="staff-enroll-code">6-digit code</label>
            <input
              id="staff-enroll-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </div>
          {error ? (
            <p role="alert" aria-live="assertive">
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={submitting}>
            Confirm and sign in
          </button>
        </form>
      </div>
    );
  }

  if (phase.step === 'mfa') {
    return (
      <form onSubmit={(event) => void handleMfaSubmit(event)}>
        <p>Enter the 6-digit code from your authenticator app.</p>
        <div>
          <label htmlFor="staff-mfa-code">6-digit code</label>
          <input
            id="staff-mfa-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </div>
        {error ? (
          <p role="alert" aria-live="assertive">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={submitting}>
          Verify
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={(event) => void handlePasswordSubmit(event)}>
      <div>
        <label htmlFor="staff-email">Email</label>
        <input
          id="staff-email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor="staff-real-password">Password</label>
        <input
          id="staff-real-password"
          type="password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
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
  );
}

export function StaffDashboard() {
  const [session, setSession] = useState<StaffSession | null | 'loading'>('loading');
  const [useRealSignIn, setUseRealSignIn] = useState(false);
  const [notifications, setNotifications] = useState<readonly StaffNotification[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSession().then((result) => {
      if (!cancelled) setSession(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session || session === 'loading') return;
    let cancelled = false;
    fetch('/api/staff/notifications')
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { notifications?: readonly StaffNotification[] } | null) => {
        if (!cancelled && body?.notifications) setNotifications(body.notifications);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  async function handleSignedIn() {
    setSession(await fetchSession());
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
        {useRealSignIn ? (
          <>
            <RealStaffSignInForm onSignedIn={() => void handleSignedIn()} />
            <p>
              <button type="button" onClick={() => setUseRealSignIn(false)}>
                Use a development sign-in instead
              </button>
            </p>
          </>
        ) : (
          <>
            <p>Development sign-in only — not the production staff login.</p>
            <DevStaffSignInForm onSignedIn={() => void handleSignedIn()} />
            <p>
              <button type="button" onClick={() => setUseRealSignIn(true)}>
                Sign in with a Supabase account
              </button>
            </p>
          </>
        )}
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

      <section aria-labelledby="staff-notifications-heading">
        <h2 id="staff-notifications-heading">Notifications</h2>
        {!notifications || notifications.length === 0 ? (
          <p>No notifications yet.</p>
        ) : (
          <ul>
            {notifications.map((notification) => (
              <li key={notification.id}>
                {notification.deliveredAt}: {notification.eventType} ({notification.entityType}{' '}
                {notification.entityId})
              </li>
            ))}
          </ul>
        )}
      </section>

      <button type="button" onClick={() => void handleSignOut()}>
        Sign out
      </button>
    </div>
  );
}
