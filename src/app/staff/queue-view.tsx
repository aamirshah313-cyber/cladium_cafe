'use client';

/**
 * Generic staff queue view — Runbook Step 24. One component for all three
 * entities, parameterized by `StaffEntityUiConfig` — the record shape
 * differs per entity (a takeaway total vs. a booking party size vs. an
 * event's décor interest), so rows show only the fields every request
 * record shares (id, state, guest name/phone, assignment, created-at)
 * rather than a bespoke column set per entity.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { StaffEntityUiConfig } from './entity-config';

interface QueueRecord {
  readonly id: string;
  readonly state: string;
  readonly guestName: string;
  readonly guestPhone: string;
  readonly assignedStaffId: string | null;
  readonly createdAt: string;
}

interface QueueViewProps {
  readonly config: StaffEntityUiConfig;
}

export function QueueView({ config }: QueueViewProps) {
  const [signedIn, setSignedIn] = useState<boolean | 'loading'>('loading');
  const [records, setRecords] = useState<readonly QueueRecord[] | null>(null);
  const [state, setState] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (state) params.set('state', state);
    if (search) params.set('search', search);

    fetch(`${config.apiBase}?${params.toString()}`).then((response) => {
      if (cancelled) return;
      if (response.status === 401) {
        setSignedIn(false);
        return;
      }
      setSignedIn(true);
      if (!response.ok) {
        setError('Could not load the queue.');
        return;
      }
      setError(null);
      response
        .json()
        .then((body: readonly QueueRecord[]) => {
          if (!cancelled) setRecords(body);
        })
        .catch(() => {
          if (!cancelled) setError('Could not load the queue.');
        });
    });

    return () => {
      cancelled = true;
    };
  }, [config.apiBase, state, search]);

  if (signedIn === 'loading') return <p>Loading…</p>;
  if (!signedIn) {
    return (
      <p>
        Not signed in. <Link href="/staff">Go to sign-in</Link>.
      </p>
    );
  }

  return (
    <div>
      <h1>{config.label} queue</h1>
      <p>
        <Link href="/staff">Back to dashboard</Link>
      </p>

      <div>
        <label htmlFor="queue-state-filter">State</label>
        <select
          id="queue-state-filter"
          value={state}
          onChange={(event) => setState(event.target.value)}
        >
          <option value="">All</option>
          {config.allStates.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <label htmlFor="queue-search">Search (name or phone)</label>
        <input
          id="queue-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {error ? (
        <p role="alert" aria-live="assertive">
          {error}
        </p>
      ) : null}

      {records && records.length === 0 ? <p>No requests match.</p> : null}

      {records && records.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>State</th>
              <th>Guest</th>
              <th>Phone</th>
              <th>Assigned</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td>{record.state}</td>
                <td>{record.guestName}</td>
                <td>{record.guestPhone}</td>
                <td>{record.assignedStaffId ?? '—'}</td>
                <td>{record.createdAt}</td>
                <td>
                  <Link href={`/staff/${config.key}/${record.id}`}>View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
