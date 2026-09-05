'use client';

/**
 * Staff menu review/approve/publish page.
 *
 * Turns Gate 0/Gate 2's manual owner sign-off requirement
 * (`release-gates-v2.md`) into something OWNER/MANAGER staff can actually
 * do, executing the plans `modules/menu/{import-plan,publish-plan,
 * diff-report}.ts` have computed since Step 11 with no database connection
 * of their own — see `modules/menu/admin-service.ts`.
 *
 * Approve and Publish each require a second, explicit confirm click (never
 * fire on the first click) — the same discipline this project already
 * requires before saving a guest order or calling a booking/event
 * confirmed, applied here because publishing changes what a guest actually
 * sees: `getPublishedMenuView()` (Step 19, `modules/menu/menu-view.ts`) now
 * reads the real, currently-published version via RLS, so Publish is a
 * genuinely guest-visible action, not the inert one it was when that
 * function was a hardcoded stub.
 */

import { useEffect, useState } from 'react';
import { FeatureMediaStage } from '../../[locale]/menu/feature-media-stage';
import type { MenuCategoryMedia } from '../../../modules/menu/media-mapping';

interface MenuVersionSummary {
  readonly versionNumber: number;
  readonly version: number;
  readonly sourceChecksum: string;
  readonly importedAt: string;
  readonly reviewStatus: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';
  readonly approvedBy: string | null;
  readonly approvedAt: string | null;
  readonly publishedAt: string | null;
}

interface DiffEntry {
  readonly stableId: string;
  readonly kind: 'ADDED' | 'REMOVED' | 'CHANGED' | 'UNCHANGED';
  readonly changedFields: readonly string[];
  readonly priceChangePkr?: number | null;
}

interface MenuVersionDetail {
  readonly version: MenuVersionSummary;
  readonly categories: readonly { stableId: string; name: string; sortOrder: number }[];
  readonly items: readonly {
    stableId: string;
    categoryStableId: string;
    name: string;
    basePricePkr: number | null;
  }[];
  readonly variants: readonly {
    stableId: string;
    itemStableId: string;
    label: string;
    pricePkr: number;
  }[];
  readonly diff: {
    readonly categories: readonly DiffEntry[];
    readonly items: readonly DiffEntry[];
    readonly variants: readonly DiffEntry[];
    readonly summary: {
      readonly categoriesAdded: number;
      readonly categoriesRemoved: number;
      readonly categoriesChanged: number;
      readonly itemsAdded: number;
      readonly itemsRemoved: number;
      readonly itemsChanged: number;
      readonly variantsAdded: number;
      readonly variantsRemoved: number;
      readonly variantsChanged: number;
    };
  };
  readonly photosByCategory: Readonly<Record<string, MenuCategoryMedia | null>>;
}

async function parseApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? 'Something went wrong.';
  } catch {
    return 'Something went wrong.';
  }
}

function formatPkr(amountPkr: number): string {
  return `PKR ${amountPkr.toLocaleString('en-PK')}`;
}

export function MenuReviewView() {
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [roles, setRoles] = useState<readonly string[]>([]);
  const [versions, setVersions] = useState<readonly MenuVersionSummary[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<MenuVersionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState<'approve' | 'publish' | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const canManage = roles.includes('OWNER') || roles.includes('MANAGER');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/staff/session')
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { csrfToken?: string; roles?: readonly string[] } | null) => {
        if (cancelled) return;
        if (body?.csrfToken) setCsrfToken(body.csrfToken);
        if (body?.roles) setRoles(body.roles);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/staff/menu')
      .then(async (response) => {
        if (!response.ok) {
          if (!cancelled) setError(await parseApiError(response));
          return;
        }
        const body = (await response.json()) as MenuVersionSummary[];
        if (!cancelled) setVersions(body);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load menu versions.');
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  useEffect(() => {
    // Nothing in this view ever sets `selected` back to null once a version
    // has been picked, so there is no real "deselect" transition to handle
    // here — `detail` simply starts at its own initial `null` and this
    // effect only needs to skip fetching, never to set state itself.
    if (selected === null) return;
    let cancelled = false;
    fetch(`/api/staff/menu/${selected}`)
      .then(async (response) => {
        if (!response.ok) {
          if (!cancelled) setError(await parseApiError(response));
          return;
        }
        const body = (await response.json()) as MenuVersionDetail;
        if (!cancelled) setDetail(body);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load version detail.');
      });
    return () => {
      cancelled = true;
    };
  }, [selected, reloadToken]);

  async function handleImport() {
    if (!csrfToken) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/staff/menu/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csrfToken }),
      });
      if (!response.ok) {
        setError(await parseApiError(response));
        return;
      }
      const body = (await response.json()) as { versionNumber: number; alreadyImported: boolean };
      setSelected(body.versionNumber);
      setReloadToken((t) => t + 1);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove() {
    if (!csrfToken || !detail) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/staff/menu/${detail.version.versionNumber}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedVersion: detail.version.version, csrfToken }),
      });
      if (!response.ok) {
        setError(await parseApiError(response));
        return;
      }
      setConfirming(null);
      setReloadToken((t) => t + 1);
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePublish() {
    if (!csrfToken || !detail) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/staff/menu/${detail.version.versionNumber}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csrfToken }),
      });
      if (!response.ok) {
        setError(await parseApiError(response));
        return;
      }
      setConfirming(null);
      setReloadToken((t) => t + 1);
    } finally {
      setSubmitting(false);
    }
  }

  if (!canManage) {
    return (
      <div>
        <h1>Menu review</h1>
        <p>Only Owner/Manager staff can review and publish the menu.</p>
      </div>
    );
  }

  return (
    <div>
      <h1>Menu review</h1>
      {error ? (
        <p role="alert" style={{ color: 'crimson' }}>
          {error}
        </p>
      ) : null}

      <section aria-labelledby="menu-versions-heading">
        <h2 id="menu-versions-heading">Versions</h2>
        <button type="button" onClick={handleImport} disabled={submitting || !csrfToken}>
          Import latest menu.json
        </button>
        {versions === null ? (
          <p>Loading…</p>
        ) : versions.length === 0 ? (
          <p>No menu version has been imported yet.</p>
        ) : (
          <ul>
            {versions.map((v) => (
              <li key={v.versionNumber}>
                <button type="button" onClick={() => setSelected(v.versionNumber)}>
                  Version {v.versionNumber} — {v.reviewStatus}
                  {v.publishedAt ? ' — PUBLISHED (live in the database)' : ''}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail ? (
        <section aria-labelledby="menu-detail-heading">
          <h2 id="menu-detail-heading">
            Version {detail.version.versionNumber} — {detail.version.reviewStatus}
          </h2>
          <p>
            Diff vs. currently published: {detail.diff.summary.categoriesAdded} categories added,{' '}
            {detail.diff.summary.itemsAdded} items added, {detail.diff.summary.itemsChanged} items
            changed.
          </p>

          <h3>Categories</h3>
          <ul>
            {detail.categories.map((category) => (
              <li key={category.stableId}>
                <div style={{ width: 160 }}>
                  <FeatureMediaStage
                    categoryName={category.name}
                    media={detail.photosByCategory[category.stableId] ?? null}
                  />
                </div>
                <strong>{category.name}</strong>
                <ul>
                  {detail.items
                    .filter((item) => item.categoryStableId === category.stableId)
                    .map((item) => (
                      <li key={item.stableId}>
                        {item.name}
                        {item.basePricePkr !== null ? ` — ${formatPkr(item.basePricePkr)}` : ''}
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ul>

          <div>
            {detail.version.reviewStatus === 'DRAFT' ? (
              confirming === 'approve' ? (
                <>
                  <p>
                    Approve version {detail.version.versionNumber}? This records who approved it.
                  </p>
                  <button type="button" onClick={handleApprove} disabled={submitting}>
                    Confirm approve
                  </button>
                  <button type="button" onClick={() => setConfirming(null)} disabled={submitting}>
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming('approve')}
                  disabled={submitting}
                >
                  Approve
                </button>
              )
            ) : null}

            {detail.version.reviewStatus === 'APPROVED' && !detail.version.publishedAt ? (
              confirming === 'publish' ? (
                <>
                  <p>
                    Publish version {detail.version.versionNumber}? This sets it live in the
                    database, replacing whatever was previously published there.
                  </p>
                  <button type="button" onClick={handlePublish} disabled={submitting}>
                    Confirm publish
                  </button>
                  <button type="button" onClick={() => setConfirming(null)} disabled={submitting}>
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming('publish')}
                  disabled={submitting}
                >
                  Publish
                </button>
              )
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
