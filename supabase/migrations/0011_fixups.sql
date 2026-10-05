-- 0011: First-run fixes from live testing on a throwaway project.
-- (a) activity_log needs a SELECT grant; RLS policies alone do not confer
--     access, so admin reads were denied despite the correct policy.
-- (b) force_business_owner() body referenced public.is_admin(), which moved
--     to app_private in 0008 (bindings are by OID everywhere else, but
--     function BODIES are plain text). Recreated here with the fixed reference.

grant select on public.activity_log to authenticated;

create or replace function app_private.force_business_owner()
returns trigger language plpgsql set search_path to public, pg_temp as $$
begin
  -- Service role (owner-run seeds/tests) bypasses forcing entirely.
  if current_setting('role', true) = 'service_role' then return new; end if;
  -- Server functions (publish_business) set this flag for their own writes.
  if current_setting('bizdyali.bypass_owner_force', true) = 'on' then return new; end if;
  -- Admins are server-verified via the admins table (see is_admin()).
  if app_private.is_admin() then return new; end if;
  -- Demo seed rows bypass forcing (clients can never set is_demo:
  -- it is excluded from every column grant and from publish_business()).
  if coalesce(new.is_demo, false) then return new; end if;
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
