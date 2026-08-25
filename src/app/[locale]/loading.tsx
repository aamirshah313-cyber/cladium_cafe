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
    <p role="status" aria-live="polite">
      <span lang="en">Loading…</span>
      {' / '}
      <span lang="ur" dir="rtl">
        لوڈ ہو رہا ہے…
      </span>
    </p>
  );
}
