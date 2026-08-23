const EXPECTED_HOURS_DISPLAY = '12 pm–12 am';
const EXPECTED_DECOR_STARTING_PRICE_PKR = 8000;
const WHATSAPP_PATTERN = /^\+92 \d{3} \d{7}$/;

/**
 * Validates business-profile.json against CLAUDE.md's non-negotiable operating
 * rules. Never mutates the input; only reads and reports.
 */
export function validateBusinessProfile(profile) {
  const errors = [];
  const warnings = [];
  const facts = {};

  const business = profile?.business;
  if (!business || typeof business !== 'object') {
    errors.push('Missing "business" object.');
    return { errors, warnings, facts };
  }

  if (!business.name || typeof business.name !== 'string') {
    errors.push('Missing or invalid business.name.');
  } else {
    facts.name = business.name;
  }

  const hoursDisplay = business.hours?.display;
  if (hoursDisplay !== EXPECTED_HOURS_DISPLAY) {
    errors.push(
      `business.hours.display is ${JSON.stringify(hoursDisplay)}, expected ${JSON.stringify(EXPECTED_HOURS_DISPLAY)} (non-negotiable open hours).`,
    );
  } else {
    facts.hours = hoursDisplay;
  }

  const fulfilment = business.operations?.fulfilment;
  if (fulfilment?.home_delivery !== false) {
    errors.push(
      `business.operations.fulfilment.home_delivery must be exactly false, got ${JSON.stringify(fulfilment?.home_delivery)} (delivery is never offered).`,
    );
  }
  if (fulfilment?.takeaway !== true) {
    errors.push(
      `business.operations.fulfilment.takeaway must be exactly true, got ${JSON.stringify(fulfilment?.takeaway)}.`,
    );
  }
  facts.fulfilment = fulfilment;

  const seating = business.operations?.seating;
  if (!seating?.general_capacity) {
    warnings.push('business.operations.seating.general_capacity is missing.');
  }
  if (!seating?.treehouse_capacity) {
    warnings.push('business.operations.seating.treehouse_capacity is missing.');
  }
  facts.seating = seating;

  const decor = business.operations?.birthday_and_event_policy;
  if (decor?.decor_starting_price_pkr !== EXPECTED_DECOR_STARTING_PRICE_PKR) {
    errors.push(
      `decor_starting_price_pkr is ${JSON.stringify(decor?.decor_starting_price_pkr)}, expected ${EXPECTED_DECOR_STARTING_PRICE_PKR} (non-negotiable décor floor price).`,
    );
  }
  if (decor?.cakes_provided !== false) {
    errors.push(
      `cakes_provided must be exactly false, got ${JSON.stringify(decor?.cakes_provided)} (the café does not provide cakes).`,
    );
  }
  if (decor?.outside_food_allowed !== false) {
    errors.push(
      `outside_food_allowed must be exactly false, got ${JSON.stringify(decor?.outside_food_allowed)} (outside food is not allowed).`,
    );
  }
  facts.birthdayAndEventPolicy = decor;

  const whatsapp = business.contact?.whatsapp;
  if (!whatsapp) {
    errors.push('business.contact.whatsapp is missing.');
  } else if (!WHATSAPP_PATTERN.test(whatsapp)) {
    warnings.push(
      `business.contact.whatsapp ${JSON.stringify(whatsapp)} does not match the expected "+92 XXX XXXXXXX" format — verify manually, do not auto-correct.`,
    );
  }
  facts.whatsapp = whatsapp;

  const mapsUrl = business.location?.google_maps_url;
  if (!mapsUrl || typeof mapsUrl !== 'string') {
    errors.push('business.location.google_maps_url is missing.');
  }
  facts.googleMapsUrl = mapsUrl;

  if (!Array.isArray(profile.unverified_or_missing)) {
    warnings.push(
      'Top-level "unverified_or_missing" list is absent — cannot confirm known-gap disclosure is intact.',
    );
  } else {
    facts.disclosedGaps = profile.unverified_or_missing;
  }

  return { errors, warnings, facts };
}
