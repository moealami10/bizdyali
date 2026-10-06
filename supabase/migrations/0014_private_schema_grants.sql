-- 0014: First-run fix. Moving internals to app_private (0008) revoked the
-- default PUBLIC schema USAGE + function EXECUTE that trigger firing relied
-- on: every businesses write as service_role failed with
-- "permission denied for schema app_private", which silently emptied all
-- seeded rows (service inserts) and cascaded into total suite failure.
-- Trigger functions return trigger and cannot be abused by direct calls.
grant usage on schema app_private to service_role;
grant execute on function app_private.touch_updated_at() to service_role, authenticated;
grant execute on function app_private.force_business_owner() to service_role, authenticated;
grant execute on function app_private.validate_business_items() to service_role, authenticated;
grant execute on function app_private.handle_new_user() to service_role, authenticated;
