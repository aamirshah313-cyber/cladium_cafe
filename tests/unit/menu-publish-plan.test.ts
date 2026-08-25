import { describe, expect, it } from 'vitest';
import {
  buildMenuPublishPlan,
  type PublishPlanCandidateVersion,
} from '../../src/modules/menu/publish-plan';

function approvedCandidate(
  overrides: Partial<PublishPlanCandidateVersion> = {},
): PublishPlanCandidateVersion {
  return {
    versionNumber: 2,
    reviewStatus: 'APPROVED',
    approvedBy: 'staff-owner-1',
    approvedAt: '2026-08-24T10:00:00.000Z',
    publishedAt: null,
    draftCategoryCount: 12,
    draftItemCount: 118,
    draftVariantCount: 18,
    ...overrides,
  };
}

describe('buildMenuPublishPlan', () => {
  it('plans the row transitions for an approved, unpublished candidate with nothing currently published', () => {
    const result = buildMenuPublishPlan(approvedCandidate(), null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.versionNumberToPublish).toBe(2);
    expect(result.value.versionNumberToUnpublish).toBeNull();
    expect(result.value.rowTransitions).toEqual([
      { table: 'menu_categories', from: 'DRAFT', to: 'PUBLISHED', count: 12 },
      { table: 'menu_items', from: 'DRAFT', to: 'PUBLISHED', count: 118 },
      { table: 'menu_variants', from: 'DRAFT', to: 'PUBLISHED', count: 18 },
    ]);
  });

  it('plans to unpublish the currently published version when it differs from the candidate', () => {
    const result = buildMenuPublishPlan(approvedCandidate({ versionNumber: 3 }), {
      versionNumber: 2,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.versionNumberToUnpublish).toBe(2);
  });

  it('rejects a candidate that is already published', () => {
    const result = buildMenuPublishPlan(
      approvedCandidate({ publishedAt: '2026-08-20T00:00:00.000Z' }),
      null,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('CONFLICT');
  });

  it('rejects a candidate that is not APPROVED', () => {
    const result = buildMenuPublishPlan(approvedCandidate({ reviewStatus: 'IN_REVIEW' }), null);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION_FAILED');
    expect(result.error.issues).toContainEqual({ path: 'reviewStatus', code: 'approval_required' });
  });

  it('rejects a candidate missing approvedBy or approvedAt even if review_status says APPROVED', () => {
    const result = buildMenuPublishPlan(
      approvedCandidate({ approvedBy: null, approvedAt: null }),
      null,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.issues).toContainEqual({ path: 'approvedBy', code: 'approval_required' });
    expect(result.error.issues).toContainEqual({ path: 'approvedAt', code: 'approval_required' });
  });
});
