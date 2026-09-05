'use client';

/**
 * Mobile navigation drawer.
 *
 * A real modal dialog rather than a toggled `<div>`: it uses the native
 * `<dialog>`'s own semantics through explicit ARIA plus focus management,
 * because the mobile header must not let a navigation list consume the
 * entire first screen (design brief, shared mobile header).
 *
 * Behaviour that is deliberate, not incidental:
 * - Escape closes it, and focus returns to the trigger that opened it, so a
 *   keyboard user is never dropped at the top of the document.
 * - Focus is trapped while open (Tab from the last control wraps to the
 *   first), and the page behind it cannot be scrolled.
 * - Nothing is rendered at all while closed, so no off-screen links sit in
 *   the tab order of a page whose drawer is shut — the "menu drawer
 *   trapping after close" failure the brief calls out.
 *
 * The trigger is labelled text plus an icon, never icon-only.
 */

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { chromeText } from '../../lib/i18n/chrome';
import type { Locale } from '../../lib/i18n/locale';

interface SiteDrawerProps {
  readonly locale: Locale;
  readonly children: ReactNode;
}

export function SiteDrawer({ locale, children }: SiteDrawerProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    // Move focus into the panel so the next Tab lands inside it, not back in
    // the page behind.
    panel?.querySelector<HTMLElement>('button, a')?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;

      const focusable = [
        ...panel.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)'),
      ].filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    // Crossing to the desktop breakpoint hides the trigger, which would
    // otherwise leave an open drawer with no visible control that opened it
    // and nothing to return focus to. Closing on the crossing keeps the two
    // layouts consistent; `setOpen` rather than `close` because there is no
    // longer a visible trigger to move focus back to.
    const desktop = window.matchMedia('(min-width: 1024px)');
    function onBreakpointChange(event: MediaQueryListEvent) {
      if (event.matches) setOpen(false);
    }
    desktop.addEventListener('change', onBreakpointChange);

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      desktop.removeEventListener('change', onBreakpointChange);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="site-header-drawer-trigger"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path
            d="M2 4.5h14M2 9h14M2 13.5h14"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        {chromeText('menuDrawerOpenLabel', locale)}
      </button>

      {open ? (
        <>
          {/* Clicking the backdrop is a convenience; Escape and the close
              button are the accessible paths, so this stays aria-hidden. */}
          <div className="site-drawer-backdrop" aria-hidden="true" onClick={close} />
          <div
            ref={panelRef}
            className="site-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <div className="site-drawer-head">
              <h2 id={titleId} className="u-display" style={{ fontSize: '1.1rem', margin: 0 }}>
                {chromeText('menuDrawerTitle', locale)}
              </h2>
              <button type="button" className="u-button u-button--secondary" onClick={close}>
                {chromeText('menuDrawerCloseLabel', locale)}
              </button>
            </div>
            {children}
          </div>
        </>
      ) : null}
    </>
  );
}
