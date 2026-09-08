/**
 * Concierge page — Runbook Step 28. The first real UI entry point for the
 * text concierge (Steps 26–27 built the tools/orchestration only) — this
 * is where CLAUDE.md's "Ask Cladium Concierge" CTA now leads.
 *
 * Step 33: the requested locale's own `FEATURE_VOICE_EN`/`FEATURE_VOICE_UR`
 * flag is resolved server-side (`isFeatureEnabled`, a server-only module —
 * client components cannot read it) and passed down as a plain boolean.
 * When false, no Type/Talk toggle renders at all — "feature flags remove
 * disabled controls" (`release-gates-v2.md` Gate 1), not merely hide a
 * voice button behind a client-side check a guest's devtools could still
 * see. `FEATURE_VOICE_EN`/`FEATURE_VOICE_UR` are both `false` in
 * `.env.example`, so voice is off by default until deliberately enabled.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { chromeText } from '../../../lib/i18n/chrome';
import { isSupportedLocale } from '../../../lib/i18n/locale';
import { localePageMetadata } from '../../../lib/i18n/metadata';
import { isFeatureEnabled } from '../../../lib/env.server';
import { ConciergeChat } from './concierge-chat';
import { ConciergeModeToggle } from './concierge-mode-toggle';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  if (!isSupportedLocale(rawLocale)) return {};
  return localePageMetadata(
    rawLocale,
    '/concierge',
    'conciergePageHeading',
    'conciergeMetaDescription',
  );
}

export default async function ConciergePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isSupportedLocale(rawLocale)) notFound();
  const locale = rawLocale;

  const voiceAvailable = isFeatureEnabled(
    locale === 'ur' ? 'FEATURE_VOICE_UR' : 'FEATURE_VOICE_EN',
  );

  return (
    <div>
      {/*
       * The heading only. `conciergePageLede` said "Ask about the menu,
       * hours, directions, seating or celebrations" and `conciergeIntro`,
       * rendered a few pixels below it inside the chat panel, said "Ask
       * about the menu, hours, directions, or start a table or event
       * request" — two greetings competing to be the welcome. The one
       * inside the panel wins: it belongs to the thing it introduces, and
       * it is the one that also names the WhatsApp fallback.
       *
       * `conciergePageLede` is kept in `chrome.ts` because it is still the
       * page's meta description; it is just no longer rendered twice over.
       */}
      <div className="page-header">
        <h1>{chromeText('conciergePageHeading', locale)}</h1>
      </div>
      {voiceAvailable ? <ConciergeModeToggle locale={locale} /> : <ConciergeChat locale={locale} />}
    </div>
  );
}
