/**
 * Reviewed application chrome translations.
 *
 * design/localization-and-rtl.md: "UI chrome uses reviewed application
 * translations" — distinct from business/menu/policy content, which must go
 * through the owner-approval workflow in `localized-text.ts` instead. These
 * are static interface strings only (navigation, structural labels); no
 * business fact, price, policy, or promotional claim belongs in this file.
 *
 * The brand name is never translated or transliterated (localization-and-
 * rtl.md: "The brand name Cladium Café & Resort remains unchanged"). The
 * tagline is the retained line from the official supplied mark
 * (`brand/visual-direction.md`) — brand asset, not translated UI chrome —
 * so it lives alongside `BRAND_NAME` as its own untranslated constant
 * rather than inside `chrome`.
 */

import type { Locale } from './locale';

export interface ChromeCopy {
  readonly en: string;
  readonly ur: string;
}

export const BRAND_NAME = 'Cladium Café & Resort';
export const TAGLINE = 'Relax • Refresh • Reconnect';

export const chrome = {
  skipToContent: { en: 'Skip to content', ur: 'مرکزی مواد پر جائیں' },
  languageSwitcherLabel: { en: 'Language', ur: 'زبان' },
  englishLanguageName: { en: 'English', ur: 'انگریزی' },
  urduLanguageName: { en: 'Urdu', ur: 'اردو' },
  themeSwitcherLabel: { en: 'Theme', ur: 'تھیم' },
  dayThemeName: { en: 'Day', ur: 'دن' },
  nightThemeName: { en: 'Night', ur: 'رات' },
  homeIntro: {
    en: 'A luxury café and resort experience.',
    ur: 'ایک شاندار کیفے اور ریزورٹ کا تجربہ۔',
  },
  primaryNavLabel: { en: 'Primary', ur: 'بنیادی' },
  navHomeLabel: { en: 'Home', ur: 'ہوم' },
  hoursLabel: { en: 'Hours', ur: 'اوقات' },
  statusOpenNow: { en: 'Open now', ur: 'ابھی کھلا ہے' },
  statusClosedNow: { en: 'Closed now', ur: 'ابھی بند ہے' },
  loadingLabel: { en: 'Loading…', ur: 'لوڈ ہو رہا ہے…' },
  errorHeading: { en: 'Something went wrong', ur: 'کچھ غلط ہو گیا' },
  errorBody: {
    en: 'Please try again, or return to the home page.',
    ur: 'براہ کرم دوبارہ کوشش کریں، یا ہوم پیج پر واپس جائیں۔',
  },
  errorRetry: { en: 'Try again', ur: 'دوبارہ کوشش کریں' },
  errorHomeLink: { en: 'Go to home page', ur: 'ہوم پیج پر جائیں' },
  notFoundHeading: { en: 'Page not found', ur: 'صفحہ نہیں ملا' },
  notFoundBody: {
    en: "The page you're looking for doesn't exist.",
    ur: 'جو صفحہ آپ تلاش کر رہے ہیں وہ موجود نہیں ہے۔',
  },
  navVisitLabel: { en: 'Visit', ur: 'وزٹ' },
  visitPageHeading: { en: 'Visit us', ur: 'ہم سے ملیں' },
  directionsHeading: { en: 'Directions', ur: 'راستہ' },
  addressHeading: { en: 'Address', ur: 'پتہ' },
  contactHeading: { en: 'Contact', ur: 'رابطہ' },
  whatsappCtaLabel: { en: 'Chat on WhatsApp', ur: 'واٹس ایپ پر بات کریں' },
  mapCtaLabel: { en: 'View on Google Maps', ur: 'گوگل میپس پر دیکھیں' },
  goodToKnowHeading: { en: 'Good to know', ur: 'اہم معلومات' },
  homeVisitCtaLabel: { en: 'Plan your visit', ur: 'اپنا وزٹ پلان کریں' },
  navMenuLabel: { en: 'Menu', ur: 'مینو' },
  menuUnpublishedHeading: {
    en: "Our online menu isn't available yet",
    ur: 'ہمارا آن لائن مینو ابھی دستیاب نہیں ہے',
  },
  menuUnpublishedBody: {
    en: "Please contact us on WhatsApp or visit us in person to see today's menu.",
    ur: 'براہ کرم واٹس ایپ پر رابطہ کریں یا آج کا مینو دیکھنے کے لیے خود آئیں۔',
  },
  menuSearchLabel: { en: 'Search the menu', ur: 'مینو میں تلاش کریں' },
  menuSearchButtonLabel: { en: 'Search', ur: 'تلاش کریں' },
  menuCategoryFilterLabel: { en: 'Category', ur: 'زمرہ' },
  menuAllCategoriesLabel: { en: 'All categories', ur: 'تمام زمرے' },
  menuNoResultsText: {
    en: 'No items match your search.',
    ur: 'آپ کی تلاش سے کوئی آئٹم مماثل نہیں۔',
  },
  availabilityAvailable: { en: 'Available', ur: 'دستیاب' },
  availabilityUnavailable: { en: 'Currently unavailable', ur: 'فی الحال دستیاب نہیں' },
  availabilityUnknown: {
    en: 'Ask staff to confirm availability',
    ur: 'دستیابی کی تصدیق کے لیے عملے سے پوچھیں',
  },
  navBookLabel: { en: 'Request a Table', ur: 'میز کی درخواست' },
  bookPageHeading: { en: 'Request a Table', ur: 'میز کی درخواست' },
  treehouseSeatingCtaLabel: { en: 'Request Treehouse Seating', ur: 'ٹری ہاؤس نشست کی درخواست' },
  bookFormNameLabel: { en: 'Your name', ur: 'آپ کا نام' },
  bookFormPhoneLabel: { en: 'Phone number', ur: 'فون نمبر' },
  bookFormDateLabel: { en: 'Date', ur: 'تاریخ' },
  bookFormTimeLabel: { en: 'Time', ur: 'وقت' },
  bookFormPartySizeLabel: { en: 'Party size', ur: 'مہمانوں کی تعداد' },
  bookFormSeatingLabel: { en: 'Seating preference', ur: 'نشست کی ترجیح' },
  seatingGeneralLabel: { en: 'General seating', ur: 'عمومی نشست' },
  seatingTreehouseLabel: { en: 'Treehouse', ur: 'ٹری ہاؤس' },
  bookFormNotesLabel: { en: 'Notes (optional)', ur: 'نوٹس (اختیاری)' },
  bookReviewHeading: { en: 'Review your request', ur: 'اپنی درخواست کا جائزہ لیں' },
  bookEditButtonLabel: { en: 'Edit details', ur: 'تفصیلات میں ترمیم کریں' },
  bookConfirmButtonLabel: { en: 'Confirm request', ur: 'درخواست کی تصدیق کریں' },
  bookSubmitButtonLabel: { en: 'Review request', ur: 'درخواست کا جائزہ لیں' },
  bookConfirmedHeading: { en: 'Request received', ur: 'درخواست موصول ہو گئی' },
  bookConfirmedBody: {
    en: 'Your table request has been received. Staff will confirm your booking — this is not yet a confirmed reservation.',
    ur: 'آپ کی میز کی درخواست موصول ہو گئی ہے۔ عملہ آپ کی بکنگ کی تصدیق کرے گا — یہ ابھی تک تصدیق شدہ ریزرویشن نہیں ہے۔',
  },
  navPlanBirthdayLabel: { en: 'Plan a Birthday', ur: 'سالگرہ کی منصوبہ بندی کریں' },
  eventPageHeading: { en: 'Plan a Birthday or Event', ur: 'سالگرہ یا تقریب کی منصوبہ بندی' },
  eventFormOccasionLabel: { en: 'Occasion', ur: 'موقع' },
  eventFormGuestCountLabel: { en: 'Number of guests', ur: 'مہمانوں کی تعداد' },
  eventFormDecorInterestLabel: {
    en: 'Interested in décor?',
    ur: 'کیا آپ سجاوٹ میں دلچسپی رکھتے ہیں؟',
  },
  yesLabel: { en: 'Yes', ur: 'جی ہاں' },
  noLabel: { en: 'No', ur: 'نہیں' },
  eventReviewHeading: { en: 'Review your enquiry', ur: 'اپنی انکوائری کا جائزہ لیں' },
  eventConfirmButtonLabel: { en: 'Confirm enquiry', ur: 'انکوائری کی تصدیق کریں' },
  eventSubmitButtonLabel: { en: 'Review enquiry', ur: 'انکوائری کا جائزہ لیں' },
  eventConfirmedHeading: { en: 'Enquiry received', ur: 'انکوائری موصول ہو گئی' },
  eventConfirmedBody: {
    en: 'Your birthday/event enquiry has been received. Staff will follow up with décor availability and a quote — this is not yet a confirmed quote or booking.',
    ur: 'آپ کی سالگرہ/تقریب کی انکوائری موصول ہو گئی ہے۔ عملہ سجاوٹ کی دستیابی اور قیمت کے ساتھ رابطہ کرے گا — یہ ابھی تک تصدیق شدہ قیمت یا بکنگ نہیں ہے۔',
  },
  navConciergeLabel: { en: 'Ask Cladium Concierge', ur: 'کلیڈیم قونصیرج سے پوچھیں' },
  conciergePageHeading: { en: 'Ask Cladium Concierge', ur: 'کلیڈیم قونصیرج سے پوچھیں' },
  conciergeIntro: {
    en: "Ask about the menu, hours, directions, or start a table or event request. For anything I can't help with, our team is on WhatsApp.",
    ur: 'مینو، اوقات، راستے کے بارے میں پوچھیں، یا میز یا تقریب کی درخواست شروع کریں۔ جس چیز میں مدد نہ کر سکوں، ہماری ٹیم واٹس ایپ پر موجود ہے۔',
  },
  conciergeInputLabel: { en: 'Your message', ur: 'آپ کا پیغام' },
  conciergeSendButtonLabel: { en: 'Send', ur: 'بھیجیں' },
  conciergeThinkingLabel: { en: 'Thinking…', ur: 'سوچ رہے ہیں…' },
  conciergeDismissButtonLabel: { en: 'Not now', ur: 'ابھی نہیں' },
  conciergeConfirmDraftHeading: {
    en: 'Ready to send this request?',
    ur: 'کیا یہ درخواست بھیجنی ہے؟',
  },
  conciergeModeSwitcherLabel: { en: 'Concierge mode', ur: 'قونصیرج موڈ' },
  conciergeModeTypeLabel: { en: 'Type', ur: 'لکھیں' },
  conciergeModeTalkLabel: { en: 'Talk', ur: 'بات کریں' },
  voicePanelHeading: { en: 'Talk to Cladium', ur: 'کلیڈیم سے بات کریں' },
  voicePanelIntro: {
    en: "Start a voice call with the concierge. You can ask about the menu, hours, or start a table or event request — you'll always review and confirm on screen before anything is sent.",
    ur: 'قونصیرج کے ساتھ صوتی کال شروع کریں۔ آپ مینو، اوقات کے بارے میں پوچھ سکتے ہیں، یا میز یا تقریب کی درخواست شروع کر سکتے ہیں — کچھ بھیجنے سے پہلے آپ ہمیشہ اسکرین پر جائزہ لے کر تصدیق کریں گے۔',
  },
  voiceStartCallButtonLabel: { en: 'Start voice call', ur: 'صوتی کال شروع کریں' },
  voiceEndCallButtonLabel: { en: 'End call', ur: 'کال ختم کریں' },
  voiceMuteButtonLabel: { en: 'Mute microphone', ur: 'مائیکروفون خاموش کریں' },
  voiceUnmuteButtonLabel: { en: 'Unmute microphone', ur: 'مائیکروفون آن کریں' },
  voiceStatusConnecting: { en: 'Connecting…', ur: 'رابطہ ہو رہا ہے…' },
  voiceStatusActive: { en: 'Call in progress', ur: 'کال جاری ہے' },
  voiceStatusListening: { en: 'Listening…', ur: 'سن رہے ہیں…' },
  voiceStatusSpeaking: { en: 'Speaking…', ur: 'بول رہے ہیں…' },
  voiceStatusEnded: { en: 'Call ended', ur: 'کال ختم ہو گئی' },
  voiceErrorPermissionDenied: {
    en: "We couldn't access your microphone. Please allow microphone access in your browser and try again.",
    ur: 'ہم آپ کے مائیکروفون تک رسائی حاصل نہیں کر سکے۔ براہ کرم اپنے براؤزر میں مائیکروفون تک رسائی کی اجازت دیں اور دوبارہ کوشش کریں۔',
  },
  voiceErrorDeviceLost: {
    en: 'We lost access to your microphone. Please check your device and try again.',
    ur: 'ہم نے آپ کے مائیکروفون تک رسائی کھو دی۔ براہ کرم اپنا آلہ چیک کریں اور دوبارہ کوشش کریں۔',
  },
  voiceErrorConnectionFailed: {
    en: "The call couldn't connect. Please check your connection and try again, or reach us on WhatsApp.",
    ur: 'کال منسلک نہیں ہو سکی۔ براہ کرم اپنا کنکشن چیک کریں اور دوبارہ کوشش کریں، یا ہم سے واٹس ایپ پر رابطہ کریں۔',
  },
  voiceErrorUnknown: {
    en: 'Something went wrong with the call. Please try again, or reach us on WhatsApp.',
    ur: 'کال میں کچھ غلط ہو گیا۔ براہ کرم دوبارہ کوشش کریں، یا ہم سے واٹس ایپ پر رابطہ کریں۔',
  },
  voiceTranscriptHeading: { en: 'Live transcript', ur: 'براہ راست ٹرانسکرپٹ' },
  voiceRecordingNotice: {
    en: 'This call is not recorded.',
    ur: 'یہ کال ریکارڈ نہیں کی جاتی۔',
  },
  voiceUnavailableNotice: {
    en: "Voice isn't available in this language yet — you can still type to the concierge.",
    ur: 'اس زبان میں آواز ابھی دستیاب نہیں ہے — آپ اب بھی قونصیرج کو لکھ سکتے ہیں۔',
  },
  /**
   * Step 35 (click-to-WhatsApp handoff hardening). Static, guest-neutral,
   * non-sensitive — never a template with a placeholder for guest-supplied
   * data. `lib/business/whatsapp-link.ts` is the only place this is read;
   * it is the entire prefilled `?text=` content, so it structurally cannot
   * carry PII (`release-gates-v2.md` Gate 8: "avoids exposing customer data
   * in a prefilled URL unless the guest explicitly chooses it" — this
   * function accepts no guest input at all, so there is nothing to expose).
   */
  whatsappPrefilledMessage: {
    en: 'Hello! I have a question for Cladium Café & Resort.',
    ur: 'السلام علیکم! میرا Cladium Café & Resort سے متعلق ایک سوال ہے۔',
  },
  /** Step 35: "clear consent" — visible notice that the link leaves the site. */
  whatsappExternalNoticeText: {
    en: "Opens WhatsApp in a new tab. You'll leave this website to send your message.",
    ur: 'یہ واٹس ایپ کو ایک نئے ٹیب میں کھولتا ہے۔ اپنا پیغام بھیجنے کے لیے آپ اس ویب سائٹ سے باہر جائیں گے۔',
  },
  /**
   * Step 35: bilingual staff-escalation copy for the text/voice concierge's
   * safe fallback (`orchestrator.ts`'s `fallbackReply`/`escalationReply`).
   * `{whatsapp}` is a literal placeholder replaced with the approved
   * `WHATSAPP_DISPLAY` number at call time — the only interpolation this
   * file uses, reserved for this one locale-invariant business fact.
   */
  conciergeFallbackReply: {
    en: "Sorry, I couldn't finish that. Please try again, or reach us directly on WhatsApp ({whatsapp}).",
    ur: 'معذرت، میں یہ مکمل نہیں کر سکا۔ براہ کرم دوبارہ کوشش کریں، یا ہم سے براہ راست واٹس ایپ ({whatsapp}) پر رابطہ کریں۔',
  },
  conciergeEscalationReply: {
    en: 'That needs more than I can help with right now — please reach us on WhatsApp ({whatsapp}) and our team will help directly.',
    ur: 'اس کے لیے ابھی میری مدد کافی نہیں ہے — براہ کرم واٹس ایپ ({whatsapp}) پر ہم سے رابطہ کریں، ہماری ٹیم براہ راست آپ کی مدد کرے گی۔',
  },
} as const satisfies Record<string, ChromeCopy>;

export type ChromeKey = keyof typeof chrome;

export function chromeText(key: ChromeKey, locale: Locale): string {
  return chrome[key][locale];
}
