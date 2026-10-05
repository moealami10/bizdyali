-- 0003: Grants, RLS, protective triggers. Default-deny, then open narrowly.
-- Convention: no table grants to anon at all (public reads go through the
-- 0004 RPCs). Column-level grants keep server-owned columns unwritable.

-- Start locked down.
revoke all on public.profiles, public.admins, public.businesses,
  public.drafts, public.activity_log from public, anon, authenticated;

alter table public.profiles enable row level security;
alter table public.admins enable row level security;
alter table public.businesses enable row level security;
alter table public.drafts enable row level security;
alter table public.activity_log enable row level security;

-- Defined here (not 0004) because policies below already reference it.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path to public as
  $$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;
revoke all on function public.is_admin() from public, anon, authenticated;

-- ---------- profiles ----------
-- No INSERT policy: rows come only from the auth.users trigger.
-- No UPDATE of phone: the column grant below excludes it.
grant select (id, phone, name, created_at) on public.profiles to authenticated;
grant update (name) on public.profiles to authenticated;
create policy profiles_self_select on public.profiles for select to authenticated
  using (id = auth.uid());
create policy profiles_admin_select on public.profiles for select to authenticated
  using (public.is_admin());
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------- admins ----------
-- No grants, no policies: readable only inside security-definer functions.

-- ---------- businesses ----------
-- INSERT covers safe columns only. UPDATE covers every column on purpose:
-- the force_business_owner trigger reverts server-owned columns for owners,
-- while server-verified admins pass through (their mutations are logged via
-- admin_set_status). Everything else (owner_id for owners, timestamps) stays
-- server-owned in all paths.
grant select on public.businesses to authenticated;
grant insert
  (name, category, description, phone, whatsapp, address, city, hours,
   facebook, instagram, offering_type, logo, cover, items, theme, hours_week,
   testimonials, trust, slug)
  on public.businesses to authenticated;
-- UPDATE covers every column on purpose: the trigger above reverts
-- server-owned columns for owners, while server-verified admins pass through.
grant update on public.businesses to authenticated;
grant delete on public.businesses to authenticated;

create policy businesses_self_all on public.businesses
  for all to authenticated using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
create policy businesses_admin_all on public.businesses
  for all to authenticated using (public.is_admin())
  with check (public.is_admin());

-- Belt-and-braces trigger: owner_id is forced, server columns are reset,
-- even if a grant below is ever widened by mistake.
create or replace function public.force_business_owner()
returns trigger language plpgsql set search_path to public as $$
begin
  -- Service role (owner-run seeds/tests) bypasses forcing entirely.
  if current_setting('role', true) = 'service_role' then return new; end if;
  -- Server functions (publish_business) set this flag for their own writes.
  if current_setting('bizdyali.bypass_owner_force', true) = 'on' then return new; end if;
  -- Admins are server-verified via the admins table (see is_admin()).
  if public.is_admin() then return new; end if;
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
create trigger businesses_force_owner before insert or update on public.businesses
  for each row execute function public.force_business_owner();

-- ---------- drafts ----------
grant select, insert, update, delete on public.drafts to authenticated;
create policy drafts_self_all on public.drafts
  for all to authenticated using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ---------- activity_log ----------
-- No grants: written by server functions, read by admins via is_admin().
create policy activity_admin_select on public.activity_log
  for select to authenticated using (public.is_admin());
