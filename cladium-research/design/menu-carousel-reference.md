# Cladium menu carousel - video reference adaptation

## Reference scope

**Reference file:** `C:\Users\DELL\Downloads\WhatsApp Video 2026-08-18 at 12.13.11 AM.mp4`  
**Observed format:** 806 × 576, 34.43 seconds.

The source is a third-party food-menu interaction demonstration. It is not a Cladium asset and must never be shipped with the website. Do not copy its brand, food photos, text, price examples, TikTok watermark, curved decoration, or exact composition.

## Interaction worth adopting

The useful pattern is a compact, selection-driven feature carousel:

1. A category is selected.
2. A row of item selectors is shown for that category.
3. Choosing an item updates one cohesive “featured dish” presentation: title, valid current price/variant prompt, short approved description, selected state, and optional large approved dish photo.
4. The primary action opens the actual item detail/cart flow; it never directly submits an order.

The carousel is an editorial discovery feature, not the sole way to browse the menu. Full category filters, search, accessibility-friendly item lists, and direct item-detail links remain available.

## Cladium visual adaptation

Use a bright, warm luxury composition compatible with the supplied midnight-green and antique-gold crest:

- **Dominant canvas:** `--cladium-menu-canvas` and `--cladium-menu-panel`; do not use a near-black full-width stage like the reference.
- **Structure:** two-column desktop layout. The left panel contains category, item information, selectors, and action. The right panel is an airy sage/mist image stage with subtle forest and antique-gold linework.
- **Logo compatibility:** the official logo keeps its supplied appearance in the header. Avoid an oversized wordmark inside the carousel that competes with it.
- **Typography:** high-contrast editorial serif for the selected dish name; calm sans-serif for category, price, description, and controls.
- **Selected state:** an antique-gold 2px ring plus a forest focus outline. Inactive selectors use neutral/sage borders, not faded illegible text.
- **Media:** show a supplied, approved dish image only when `imageId` resolves to an approved asset. Otherwise use a graceful abstract Cladium place-setting/ingredient texture or a category monogram—never artificial food imagery or generic stock food.
- **Decorative detail:** one subtle gold contour/route line may reference mountain paths. It must remain purely decorative (`aria-hidden`) and never imitate the reference's dotted curve exactly.
- **Primary action:** `View dish` or `Add to takeaway order` according to state. It uses forest green with warm-ivory text; it must not promise availability, confirmation, payment, or delivery.

## Component contract

```text
MenuFeatureCarousel
├── CategoryTabs
├── FeaturedItemDetails
│   ├── category label
│   ├── item name
│   ├── current configured price or “Select size”
│   ├── approved short description (optional)
│   └── View dish / Add to takeaway order
├── ItemSelectorRail
└── FeatureMediaStage
```

Input must come from the runtime menu adapter, never hard-coded UI examples:

```ts
type CarouselItem = {
  id: string;
  name: string;
  categoryId: string;
  priceDisplay: string | null;
  shortDescription: string | null;
  imageId: string | null;
  isAvailable: boolean | null;
};
```

Unknown availability stays visibly unconfirmed; it must not be presented as “available now.” If a price depends on an unselected required variant, show `Select size or option` rather than choosing or calculating a price.

## Behaviour and responsive requirements

- Desktop: feature details and media are two columns. Item selectors are horizontally scrollable with visible focus and left/right controls when needed.
- Mobile (360px+): content becomes one column; details precede media; selector rail remains touch-scrollable with snap points; the action is comfortably thumb-reachable.
- Keyboard: category tabs and item selectors use arrow-key navigation, Enter/Space activation, and obvious focus indicators. Announce selected item changes in a concise `aria-live="polite"` region.
- Motion: cross-fade/translate the details and media in 180–250ms; respect `prefers-reduced-motion` by switching immediately. Never autoplay a carousel or move a user away from a selected item.
- Image loading: reserve the media aspect ratio, use optimized responsive images, and provide accurate alt text. Decorative shapes have empty alt text / `aria-hidden`.
- No image: preserve layout with the approved fallback; never leave a collapsing blank region.

## Acceptance criteria

- The carousel never contains fictional food, description, rate, availability, image, promotion, or dietary claim.
- A selection changes only the currently displayed item; it never mutates the cart until the visitor explicitly chooses the cart action.
- Required variants are selected explicitly before a cart action can succeed.
- Menu browsing, selection, and cart actions work with keyboard, touch, and reduced motion.
- The selected logo, contrast, and lighter palette pass visual review against the supplied Cladium crest.
- The carousel is tested at 360px, 768px, 1024px, and large desktop widths.
