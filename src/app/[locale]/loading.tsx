/**
 * Route-level loading state — Runbook Step 15.
 *
 * `loading.js` receives no route params (Next.js file convention), so the
 * locale can't be read here the way `page.tsx`/`layout.tsx` do. Shown
 * bilingually rather than guessed — this is a brief, generic boundary, not
 * business content.
 */

export default function Loading() {
  return (
    <div className="state-block" role="status" aria-live="polite">
      {/* A modest indicator with reserved height, so the next screen does
          not jump into place around it. Animation is decorative and stops
          entirely under prefers-reduced-motion (globals.css). */}
      <span className="state-spinner" aria-hidden="true" />
      <p className="u-muted">
        <span lang="en">Loading…</span>
        {' / '}
        <span lang="ur" dir="rtl">
          لوڈ ہو رہا ہے…
        </span>
      </p>
    </div>
  );
}
