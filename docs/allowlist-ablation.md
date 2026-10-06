# Pending experiment: first-publish allowlist branches (deferred)

Status: RUN 2026-10-06 against production project — RED without branches (fresh publish + null-fill break), GREEN on restore. Branches are load-bearing: KEPT. Runs only after the live `tests/rls.js` green run, against
the throwaway project. Do not run against production.

## Question
Are the first-publish allowlist branches in `force_business_owner()`
(`0013`) load-bearing, or dead code? Two competing readings exist of how
`current_user` interacts with the bypass rule; argument is suspended pending
measurement.

## Procedure
1. Temporarily comment out the two allowlist branches (INSERT first-publish
   write + UPDATE first-publish transition), leaving all reverts in place.
2. Re-apply the trigger (`scripts/apply-migrations.js 0013` will NOT work
   alone for this — apply by hand in the SQL editor or a scratch file; do
   NOT commit the ablation).
3. Re-run `node tests/rls.js` in full.

## Decision rule
- Publish tests go red (fresh publish / null-trial fill fail) → branches are
  load-bearing; keep them and keep the justification comment as-is.
- Suite stays green → branches are dead code; delete them and the comment,
  and the bypass rule gets re-examined instead.

## Constraints for the run
- Throwaway project only (same `TEST_PROJECT_REF` guard applies).
- Restore the branches immediately afterwards; re-run the suite to confirm
  green before any further work.
