# English and Urdu localization specification

## Launch requirement

English (`en`) and Urdu (`ur`) are mandatory first-release languages. This applies to the public website, menu discovery, booking/order forms, staff-safe request summaries, text concierge, and browser voice concierge. The brand name **Cladium Café & Resort** remains unchanged.

## Locale and direction contract

| Concern | English | Urdu |
| --- | --- | --- |
| Route | `/en/...` or default English route | `/ur/...` |
| Document language | `lang="en"` | `lang="ur"` |
| Document direction | `dir="ltr"` | `dir="rtl"` |
| Font loading | editorial serif + contemporary sans | Urdu-capable text font with compatible Latin fallback |
| Numerals | original configured values | preserve original configured values; do not transform prices/phone numbers |
| Layout | logical CSS properties | mirror through logical CSS, not duplicated markup |

Remember the guest’s language choice in a privacy-safe local preference and make it changeable from every primary navigation context. Do not infer Urdu solely from location.

## Content approval model

```ts
type LocalizedText = {
  en: string;
  ur: string | null;
  urStatus: 'missing' | 'draft' | 'owner_approved';
  sourceLanguage: 'en';
};
```

- Canonical supplied menu/business data remains unchanged and English-first.
- Only `owner_approved` Urdu text may be displayed as published business content.
- When Urdu is missing, retain canonical English item names/amounts and create an admin translation task. Never invent a public Urdu food name, ingredient claim, promotion, legal phrase, or operational policy.
- UI chrome uses reviewed application translations. Menu data, offers, campaign language, policies, and legal content require owner review before publication.

## Interface and RTL requirements

1. Show a visible `English | اردو` control in desktop and mobile navigation; announce the selected language.
2. Apply `dir="rtl"` at the Urdu document root; use CSS logical properties (`padding-inline`, `margin-inline`, `inset-inline`, `border-inline`). Never maintain duplicate mirrored components.
3. Mirror directional arrows and carousel controls, but never mirror the supplied Cladium logo, maps, food images, phone digits, numeric prices, or brand marks.
4. Test Urdu labels, errors, focus order, long mixed-language dish names, PKR amounts, and validation messages at mobile and desktop sizes.

## Text and audio concierge requirements

- Understand English, Urdu script, and common Roman Urdu. The selected site locale is the default response language; an explicit request switches immediately.
- Text and Vapi voice use the same language-aware system prompt and deterministic tool layer.
- Configure a separately quality-tested Urdu speech-recognition and Urdu voice-output profile, plus a separately quality-tested English profile. Never rely on an English voice to pronounce Urdu responses or an English-only transcriber for Urdu speech.
- Show the active language in the voice control before calling. Permit language selection before starting and an in-call language switch; a language switch preserves only safe session state.
- Preserve tool-returned menu names, prices, quantities, dates, links, and statuses exactly. Use owner-approved Urdu fields where available; otherwise retain canonical English values.
- Voice quality tests must cover real-world Urdu pronunciation, English pronunciation, Urdu/English code switching, noisy mobile input, no-match recovery, and WhatsApp handoff.

## Confirmation and safety

The submission mechanism is a localized, clearly labelled UI control after a server-generated review. Natural-language confirmation may express intent and advance the guest to that review, but text or voice alone cannot submit. The final control uses a valid single-use confirmation token bound to the reviewed payload.

| Locale | Clear intent to review/confirm | Ambiguous; do not advance |
| --- | --- | --- |
| English | `Yes, I confirm the order` | `Okay`, `fine`, `maybe` |
| Urdu | `جی، میں آرڈر کی تصدیق کرتا/کرتی ہوں` | `ٹھیک ہے`, `اچھا`, `دیکھتے ہیں` |

No confirmation phrase submits by itself or translates into staff acceptance, payment success, collection-time confirmation, booking confirmation, or delivery availability.

## Required tests

- All public routes render English and Urdu with correct `lang`/`dir` values.
- Keyboard, focus order, errors, forms, cart, and carousel work in RTL at 360px, 768px, 1024px, and desktop widths.
- Switching locale never changes item IDs, quantities, prices, or request/confirmation state.
- English, Urdu-script, and Roman-Urdu text/voice inputs receive grounded responses with the same no-delivery, price, policy, booking, and privacy safeguards.
- English and Urdu Vapi profiles are tested independently, including language switch and audio fallback/error states.
