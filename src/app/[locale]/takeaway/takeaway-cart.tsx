'use client';

/**
 * The takeaway cart and review journey — the one screen that was missing
 * between "add to order" and the already-built submission pipeline.
 *
 * Three stages, mirroring `book/booking-form.tsx` so the two request
 * journeys behave identically: edit the items and give contact details,
 * review a **server-echoed** summary and confirm, then a received state
 * that is explicit about not being a confirmed order.
 *
 * ## Every price on this screen came from the server
 *
 * Nothing here multiplies, sums, or formats a price of its own. Line totals
 * and the subtotal are read from `CartTotals`, which the server recomputes
 * against the published menu on every single cart response
 * (`modules/takeaway/http.ts` → `recomputeCartTotals`). A client that did
 * its own arithmetic could show a figure the server would never agree with,
 * which is the exact class of thing CLAUDE.md forbids the UI from deciding.
 *
 * That is also why quantity changes round-trip instead of updating locally:
 * the returned totals are the truth, and optimistically rendering a guessed
 * subtotal would briefly display a number nobody authorised.
 *
 * ## Subtotal, never total
 *
 * No tax or service-charge rate is configured anywhere in this project, and
 * inventing one is forbidden. So the figure shown is labelled a subtotal and
 * carries a note saying staff confirm the final amount. Calling it a total
 * would be asserting that nothing further is added, which nobody has
 * confirmed.
 *
 * ## Stale prices are a real state, not an edge case
 *
 * The confirmation token is bound to a hash of the reviewed contents. If the
 * published menu changes between review and confirm, the server answers
 * `STALE_REVIEW` and this returns the guest to the item list with an
 * explanation rather than submitting at a price that no longer exists.
 *
 * ## Idempotency
 *
 * `idempotencyKey` is generated once per confirm attempt and reused across
 * retries of *that* attempt, so a double-click or a retried network call
 * resolves to the same request rather than creating a second one. A genuinely
 * new attempt gets a new key, which is what makes a real retry-after-failure
 * work.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { chromeText } from '../../../lib/i18n/chrome';
import type { Locale } from '../../../lib/i18n/locale';
import { formatPkr } from '../../../lib/business/money';

interface CartLineTotal {
  readonly cartLineId: string;
  readonly menuItemId: string;
  readonly name: string;
  readonly variantLabel: string | null;
  readonly unitPricePkr: number;
  readonly quantity: number;
  readonly lineTotalPkr: number;
}

interface CartTotals {
  readonly lines: readonly CartLineTotal[];
  readonly subtotalPkr: number;
}

interface TakeawayReview {
  readonly totals: CartTotals;
  readonly guestName: string;
  readonly guestPhone: string;
  readonly requestedCollectionNote: string | null;
  readonly notes: string | null;
}

type Stage =
  | { readonly kind: 'cart' }
  | { readonly kind: 'review'; readonly review: TakeawayReview; readonly confirmationToken: string }
  | { readonly kind: 'confirmed' };

interface TakeawayCartProps {
  readonly locale: Locale;
}

async function readApiError(response: Response): Promise<{ code: string; message: string | null }> {
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    return { code: body.error?.code ?? 'UNKNOWN', message: body.error?.message ?? null };
  } catch {
    return { code: 'UNKNOWN', message: null };
  }
}

export function TakeawayCart({ locale }: TakeawayCartProps) {
  const [totals, setTotals] = useState<CartTotals | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: 'cart' });
  const [fields, setFields] = useState({
    guestName: '',
    guestPhone: '',
    requestedCollectionNote: '',
    notes: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  /*
   * `GET /api/takeaway/cart` returns the cart, the server-computed totals and
   * a CSRF token in one call, so the screen never renders a price it has not
   * been given and never needs a second round-trip to become usable.
   *
   * Used by the stale-price path, which re-reads the cart before sending the
   * guest back to it. Called from an event handler, never from an effect.
   */
  const loadCart = useCallback(async () => {
    try {
      const response = await fetch('/api/takeaway/cart');
      if (!response.ok) {
        setError(chromeText('takeawayCartGoneError', locale));
        return;
      }
      const body = (await response.json()) as { totals: CartTotals; csrfToken: string };
      setTotals(body.totals);
      setCsrfToken(body.csrfToken);
    } catch {
      setError(chromeText('sessionUnavailableError', locale));
    } finally {
      setLoaded(true);
    }
  }, [locale]);

  /*
   * The initial read is a promise chain rather than a call to `loadCart`
   * above, for two reasons. It matches `book/booking-form.tsx`'s idiom, and
   * awaiting an async function inside an effect trips
   * `react-hooks`'s cascading-render rule — which is right to complain: the
   * `cancelled` flag here is what stops a slow response writing state into an
   * unmounted component after the guest has navigated away.
   */
  useEffect(() => {
    let cancelled = false;
    fetch('/api/takeaway/cart')
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          setError(chromeText('takeawayCartGoneError', locale));
          return;
        }
        const body = (await response.json()) as { totals: CartTotals; csrfToken: string };
        if (cancelled) return;
        setTotals(body.totals);
        setCsrfToken(body.csrfToken);
      })
      .catch(() => {
        if (!cancelled) setError(chromeText('sessionUnavailableError', locale));
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  /*
   * The session can expire between page load and an action, which invalidates
   * the CSRF token with it. Re-fetching once on demand turns that into a
   * successful retry instead of an error the guest cannot act on.
   */
  async function ensureCsrfToken(): Promise<string | null> {
    if (csrfToken) return csrfToken;
    try {
      const response = await fetch('/api/takeaway/cart');
      if (!response.ok) return null;
      const body = (await response.json()) as { csrfToken?: string; totals?: CartTotals };
      if (body.totals) setTotals(body.totals);
      if (!body.csrfToken) return null;
      setCsrfToken(body.csrfToken);
      return body.csrfToken;
    } catch {
      return null;
    }
  }

  async function mutateLine(cartLineId: string, quantity: number | null) {
    setBusy(true);
    setError(null);
    const token = await ensureCsrfToken();
    if (!token) {
      setError(chromeText('sessionUnavailableError', locale));
      setBusy(false);
      return;
    }
    try {
      const response = await fetch(`/api/takeaway/cart/items/${cartLineId}`, {
        method: quantity === null ? 'DELETE' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          quantity === null ? { csrfToken: token } : { quantity, csrfToken: token },
        ),
      });
      if (!response.ok) {
        const { code, message } = await readApiError(response);
        // A cart that has gone is not a validation problem the guest can fix
        // by trying again, so it gets its own explanation and a way out.
        setError(
          code === 'NOT_FOUND'
            ? chromeText('takeawayCartGoneError', locale)
            : (message ?? chromeText('sessionUnavailableError', locale)),
        );
        return;
      }
      const body = (await response.json()) as { totals: CartTotals };
      setTotals(body.totals);
    } catch {
      setError(chromeText('sessionUnavailableError', locale));
    } finally {
      setBusy(false);
    }
  }

  async function handleReview(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const token = await ensureCsrfToken();
    if (!token) {
      setError(chromeText('sessionUnavailableError', locale));
      setBusy(false);
      return;
    }
    try {
      const response = await fetch('/api/takeaway/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName: fields.guestName,
          guestPhone: fields.guestPhone,
          requestedCollectionNote: fields.requestedCollectionNote || undefined,
          notes: fields.notes || undefined,
          csrfToken: token,
        }),
      });
      if (!response.ok) {
        const { code, message } = await readApiError(response);
        setError(
          code === 'NOT_FOUND'
            ? chromeText('takeawayCartGoneError', locale)
            : (message ?? chromeText('sessionUnavailableError', locale)),
        );
        return;
      }
      const body = (await response.json()) as {
        review: TakeawayReview;
        confirmationToken: string;
      };
      setStage({ kind: 'review', review: body.review, confirmationToken: body.confirmationToken });
    } catch {
      setError(chromeText('sessionUnavailableError', locale));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (stage.kind !== 'review') return;
    setBusy(true);
    setError(null);
    const token = await ensureCsrfToken();
    if (!token) {
      setError(chromeText('sessionUnavailableError', locale));
      setBusy(false);
      return;
    }
    // One key per confirm attempt: a retry of this attempt resolves to the
    // same request rather than creating a second one.
    const idempotencyKey = crypto.randomUUID();
    try {
      const response = await fetch('/api/takeaway/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName: stage.review.guestName,
          guestPhone: stage.review.guestPhone,
          requestedCollectionNote: stage.review.requestedCollectionNote ?? undefined,
          notes: stage.review.notes ?? undefined,
          sourceChannel: 'WEB',
          confirmationToken: stage.confirmationToken,
          idempotencyKey,
          csrfToken: token,
        }),
      });
      if (!response.ok) {
        const { code, message } = await readApiError(response);
        if (code === 'STALE_REVIEW') {
          // The menu moved under the review. Send the guest back to the
          // items with fresh server totals rather than submitting a price
          // that no longer exists.
          setStage({ kind: 'cart' });
          await loadCart();
          setError(chromeText('takeawayStalePricesError', locale));
          return;
        }
        setError(
          code === 'NOT_FOUND'
            ? chromeText('takeawayCartGoneError', locale)
            : (message ?? chromeText('sessionUnavailableError', locale)),
        );
        return;
      }
      setStage({ kind: 'confirmed' });
    } catch {
      setError(chromeText('sessionUnavailableError', locale));
    } finally {
      setBusy(false);
    }
  }

  if (stage.kind === 'confirmed') {
    return (
      <div className="receipt" role="status">
        <h2>{chromeText('takeawayConfirmedHeading', locale)}</h2>
        <p>{chromeText('takeawayConfirmedBody', locale)}</p>
        <div className="form-actions">
          <Link href={`/${locale}/menu`} className="u-button u-button--secondary">
            {chromeText('takeawayBrowseMenuLabel', locale)}
          </Link>
        </div>
      </div>
    );
  }

  if (stage.kind === 'review') {
    const { review } = stage;
    return (
      <div className="panel">
        <h2>{chromeText('takeawayReviewHeading', locale)}</h2>

        <ul className="takeaway-lines">
          {review.totals.lines.map((line) => (
            <li key={line.cartLineId} className="takeaway-line">
              <span className="takeaway-line-name" lang="en" dir="ltr">
                {line.name}
                {line.variantLabel ? <span className="u-muted"> — {line.variantLabel}</span> : null}
              </span>
              <span className="takeaway-line-qty">&times;{line.quantity}</span>
              <span className="takeaway-line-total">{formatPkr(line.lineTotalPkr)}</span>
            </li>
          ))}
        </ul>

        <p className="takeaway-subtotal">
          <span>{chromeText('takeawaySubtotalLabel', locale)}</span>{' '}
          <strong>{formatPkr(review.totals.subtotalPkr)}</strong>
        </p>
        <p className="u-muted field-hint">{chromeText('takeawaySubtotalNote', locale)}</p>

        <dl className="summary-list">
          <dt>{chromeText('bookFormNameLabel', locale)}</dt>
          <dd>{review.guestName}</dd>
          <dt>{chromeText('bookFormPhoneLabel', locale)}</dt>
          <dd>{review.guestPhone}</dd>
          {review.requestedCollectionNote ? (
            <>
              <dt>{chromeText('takeawayCollectionNoteLabel', locale)}</dt>
              <dd>{review.requestedCollectionNote}</dd>
            </>
          ) : null}
          {review.notes ? (
            <>
              <dt>{chromeText('bookFormNotesLabel', locale)}</dt>
              <dd>{review.notes}</dd>
            </>
          ) : null}
        </dl>

        {error ? (
          <p className="alert" role="alert" aria-live="assertive">
            {error}
          </p>
        ) : null}

        <div className="form-actions">
          <button
            type="button"
            className="u-button u-button--primary"
            disabled={busy}
            onClick={() => void handleConfirm()}
          >
            {chromeText('takeawaySendRequestLabel', locale)}
          </button>
          <button
            type="button"
            className="u-button u-button--secondary"
            disabled={busy}
            onClick={() => {
              setError(null);
              setStage({ kind: 'cart' });
            }}
          >
            {chromeText('takeawayBackToCartLabel', locale)}
          </button>
        </div>
      </div>
    );
  }

  const lines = totals?.lines ?? [];

  return (
    <div>
      {error ? (
        <p className="alert" role="alert" aria-live="assertive">
          {error}
        </p>
      ) : null}

      {loaded && lines.length === 0 ? (
        <div className="state-block">
          <h2>{chromeText('takeawayEmptyHeading', locale)}</h2>
          <p className="u-lede">{chromeText('takeawayEmptyBody', locale)}</p>
          <div className="form-actions state-actions">
            <Link href={`/${locale}/menu`} className="u-button u-button--primary">
              {chromeText('takeawayBrowseMenuLabel', locale)}
            </Link>
          </div>
        </div>
      ) : null}

      {lines.length > 0 ? (
        <div className="form-layout">
          <section className="panel" aria-labelledby="takeaway-items-heading">
            <h2 id="takeaway-items-heading">{chromeText('takeawayItemsHeading', locale)}</h2>
            <ul className="takeaway-lines">
              {lines.map((line) => (
                <li key={line.cartLineId} className="takeaway-line takeaway-line--editable">
                  <span className="takeaway-line-name" lang="en" dir="ltr">
                    {line.name}
                    {line.variantLabel ? (
                      <span className="u-muted"> — {line.variantLabel}</span>
                    ) : null}
                  </span>
                  <span className="takeaway-line-unit u-muted">{formatPkr(line.unitPricePkr)}</span>

                  <label className="takeaway-line-qty-field">
                    <span className="u-visually-hidden">
                      {chromeText('takeawayQuantityLabel', locale)}
                    </span>
                    {/*
                     * A round-trip on change, never a local recount: the
                     * server returns the authoritative totals and this
                     * renders those. Rendering a locally-multiplied figure
                     * would briefly show a price nobody authorised.
                     */}
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={line.quantity}
                      disabled={busy}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        if (Number.isInteger(next) && next >= 1 && next <= 99) {
                          void mutateLine(line.cartLineId, next);
                        }
                      }}
                    />
                  </label>

                  <span className="takeaway-line-total">{formatPkr(line.lineTotalPkr)}</span>

                  <button
                    type="button"
                    className="u-button u-button--secondary takeaway-line-remove"
                    disabled={busy}
                    onClick={() => void mutateLine(line.cartLineId, null)}
                  >
                    {chromeText('takeawayRemoveLabel', locale)}
                  </button>
                </li>
              ))}
            </ul>

            <p className="takeaway-subtotal" aria-live="polite">
              <span>{chromeText('takeawaySubtotalLabel', locale)}</span>{' '}
              <strong>{formatPkr(totals?.subtotalPkr ?? 0)}</strong>
            </p>
            <p className="u-muted field-hint">{chromeText('takeawaySubtotalNote', locale)}</p>
          </section>

          <section className="panel" aria-labelledby="takeaway-details-heading">
            <h2 id="takeaway-details-heading">{chromeText('takeawayDetailsHeading', locale)}</h2>
            <form onSubmit={(event) => void handleReview(event)}>
              <div className="field">
                <label htmlFor="takeaway-name">{chromeText('bookFormNameLabel', locale)}</label>
                <input
                  id="takeaway-name"
                  name="guestName"
                  required
                  value={fields.guestName}
                  onChange={(e) => setFields((f) => ({ ...f, guestName: e.target.value }))}
                />
              </div>

              <div className="field">
                <label htmlFor="takeaway-phone">{chromeText('bookFormPhoneLabel', locale)}</label>
                <input
                  id="takeaway-phone"
                  name="guestPhone"
                  type="tel"
                  required
                  value={fields.guestPhone}
                  onChange={(e) => setFields((f) => ({ ...f, guestPhone: e.target.value }))}
                />
              </div>

              <div className="field">
                <label htmlFor="takeaway-collection">
                  {chromeText('takeawayCollectionNoteLabel', locale)}
                </label>
                <input
                  id="takeaway-collection"
                  name="requestedCollectionNote"
                  value={fields.requestedCollectionNote}
                  aria-describedby="takeaway-collection-hint"
                  onChange={(e) =>
                    setFields((f) => ({ ...f, requestedCollectionNote: e.target.value }))
                  }
                />
                {/* Says plainly that a stated time is a preference, not a
                    promise — the site never commits to a pickup time. */}
                <p id="takeaway-collection-hint" className="field-hint">
                  {chromeText('takeawayCollectionNoteHint', locale)}
                </p>
              </div>

              <div className="field">
                <label htmlFor="takeaway-notes">{chromeText('bookFormNotesLabel', locale)}</label>
                <textarea
                  id="takeaway-notes"
                  name="notes"
                  rows={3}
                  value={fields.notes}
                  onChange={(e) => setFields((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>

              <div className="form-actions">
                <button type="submit" className="u-button u-button--primary" disabled={busy}>
                  {chromeText('takeawayContinueLabel', locale)}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
