/**
 * Runbook Step 11 — deterministic menu publish plan.
 *
 * Decides whether a draft menu version is legal to publish and, if so,
 * computes the plan a later, separately reviewed step would execute inside a
 * transaction. This module never opens a database connection, never
 * publishes anything, and never grants approval itself — it only mirrors,
 * in code, the same gate the schema enforces by constraint:
 *
 *   - `menu_versions_publish_requires_approval` (published_at is null, or
 *     review_status = 'APPROVED' and approved_by/approved_at are set) —
 *     `supabase/migrations/20260824120003_menu_content.sql`.
 *   - `menu_versions_single_published` — at most one published version at a
 *     time, so publishing a new version also unpublishes the current one.
 *
 * Approval itself (setting `review_status`/`approved_by`/`approved_at`) is a
 * separate, owner-authorized action that happens before this plan is built.
 */

import { ok, err, type Result } from '../../lib/result';
import { appError, validationFailed, type AppError, type FieldIssue } from '../../lib/errors';

export type MenuReviewStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';

export interface PublishPlanCandidateVersion {
  readonly versionNumber: number;
  readonly reviewStatus: MenuReviewStatus;
  readonly approvedBy: string | null;
  readonly approvedAt: string | null;
  readonly publishedAt: string | null;
  readonly draftCategoryCount: number;
  readonly draftItemCount: number;
  readonly draftVariantCount: number;
}

export interface PublishPlanCurrentPublished {
  readonly versionNumber: number;
}

export interface PublishPlanRowTransition {
  readonly table: 'menu_categories' | 'menu_items' | 'menu_variants';
  readonly from: 'DRAFT';
  readonly to: 'PUBLISHED';
  readonly count: number;
}

export interface MenuPublishPlan {
  readonly versionNumberToPublish: number;
  /** Non-null when a different version is currently published and must be unpublished in the same transaction. */
  readonly versionNumberToUnpublish: number | null;
  readonly rowTransitions: readonly PublishPlanRowTransition[];
}

/**
 * Builds the publish plan, or `Err` when the approval gate is not met or the
 * candidate is already published. Mirrors `menu_versions_publish_requires_approval`
 * exactly so a caller cannot construct a plan the database would reject.
 */
export function buildMenuPublishPlan(
  candidate: PublishPlanCandidateVersion,
  currentPublished: PublishPlanCurrentPublished | null,
): Result<MenuPublishPlan, AppError> {
  if (candidate.publishedAt !== null) {
    return err(
      appError('CONFLICT', 'This menu version is already published.', {
        internalMessage: `menu version ${candidate.versionNumber} already has published_at set`,
      }),
    );
  }

  const issues: FieldIssue[] = [];
  if (candidate.reviewStatus !== 'APPROVED') {
    issues.push({ path: 'reviewStatus', code: 'approval_required' });
  }
  if (candidate.approvedBy === null) {
    issues.push({ path: 'approvedBy', code: 'approval_required' });
  }
  if (candidate.approvedAt === null) {
    issues.push({ path: 'approvedAt', code: 'approval_required' });
  }
  if (issues.length > 0) {
    return err(validationFailed(issues));
  }

  const rowTransitions: PublishPlanRowTransition[] = [
    {
      table: 'menu_categories',
      from: 'DRAFT',
      to: 'PUBLISHED',
      count: candidate.draftCategoryCount,
    },
    { table: 'menu_items', from: 'DRAFT', to: 'PUBLISHED', count: candidate.draftItemCount },
    { table: 'menu_variants', from: 'DRAFT', to: 'PUBLISHED', count: candidate.draftVariantCount },
  ];

  const versionNumberToUnpublish =
    currentPublished && currentPublished.versionNumber !== candidate.versionNumber
      ? currentPublished.versionNumber
      : null;

  return ok({
    versionNumberToPublish: candidate.versionNumber,
    versionNumberToUnpublish,
    rowTransitions,
  });
}
