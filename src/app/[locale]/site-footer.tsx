/**
 * Site footer — Runbook Step 15.
 *
 * Only the hours/status display this step asks for. Address, map, and
 * WhatsApp contact are Step 16's scope ("Home, location, and contact"), not
 * added here to keep this step's diff to what it actually covers. No
 * ratings or testimonials — none are approved (CLAUDE.md: "Never publish
 * placeholder... reviews, ratings, social proof"). The Step 36 Privacy
 * link is the one exception: it is not a placeholder legal page — it's an
 * honest "not published yet, here's how to reach us" notice plus the real,
 * fully-working consent grant/revoke controls, the same honest-status
 * pattern `menu/page.tsx` already uses for the unapproved menu.
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
      <p>
        <a href={`/${locale}/privacy`}>{chromeText('navPrivacyLabel', locale)}</a>
      </p>
    </footer>
  );
}
