-- 0017: Record correction. No behavior change: COMMENT ON only.
-- The "WHY THE ALLOWLIST BRANCHES BELOW EXIST" comment in 0013 claims the
-- trigger "fires identically for direct owner writes and publish_business()
-- writes" because SECURITY DEFINER changes privileges, not current_user.
-- That reasoning is VOID on this stack: probed live (docs/live-runs), inside
-- a definer RPC current_user reports 'postgres' while the caller's JWT
-- claims stay visible. What actually routes RPC writes into the allowlist
-- branches is the uid-null requirement in the bypass rule (0015) combined
-- with the column grants keeping direct writes out -- not role identity.
-- The branches themselves are proven load-bearing by ablation
-- (docs/allowlist-ablation.md): deleting them breaks fresh publish and
-- null-trial fill while leaving direct-write enforcement intact.
comment on function app_private.force_business_owner() is
  'First-publish allowlist branches are load-bearing (proven by ablation): RPC writes arrive with current_user=postgres but intact JWT claims, so the uid-null bypass requirement plus column grants -- not role identity -- route them here.';
