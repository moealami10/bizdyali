-- 0005b: Ordering repair (runs before the 0006 demo seed).
-- The force_business_owner() trigger as written in 0003 calls
-- app_private.is_admin(), which is not created until 0008. Demo seed rows
-- (is_demo) therefore fail at 0006 with "schema app_private does not exist".
-- This file reorders ONLY the early-return checks (demo exemption first),
-- changing no enforcement semantics; 0008 moves the function as planned and
-- 0013 replaces its body wholesale. Temporary by design.
create or replace function public.force_business_owner()
returns trigger language plpgsql set search_path to public, pg_temp as $$
begin
  -- Service role (owner-run seeds/tests) bypasses forcing entirely.
  if current_setting('role', true) = 'service_role' then return new; end if;
  -- Server functions (publish_business) set this flag for their own writes.
  if current_setting('bizdyali.bypass_owner_force', true) = 'on' then return new; end if;
  -- Demo exemption evaluated BEFORE is_admin() so the 0006 seed does not
  -- depend on objects created in 0008. (Clients can never set is_demo:
  -- it is excluded from every column grant and from publish_business().)
  if coalesce(new.is_demo, false) then return new; end if;
  -- Admins are server-verified via the admins table (see is_admin()).
  if app_private.is_admin() then return new; end if;
  new.owner_id := auth.uid();
  if tg_op = 'INSERT' then
    new.published := false;
    new.trial_start := null;
    new.trial_end := null;
    new.subscription := 'none';
    new.suspended := false;
    new.is_demo := false;
    new.created_at := now();
  else
    -- UPDATE: server-owned columns cannot move through direct writes.
    -- Publishing / trial / subscription changes go through publish_business().
    new.owner_id := old.owner_id;
    new.published := old.published;
    new.trial_start := old.trial_start;
    new.trial_end := old.trial_end;
    new.subscription := old.subscription;
    new.suspended := old.suspended;
    new.is_demo := old.is_demo;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
