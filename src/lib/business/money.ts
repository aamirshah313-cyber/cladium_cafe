/**
 * Integer-PKR display formatting — Runbook Step 17.
 *
 * `data-model-v2.md`: "Money is stored as integer PKR; do not use floats."
 * This is the display counterpart: `PKR 8,000`, matching the exact style
 * already used in approved copy (`modules/business/facts.ts`'s
 * `BIRTHDAY_POLICY_TEXT`: "starting from PKR 8,000") — Western thousands
 * grouping via a fixed `en-US` formatter, not locale-dependent, so a price
 * never silently changes shape between English and Urdu rendering.
 */

export function formatPkr(amountPkr: number): string {
  return `PKR ${amountPkr.toLocaleString('en-US')}`;
}
