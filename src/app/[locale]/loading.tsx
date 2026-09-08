/**
 * Route-level loading state.
 *
 * `loading.js` receives no route params (Next.js file convention), so the
 * locale can't be read here the way `page.tsx`/`layout.tsx` do. The status
 * text is therefore shown bilingually rather than guessed — this is a
 * brief, generic boundary, not business content.
 *
 * ## Content-shaped, not a spinner in an empty page
 *
 * A lone spinner tells a guest that something is happening but nothing
 * about what is arriving, and the page then rearranges completely around
 * it. These blocks are sized like the thing every route actually opens
 * with — a page heading, a line of supporting text, and a panel — so the
 * shift when the real content lands is small instead of total.
 *
 * They are deliberately *approximate*. Reserving an exact silhouette per
 * route would be a second layout to keep in sync with the first, and it
 * would go wrong quietly; being roughly right everywhere is the more honest
 * trade.
 *
 * The whole block is `aria-hidden` apart from one live status line: a
 * screen reader user needs "loading", not a description of six grey
 * rectangles. The shimmer is decorative and stops entirely under
 * `prefers-reduced-motion` (globals.css), leaving the same static geometry.
 */

export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="route-skeleton">
      <div aria-hidden="true" className="route-skeleton-shapes">
        <span className="route-skeleton-block route-skeleton-block--title" />
        <span className="route-skeleton-block route-skeleton-block--lede" />
        <span className="route-skeleton-block route-skeleton-block--panel" />
      </div>

      <p className="u-muted route-skeleton-label">
        <span lang="en">Loading…</span>
        {' / '}
        <span lang="ur" dir="rtl">
          لوڈ ہو رہا ہے…
        </span>
      </p>
    </div>
  );
}
