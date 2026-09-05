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
  // "Navigation", not "Menu": this site has a real food Menu page, and a
  // trigger labelled "Menu" that opens site navigation would be ambiguous
  // in both languages.
  menuDrawerOpenLabel: { en: 'Navigation', ur: 'نیویگیشن' },
  menuDrawerTitle: { en: 'Navigation', ur: 'نیویگیشن' },
  menuDrawerCloseLabel: { en: 'Close', ur: 'بند کریں' },
  // Footer column headings. Plain navigational labels — no marketing claim,
  // no invented contact channel.
  footerExploreLabel: { en: 'Explore', ur: 'دریافت کریں' },
  footerVisitLabel: { en: 'Visit', ur: 'وزٹ' },
  footerContactLabel: { en: 'Contact', ur: 'رابطہ' },
  footerDirectionsLinkLabel: { en: 'Open in Google Maps', ur: 'گوگل میپس میں کھولیں' },
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
  // The site's search-result and link-preview summary. Only confirmed
  // facts: the garden setting, the town, the hours, and that a table is
  // requested and staff-confirmed rather than instantly booked.
  siteMetaDescription: {
    en: 'A garden café and resort in Tarhana, near Abbottabad. Open 12 pm to 12 am. Browse the menu and request a table — our staff confirm every request.',
    ur: 'ترہانہ، ایبٹ آباد کے قریب ایک باغیچہ کیفے اور ریزورٹ۔ دوپہر 12 سے رات 12 بجے تک کھلا۔ مینو دیکھیں اور میز کی درخواست کریں — ہمارا عملہ ہر درخواست کی تصدیق کرتا ہے۔',
  },
  // Concierge transcript speaker labels. The speaker is named in text so
  // it is never conveyed by alignment or colour alone (WCAG 1.4.1).
  chatSpeakerYou: { en: 'You', ur: 'آپ' },
  chatSpeakerConcierge: { en: 'Concierge', ur: 'قونصیرج' },
  // Starter questions. Each is answerable from approved knowledge, and the
  // button's text is exactly what gets sent as the guest's message.
  conciergeStarterHours: { en: 'What are your opening hours?', ur: 'آپ کے اوقات کیا ہیں؟' },
  conciergeStarterDirections: { en: 'How do I get there?', ur: 'وہاں کیسے پہنچوں؟' },
  conciergeStarterSeating: { en: 'What seating do you have?', ur: 'آپ کے پاس کون سی نشست ہے؟' },
  conciergeStarterBirthday: {
    en: 'Can I arrange a birthday?',
    ur: 'کیا میں سالگرہ کا انتظام کر سکتا ہوں؟',
  },
  // Shown when the security token a form needs could not be obtained. It
  // names a retryable condition, because the form now retries on submit
  // rather than disabling itself.
  sessionUnavailableError: {
    en: 'We could not start a secure session. Please check your connection and try again.',
    ur: 'ہم محفوظ سیشن شروع نہیں کر سکے۔ براہ کرم اپنا کنکشن چیک کر کے دوبارہ کوشش کریں۔',
  },
  errorHomeLink: { en: 'Go to home page', ur: 'ہوم پیج پر جائیں' },
  notFoundHeading: { en: 'Page not found', ur: 'صفحہ نہیں ملا' },
  notFoundBody: {
    en: "The page you're looking for doesn't exist.",
    ur: 'جو صفحہ آپ تلاش کر رہے ہیں وہ موجود نہیں ہے۔',
  },
  // Homepage section headings and the two hero actions. Navigational and
  // descriptive only — no claim about quality, awards, or availability, and
  // nothing here promises a confirmed booking.
  homeExploreMenuCtaLabel: { en: 'Explore the Menu', ur: 'مینو دیکھیں' },
  homePlaceHeading: { en: 'The garden', ur: 'باغ' },
  homeExperiencesHeading: { en: 'Seating and celebrations', ur: 'نشست اور تقریبات' },
  homeSeatingHeading: { en: 'Garden and treehouse seating', ur: 'باغ اور ٹری ہاؤس کی نشست' },
  homeCelebrationsHeading: { en: 'Birthdays and events', ur: 'سالگرہ اور تقریبات' },
  homeDiningHeading: { en: 'From the kitchen', ur: 'باورچی خانے سے' },
  homeDiningCaption: {
    en: 'Photographs show each category, not a specific dish.',
    ur: 'تصاویر ہر زمرے کی نمائندگی کرتی ہیں، کسی مخصوص ڈش کی نہیں۔',
  },
  homeVisitHeading: { en: 'Finding us', ur: 'ہم تک پہنچنا' },
  homeClosingHeading: { en: 'Reserve your table', ur: 'اپنی میز محفوظ کریں' },
  // Per-page search-result and link-preview summaries. Each describes only
  // what the page actually offers — never availability, a confirmed
  // booking, delivery, or a facility the venue has not confirmed.
  menuMetaDescription: {
    en: 'Browse the full Cladium menu — grills, karahi, pasta, wok dishes, sandwiches and drinks, with current prices in PKR.',
    ur: 'کلیڈیم کا مکمل مینو دیکھیں — گرل، کڑاہی، پاستا، ووک ڈشز، سینڈوچ اور مشروبات، موجودہ قیمتوں کے ساتھ۔',
  },
  bookMetaDescription: {
    en: 'Request a table in the garden or the treehouse. Tell us your date, time and group size, and our staff confirm every request.',
    ur: 'باغ یا ٹری ہاؤس میں میز کی درخواست کریں۔ ہمیں اپنی تاریخ، وقت اور افراد کی تعداد بتائیں، ہمارا عملہ ہر درخواست کی تصدیق کرتا ہے۔',
  },
  eventMetaDescription: {
    en: 'Plan a birthday or event at Cladium. Décor starts from PKR 8,000; final price and availability are confirmed by our staff.',
    ur: 'کلیڈیم میں سالگرہ یا تقریب کی منصوبہ بندی کریں۔ ڈیکور PKR 8,000 سے شروع؛ حتمی قیمت اور دستیابی کی تصدیق ہمارا عملہ کرتا ہے۔',
  },
  visitMetaDescription: {
    en: 'Find Cladium in Tarhana, near Abbottabad — directions, opening hours and how to reach us on WhatsApp.',
    ur: 'ترہانہ، ایبٹ آباد کے قریب کلیڈیم تک پہنچیں — راستہ، اوقات، اور واٹس ایپ پر رابطہ۔',
  },
  conciergeMetaDescription: {
    en: 'Ask the Cladium concierge about the menu, opening hours, directions, seating or celebrations.',
    ur: 'کلیڈیم قونصیرج سے مینو، اوقات، راستے، نشست یا تقریبات کے بارے میں پوچھیں۔',
  },
  privacyMetaDescription: {
    en: 'How Cladium handles your information, and the choices available to you.',
    ur: 'کلیڈیم آپ کی معلومات کو کیسے استعمال کرتا ہے، اور آپ کے پاس کون سے اختیارات ہیں۔',
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
  carouselCategoryTablistLabel: { en: 'Menu categories', ur: 'مینو کے زمرے' },
  carouselItemListboxLabel: { en: 'Items in this category', ur: 'اس زمرے میں آئٹمز' },
  carouselSelectSizeLabel: { en: 'Select size or option', ur: 'سائز یا آپشن منتخب کریں' },
  carouselAddToOrderLabel: { en: 'Add to takeaway order', ur: 'ٹیک وے آرڈر میں شامل کریں' },
  carouselAddedConfirmationText: {
    en: 'Added to your order',
    ur: 'آپ کے آرڈر میں شامل کر دیا گیا',
  },
  carouselOrderItemCountLabel: { en: 'Items in your order', ur: 'آپ کے آرڈر میں آئٹمز' },
  carouselOrderSubtotalLabel: { en: 'Subtotal', ur: 'ذیلی مجموعہ' },
  carouselOrderingUnavailableText: {
    en: "Ordering isn't available right now — browsing still works.",
    ur: 'ابھی آرڈر کرنا دستیاب نہیں — براؤزنگ اب بھی کام کرتی ہے۔',
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
  // Notes shown under each seating choice. Both restate the approved
  // position exactly: general seating is ample, treehouse is limited and
  // staff-confirmed. Neither promises availability.
  seatingGeneralNote: { en: 'Tables across the garden.', ur: 'باغ میں میزیں۔' },
  seatingTreehouseNote: {
    en: 'Limited capacity — confirmed by our staff.',
    ur: 'محدود گنجائش — ہمارے عملے سے تصدیق شدہ۔',
  },
  // Page ledes. Each says plainly that this is a request awaiting staff
  // confirmation, never a booking.
  bookPageLede: {
    en: 'Tell us when you would like to come and how many people you are. Our staff confirm every request directly.',
    ur: 'ہمیں بتائیں کہ آپ کب آنا چاہتے ہیں اور کتنے افراد ہیں۔ ہمارا عملہ ہر درخواست کی براہ راست تصدیق کرتا ہے۔',
  },
  // Restates the approved décor position wherever décor is offered as a
  // choice. "From" and "confirmed by staff" are both load-bearing: neither
  // may be dropped to make the option look simpler.
  eventDecorPricingNote: {
    en: 'From PKR 8,000. Final price and availability are confirmed by our staff.',
    ur: 'PKR 8,000 سے۔ حتمی قیمت اور دستیابی کی تصدیق ہمارا عملہ کرتا ہے۔',
  },
  eventPageLede: {
    en: 'Tell us about the occasion and our staff will come back to you with what is possible.',
    ur: 'ہمیں تقریب کے بارے میں بتائیں اور ہمارا عملہ آپ کو بتائے گا کہ کیا ممکن ہے۔',
  },
  visitPageLede: {
    en: 'Where to find us, when we are open, and how to reach us.',
    ur: 'ہم کہاں ہیں، کب کھلے ہوتے ہیں، اور ہم سے کیسے رابطہ کریں۔',
  },
  conciergePageLede: {
    en: 'Ask about the menu, hours, directions, seating or celebrations.',
    ur: 'مینو، اوقات، راستے، نشست یا تقریبات کے بارے میں پوچھیں۔',
  },
  menuPageLede: {
    en: 'Every dish, variant and current price, straight from the kitchen’s own menu.',
    ur: 'ہر ڈش، قسم اور موجودہ قیمت، باورچی خانے کے اپنے مینو سے۔',
  },
  // The supporting column beside the booking form.
  bookWhatHappensHeading: { en: 'What happens next', ur: 'آگے کیا ہوگا' },
  bookWhatHappensBody: {
    en: 'You will see your details to check before anything is sent. After you confirm, our staff review the request and contact you on the number you gave us.',
    ur: 'کچھ بھی بھیجنے سے پہلے آپ اپنی تفصیلات دیکھ کر جانچ سکیں گے۔ تصدیق کے بعد، ہمارا عملہ درخواست کا جائزہ لے کر آپ کے دیے گئے نمبر پر رابطہ کرے گا۔',
  },
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
  /** Step 36 (consent and privacy controls). */
  navPrivacyLabel: { en: 'Privacy', ur: 'رازداری' },
  privacyPageHeading: { en: 'Privacy and consent', ur: 'رازداری اور رضامندی' },
  privacyNoticeUnavailableHeading: {
    en: "Our full privacy notice isn't published yet",
    ur: 'ہماری مکمل رازداری کی پالیسی ابھی شائع نہیں ہوئی',
  },
  privacyNoticeUnavailableBody: {
    en: 'The complete privacy notice and data-retention schedule are being reviewed by the business owner before publication. For any privacy question in the meantime, please contact us on WhatsApp.',
    ur: 'مکمل رازداری کی پالیسی اور ڈیٹا رکھنے کا شیڈول اشاعت سے پہلے کاروبار کے مالک کے زیرِ جائزہ ہے۔ اس دوران کسی بھی رازداری سے متعلق سوال کے لیے، براہ کرم ہم سے واٹس ایپ پر رابطہ کریں۔',
  },
  consentPreferencesHeading: { en: 'Your consent preferences', ur: 'آپ کی رضامندی کی ترجیحات' },
  consentPreferencesIntro: {
    en: 'Essential preferences, Meta marketing, microphone access, and recording are tracked separately. You can change any of them here at any time.',
    ur: 'بنیادی ترجیحات، Meta مارکیٹنگ، مائیکروفون تک رسائی، اور ریکارڈنگ کو الگ الگ ٹریک کیا جاتا ہے۔ آپ ان میں سے کسی کو بھی کسی بھی وقت یہاں تبدیل کر سکتے ہیں۔',
  },
  consentEssentialLabel: { en: 'Essential preferences', ur: 'بنیادی ترجیحات' },
  consentEssentialDescription: {
    en: 'Remembers your language and Day/Night theme choice. Required for the site to work, so this is always on.',
    ur: 'آپ کی زبان اور ڈے/نائٹ تھیم کا انتخاب یاد رکھتا ہے۔ سائٹ کے کام کرنے کے لیے ضروری ہے، اس لیے یہ ہمیشہ فعال رہتا ہے۔',
  },
  consentMetaMarketingLabel: { en: 'Meta marketing', ur: 'Meta مارکیٹنگ' },
  consentMetaMarketingDescription: {
    en: 'Lets us measure how guests use the site for Meta advertising. Off by default; currently not in use.',
    ur: 'ہمیں Meta اشتہارات کے لیے یہ ناپنے دیتا ہے کہ مہمان سائٹ کو کیسے استعمال کرتے ہیں۔ بطور ڈیفالٹ بند ہے؛ فی الحال استعمال میں نہیں۔',
  },
  consentMicrophoneLabel: { en: 'Microphone access', ur: 'مائیکروفون تک رسائی' },
  consentMicrophoneDescription: {
    en: 'Required before starting a voice call with the concierge. Off by default.',
    ur: 'قونصیرج کے ساتھ صوتی کال شروع کرنے سے پہلے درکار ہے۔ بطور ڈیفالٹ بند ہے۔',
  },
  consentRecordingLabel: { en: 'Call recording', ur: 'کال ریکارڈنگ' },
  consentRecordingDescription: {
    en: 'Voice calls are not recorded today. This stays off unless recording is enabled in the future, with its own separate notice.',
    ur: 'صوتی کالیں آج ریکارڈ نہیں کی جاتیں۔ یہ بند رہے گا جب تک مستقبل میں ریکارڈنگ کو اپنے الگ نوٹس کے ساتھ فعال نہ کیا جائے۔',
  },
  consentAlwaysOnLabel: { en: 'Always on', ur: 'ہمیشہ فعال' },
  consentGrantedStatusLabel: { en: 'Allowed', ur: 'اجازت شدہ' },
  consentNotGrantedStatusLabel: { en: 'Not allowed', ur: 'اجازت نہیں' },
  consentGrantButtonLabel: { en: 'Allow', ur: 'اجازت دیں' },
  consentRevokeButtonLabel: { en: 'Turn off', ur: 'بند کریں' },
  consentStaleNotice: {
    en: 'Our policy for this changed since you last chose. Please review it again.',
    ur: 'آپ کے آخری انتخاب کے بعد سے اس کی پالیسی تبدیل ہو گئی ہے۔ براہ کرم دوبارہ جائزہ لیں۔',
  },
  voiceMicrophoneConsentPrompt: {
    en: 'Starting a voice call needs your consent to use the microphone.',
    ur: 'صوتی کال شروع کرنے کے لیے مائیکروفون استعمال کرنے کی آپ کی رضامندی درکار ہے۔',
  },
  voiceMicrophoneConsentAllowLabel: {
    en: 'Allow microphone access',
    ur: 'مائیکروفون تک رسائی کی اجازت دیں',
  },
} as const satisfies Record<string, ChromeCopy>;

export type ChromeKey = keyof typeof chrome;

export function chromeText(key: ChromeKey, locale: Locale): string {
  return chrome[key][locale];
}
