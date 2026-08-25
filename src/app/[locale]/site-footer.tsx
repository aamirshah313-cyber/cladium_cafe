/**
 * Site footer — Runbook Step 15.
 *
 * Only the hours/status display this step asks for. Address, map, and
 * WhatsApp contact are Step 16's scope ("Home, location, and contact"), not
 * added here to keep this step's diff to what it actually covers. No legal
 * links, ratings, or testimonials — none are approved (CLAUDE.md: "Never
 * publish placeholder legal pages... reviews, ratings, social proof").
 */

import { BRAND_NAME, chromeText } from '../../lib/i18n/chrome';
import { isOpenAt } from '../../lib/business/hours';
import type { Locale } from '../../lib/i18n/locale';
import { BUSINESS_HOURS_DISPLAY } from '../../modules/business/facts';

interface SiteFooterProps {
  readonly locale: Locale;
}

export function SiteFooter({ locale }: SiteFooterProps) {
  const open = isOpenAt(new Date());
  const statusKey = open ? 'statusOpenNow' : 'statusClosedNow';

  return (
    <footer>
      <p>{BRAND_NAME}</p>
      <p>
        <span>{chromeText('hoursLabel', locale)}: </span>
        <span>{BUSINESS_HOURS_DISPLAY}</span>
        <span> · </span>
        <span>{chromeText(statusKey, locale)}</span>
      </p>
    </footer>
  );
}
