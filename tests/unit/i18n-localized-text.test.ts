import { describe, expect, it } from 'vitest';
import {
  canonicalLocalizedText,
  draftLocalizedText,
  ownerApprovedLocalizedText,
  resolveLocalizedText,
} from '../../src/lib/i18n/localized-text';
import type { NormalizedMenuItem } from '../../src/modules/menu/adapter';

describe('resolveLocalizedText (owner-approval fallback)', () => {
  it('renders English for a locale with no Urdu translation at all', () => {
    const text = canonicalLocalizedText('Chicken Karahi');
    expect(resolveLocalizedText(text, 'en')).toBe('Chicken Karahi');
    expect(resolveLocalizedText(text, 'ur')).toBe('Chicken Karahi');
  });

  it('still falls back to English for an unapproved (draft) Urdu candidate', () => {
    const text = draftLocalizedText('Chicken Karahi', 'چکن کڑاہی');
    expect(resolveLocalizedText(text, 'ur')).toBe('Chicken Karahi');
    expect(resolveLocalizedText(text, 'en')).toBe('Chicken Karahi');
  });

  it('renders owner-approved Urdu only on the Urdu locale', () => {
    const text = ownerApprovedLocalizedText('Chicken Karahi', 'چکن کڑاہی');
    expect(resolveLocalizedText(text, 'ur')).toBe('چکن کڑاہی');
    expect(resolveLocalizedText(text, 'en')).toBe('Chicken Karahi');
  });

  it('falls back to English if an owner-approved record is somehow missing its Urdu value', () => {
    const text = {
      en: 'Chicken Karahi',
      ur: null,
      urStatus: 'owner_approved' as const,
      sourceLanguage: 'en' as const,
    };
    expect(resolveLocalizedText(text, 'ur')).toBe('Chicken Karahi');
  });
});

describe('locale resolution never touches IDs or prices', () => {
  const item: NormalizedMenuItem = {
    stableId: 'starters.chicken-karahi',
    categoryStableId: 'starters',
    groupLabel: null,
    name: 'Chicken Karahi',
    basePricePkr: 1450,
    isSignature: true,
    serves: '2',
    quantityLabel: null,
    servedWith: null,
    sortOrder: 0,
  };

  it('resolving a localized name in either locale leaves stableId/price/quantity fields byte-identical', () => {
    const nameText = ownerApprovedLocalizedText(item.name, 'چکن کڑاہی');

    const beforeSnapshot = { ...item };

    const englishDisplayName = resolveLocalizedText(nameText, 'en');
    const urduDisplayName = resolveLocalizedText(nameText, 'ur');

    expect(englishDisplayName).toBe('Chicken Karahi');
    expect(urduDisplayName).toBe('چکن کڑاہی');

    // The item record itself is never a function of locale.
    expect(item).toEqual(beforeSnapshot);
    expect(item.stableId).toBe('starters.chicken-karahi');
    expect(item.basePricePkr).toBe(1450);
    expect(item.serves).toBe('2');
  });

  it('draft (unapproved) Urdu never leaks into a displayed price or ID field', () => {
    // There is no price field on LocalizedText at all — a draft/owner-approved
    // Urdu candidate can only ever carry text, structurally, so it cannot
    // smuggle a different price or ID in for either locale.
    const draft = draftLocalizedText(item.name, 'چکن کڑاہی (ڈرافٹ)');
    expect(Object.keys(draft)).toEqual(['en', 'ur', 'urStatus', 'sourceLanguage']);
    expect(resolveLocalizedText(draft, 'ur')).toBe(item.name);
    expect(item.basePricePkr).toBe(1450);
  });
});
