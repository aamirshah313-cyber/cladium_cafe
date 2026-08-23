const REQUIRED_PHRASES = [
  { label: 'Hours: 12 pm to 12 am', pattern: /12\s*pm\s*to\s*12\s*am/i },
  { label: 'No home delivery currently offered', pattern: /do not currently offer home delivery/i },
  { label: 'Décor starting price PKR 8,000', pattern: /8,?000/ },
  { label: 'No cakes provided', pattern: /does not provide cakes/i },
  { label: 'Outside food is not allowed', pattern: /outside food is not allowed/i },
  { label: 'Treehouse capacity limited/staff-confirmed', pattern: /treehouse capacity is limited/i },
];

/**
 * Confirms the concierge's approved-answer sheet still states each
 * non-negotiable policy in recognizable language. A missing phrase is a real
 * regression risk for the concierge, so it is reported as an error.
 */
export function crossCheckApprovedKnowledge(text) {
  const errors = [];
  const info = [];
  for (const { label, pattern } of REQUIRED_PHRASES) {
    if (pattern.test(text)) {
      info.push(`Found required policy language: ${label}`);
    } else {
      errors.push(`approved-operations-knowledge.md is missing expected language for: ${label}`);
    }
  }
  return { errors, info };
}
