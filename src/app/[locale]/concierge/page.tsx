/**
 * Concierge page — Runbook Step 28. The first real UI entry point for the
 * text concierge (Steps 26–27 built the tools/orchestration only) — this
 * is where CLAUDE.md's "Ask Cladium Concierge" CTA now leads.
 */

import { notFound } from 'next/navigation';
import { chromeText } from '../../../lib/i18n/chrome';
import { isSupportedLocale } from '../../../lib/i18n/locale';
import { ConciergeChat } from './concierge-chat';

export default async function ConciergePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isSupportedLocale(rawLocale)) notFound();
  const locale = rawLocale;

  return (
    <div>
      <h1>{chromeText('conciergePageHeading', locale)}</h1>
      <ConciergeChat locale={locale} />
    </div>
  );
}
