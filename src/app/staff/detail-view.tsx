'use client';

/**
 * Generic staff request detail view — Runbook Step 24.
 *
 * Renders whatever fields the record actually has (a plain key/value dump)
 * rather than a bespoke layout per entity — the three record shapes differ
 * enough (a takeaway total vs. an event's décor interest and quote amount)
 * that a shared, honest "here is the record" view is more useful right now
 * than three hand-tuned ones. Transition target states are offered from
 * `config.transitionStates`; the server (`performStaffTransition`) is the
 * actual authority on which one is legal from the record's current state —
 * an illegal pick here just comes back as a clear rejection, not a crash.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { StaffEntityUiConfig } from './entity-config';

interface DetailRecord {
  readonly id: string;
  readonly version: number;
  readonly state: string;
  readonly assignedStaffId: string | null;
  readonly [key: string]: unknown;
}

interface HistoryEvent {
  readonly previousState: string | null;
  readonly newState: string;
  readonly actorType: string;
  readonly actorId: string | null;
  readonly reasonCode: string | null;
  readonly reasonNote: string | null;
  readonly occurredAt: string;
}

interface DetailResponse {
  readonly record: DetailRecord;
  readonly history: readonly HistoryEvent[];
  readonly items?: readonly Record<string, unknown>[];
}

interface DetailViewProps {
  readonly config: StaffEntityUiConfig;
  readonly id: string;
}

async function parseApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? 'Something went wrong.';
  } catch {
    return 'Something went wrong.';
  }
}

export function DetailView({ config, id }: DetailViewProps) {
  const [signedIn, setSignedIn] = useState<boolean | 'loading'>('loading');
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [ownStaffId, setOwnStaffId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [notFoundState, setNotFoundState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [newState, setNewState] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [reasonNote, setReasonNote] = useState('');
  const [quotedAmountPkr, setQuotedAmountPkr] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`${config.apiBase}/${id}`).then(async (response) => {
      if (cancelled) return;
      if (response.status === 401) {
        setSignedIn(false);
        return;
      }
      setSignedIn(true);
      if (response.status === 404) {
        setNotFoundState(true);
        return;
      }
      if (!response.ok) {
        setError(await parseApiError(response));
        return;
      }
      setError(null);
      setDetail((await response.json()) as DetailResponse);
    });
    return () => {
      cancelled = true;
    };
  }, [config.apiBase, id, reloadToken]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/staff/session')
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { csrfToken?: string; staffId?: string } | null) => {
        if (cancelled) return;
        if (body?.csrfToken) setCsrfToken(body.csrfToken);
        if (body?.staffId) setOwnStaffId(body.staffId);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleTransition(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !csrfToken || !newState) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`${config.apiBase}/${id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: detail.record.version,
          newState,
          reasonCode: reasonCode.length > 0 ? reasonCode : undefined,
          reasonNote: reasonNote.length > 0 ? reasonNote : undefined,
          quotedAmountPkr:
            config.hasQuote && newState === 'QUOTED' && quotedAmountPkr.length > 0
              ? Number(quotedAmountPkr)
              : undefined,
          csrfToken,
        }),
      });
      if (!response.ok) {
        setError(await parseApiError(response));
        if (response.status === 409) setReloadToken((token) => token + 1);
        return;
      }
      setNewState('');
      setReasonCode('');
      setReasonNote('');
      setQuotedAmountPkr('');
      setReloadToken((token) => token + 1);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAssign(assignedStaffId: string | null) {
    if (!detail || !csrfToken) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`${config.apiBase}/${id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: detail.record.version,
          assignedStaffId,
          csrfToken,
        }),
      });
      if (!response.ok) {
        setError(await parseApiError(response));
        if (response.status === 409) setReloadToken((token) => token + 1);
        return;
      }
      setAssigneeId('');
      setReloadToken((token) => token + 1);
    } finally {
      setSubmitting(false);
    }
  }

  if (signedIn === 'loading') return <p>Loading…</p>;
  if (!signedIn) {
    return (
      <p>
        Not signed in. <Link href="/staff">Go to sign-in</Link>.
      </p>
    );
  }
  if (notFoundState) return <p>Request not found.</p>;
  if (!detail) return error ? <p role="alert">{error}</p> : <p>Loading…</p>;

  const { record, history, items } = detail;
  const reasonRequired = config.reasonRequiredStates.includes(newState);

  return (
    <div>
      <p>
        <Link href={`/staff/${config.key}`}>Back to {config.label} queue</Link>
      </p>
      <h1>
        {config.label} request {record.id}
      </h1>

      <section aria-labelledby="detail-fields-heading">
        <h2 id="detail-fields-heading">Details</h2>
        <dl>
          {Object.entries(record).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value === null || value === undefined ? '—' : String(value)}</dd>
            </div>
          ))}
        </dl>
      </section>

      {items && items.length > 0 ? (
        <section aria-labelledby="detail-items-heading">
          <h2 id="detail-items-heading">Items</h2>
          <ul>
            {items.map((item, index) => (
              <li key={index}>{JSON.stringify(item)}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="detail-history-heading">
        <h2 id="detail-history-heading">History</h2>
        <ul>
          {history.map((event, index) => (
            <li key={index}>
              {event.occurredAt}: {event.previousState ?? '(created)'} → {event.newState} by{' '}
              {event.actorType} {event.actorId ?? ''}
              {event.reasonCode ? ` — ${event.reasonCode}` : ''}
              {event.reasonNote ? `: ${event.reasonNote}` : ''}
            </li>
          ))}
        </ul>
      </section>

      {error ? (
        <p role="alert" aria-live="assertive">
          {error}
        </p>
      ) : null}

      <section aria-labelledby="detail-transition-heading">
        <h2 id="detail-transition-heading">Change state</h2>
        <form onSubmit={(event) => void handleTransition(event)}>
          <label htmlFor="transition-new-state">New state</label>
          <select
            id="transition-new-state"
            value={newState}
            onChange={(event) => setNewState(event.target.value)}
            required
          >
            <option value="">Choose…</option>
            {config.transitionStates.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          {config.hasQuote && newState === 'QUOTED' ? (
            <div>
              <label htmlFor="transition-quote">Quote amount (PKR)</label>
              <input
                id="transition-quote"
                type="number"
                min={0}
                required
                value={quotedAmountPkr}
                onChange={(event) => setQuotedAmountPkr(event.target.value)}
              />
            </div>
          ) : null}

          <div>
            <label htmlFor="transition-reason-code">
              Reason {reasonRequired ? '(required)' : '(optional)'}
            </label>
            <input
              id="transition-reason-code"
              type="text"
              required={reasonRequired}
              value={reasonCode}
              onChange={(event) => setReasonCode(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="transition-reason-note">Note (optional)</label>
            <textarea
              id="transition-reason-note"
              value={reasonNote}
              onChange={(event) => setReasonNote(event.target.value)}
            />
          </div>

          <button type="submit" disabled={submitting || !newState}>
            Apply
          </button>
        </form>
      </section>

      <section aria-labelledby="detail-assign-heading">
        <h2 id="detail-assign-heading">Assignment</h2>
        <p>Currently assigned to: {record.assignedStaffId ?? 'nobody'}</p>
        <div>
          <label htmlFor="assign-staff-id">Assign to staff ID</label>
          <input
            id="assign-staff-id"
            type="text"
            value={assigneeId}
            onChange={(event) => setAssigneeId(event.target.value)}
          />
          <button
            type="button"
            disabled={submitting || assigneeId.length === 0}
            onClick={() => void handleAssign(assigneeId)}
          >
            Assign
          </button>
          {ownStaffId ? (
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleAssign(ownStaffId)}
            >
              Assign to me
            </button>
          ) : null}
          <button type="button" disabled={submitting} onClick={() => void handleAssign(null)}>
            Unassign
          </button>
        </div>
      </section>
    </div>
  );
}
