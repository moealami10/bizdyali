-- 0004: Security-definer functions. Every function pins search_path and is
-- revoked from PUBLIC/anon except where explicitly granted below.

-- New-user profile. Trigger only: phone comes from the verified OTP session.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to public, pg_temp as $$
begin
  insert into public.profiles (id, phone, name)
  values (new.id, coalesce(new.phone, ''), coalesce(new.raw_user_meta_data ->> 'name', ''))
  on conflict (id) do nothing;
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Publish flow. Validates fields, upserts the owner's row, and sets the
-- 14-day trial window ON FIRST PUBLISH ONLY. Never extends an existing trial.
create or replace function public.publish_business(p_slug text, p_data jsonb)
returns public.businesses language plpgsql security definer set search_path to public, pg_temp as $$
declare
  v_slug citext := lower(trim(both from coalesce(p_slug, '')));
  v_row public.businesses%rowtype;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'bad slug'; end if;
  if v_slug in ('admin','api','auth','login','dashboard','create','index','terms','privacy') then raise exception 'reserved slug'; end if;
  if coalesce(length(trim(both from coalesce(p_data ->> 'name', ''))), 0) < 2 then raise exception 'name required'; end if;
  if coalesce(p_data ->> 'category', '') = '' then raise exception 'category required'; end if;
  if coalesce(length(coalesce(p_data ->> 'description', '')), 0) < 10 then raise exception 'description too short'; end if;
  perform set_config('bizdyali.bypass_owner_force', 'on', true);
  select * into v_row from public.businesses where owner_id = auth.uid() and slug = v_slug;
  if not found then
    insert into public.businesses
      (owner_id, slug, name, category, description, phone, whatsapp, address, city, hours,
       facebook, instagram, offering_type, logo, cover, items, theme, hours_week, testimonials, trust,
       published, trial_start, trial_end)
    values
      (auth.uid(), v_slug, p_data ->> 'name', p_data ->> 'category', coalesce(p_data ->> 'description', ''),
       coalesce(p_data ->> 'phone', ''), coalesce(p_data ->> 'whatsapp', ''), coalesce(p_data ->> 'address', ''),
       coalesce(p_data ->> 'city', ''), coalesce(p_data ->> 'hours', ''), coalesce(p_data ->> 'facebook', ''),
       coalesce(p_data ->> 'instagram', ''), coalesce(p_data ->> 'offeringType', 'both'),
       coalesce(p_data ->> 'logo', ''), coalesce(p_data ->> 'cover', ''),
       coalesce(p_data -> 'items', '[]'), coalesce(p_data -> 'theme', '{}'), p_data -> 'hoursWeek',
       coalesce(p_data -> 'testimonials', '[]'), coalesce(p_data -> 'trust', '[]'),
       true, now(), now() + interval '14 days')
    returning * into v_row;
    insert into public.activity_log (type, actor, actor_name, business_id, business_name, owner_id, details)
    values ('business_created', 'owner', '', v_row.id, v_row.name, auth.uid(), 'published'),
           ('trial_started', 'system', '', v_row.id, v_row.name, auth.uid(), '14-day trial');
  else
    update public.businesses set
      name = p_data ->> 'name', category = p_data ->> 'category',
      description = coalesce(p_data ->> 'description', description),
      phone = coalesce(p_data ->> 'phone', phone), whatsapp = coalesce(p_data ->> 'whatsapp', whatsapp),
      address = coalesce(p_data ->> 'address', address), city = coalesce(p_data ->> 'city', city),
      hours = coalesce(p_data ->> 'hours', hours), facebook = coalesce(p_data ->> 'facebook', facebook),
      instagram = coalesce(p_data ->> 'instagram', instagram),
      offering_type = coalesce(p_data ->> 'offeringType', offering_type),
      logo = coalesce(p_data ->> 'logo', logo), cover = coalesce(p_data ->> 'cover', cover),
      items = coalesce(p_data -> 'items', items), theme = coalesce(p_data -> 'theme', theme),
      hours_week = coalesce(p_data -> 'hoursWeek', hours_week),
      testimonials = coalesce(p_data -> 'testimonials', testimonials),
      trust = coalesce(p_data -> 'trust', trust), published = true
    where id = v_row.id returning * into v_row;
  end if;
  return v_row;
end $$;
revoke all on function public.publish_business(text, jsonb) from public, anon, authenticated;
grant execute on function public.publish_business(text, jsonb) to authenticated;

-- Admin lifecycle mutations (trial extension, mark paid/unpaid, suspend).
-- The ONLY path that moves server-owned columns; every call is logged.
create or replace function public.admin_set_status(p_business_id uuid, p_trial_end timestamptz,
  p_subscription text, p_suspended boolean)
returns public.businesses language plpgsql security definer set search_path to public, pg_temp as $$
declare v_row public.businesses%rowtype;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if p_subscription is not null and p_subscription not in ('none', 'active') then raise exception 'bad subscription'; end if;
  perform set_config('bizdyali.bypass_owner_force', 'on', true);
  update public.businesses set
    trial_end = coalesce(p_trial_end, trial_end),
    subscription = coalesce(p_subscription, subscription),
    suspended = coalesce(p_suspended, suspended)
  where id = p_business_id returning * into v_row;
  if not found then raise exception 'business not found'; end if;
  insert into public.activity_log (type, actor, actor_name, business_id, business_name, owner_id, details)
  values ('admin_action', 'admin', '', v_row.id, v_row.name, v_row.owner_id,
    'status: trial_end=' || coalesce(v_row.trial_end::text, 'null')
    || ' subscription=' || v_row.subscription || ' suspended=' || v_row.suspended);
  return v_row;
end $$;
revoke all on function public.admin_set_status(uuid, timestamptz, text, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_status(uuid, timestamptz, text, boolean) to authenticated;

-- Internal event writer. Deliberately NOT granted to any client role.
create or replace function public.log_event(p_type text, p_actor text, p_actor_name text,
  p_business_id uuid, p_business_name text, p_owner_id uuid, p_details text)
returns void language sql security definer set search_path to public, pg_temp as
  $$ insert into public.activity_log (type, actor, actor_name, business_id, business_name, owner_id, details)
     values (p_type, p_actor, p_actor_name, p_business_id, p_business_name, p_owner_id, p_details) $$;
revoke all on function public.log_event(text, text, text, uuid, text, uuid, text) from public, anon, authenticated;

-- Public page reader. Live pages: full safe columns. Expired/suspended:
-- name + status only (the "unavailable" page still works). Nothing otherwise.
-- NEVER returns owner_id, profiles, or login phones.
create or replace function public.public_business(p_slug text)
returns jsonb language plpgsql stable security definer set search_path to public, pg_temp as $$
declare v public.businesses%rowtype;
begin
  select * into v from public.businesses
   where slug = lower(trim(both from coalesce(p_slug, ''))) and published;
  if not found then return null; end if;
  if v.suspended or (v.subscription <> 'active' and v.trial_end is not null and v.trial_end < now()) then
    return jsonb_build_object('name', v.name, 'status', 'unavailable', 'slug', v.slug);
  end if;
  return jsonb_build_object('slug', v.slug, 'name', v.name, 'category', v.category,
    'description', v.description, 'phone', v.phone, 'whatsapp', v.whatsapp,
    'logo', v.logo, 'cover', v.cover,
    'address', v.address, 'city', v.city, 'hours', v.hours, 'facebook', v.facebook,
    'instagram', v.instagram, 'offeringType', v.offering_type, 'items', v.items,
    'theme', v.theme, 'hoursWeek', v.hours_week, 'testimonials', v.testimonials, 'trust', v.trust);
end $$;
revoke all on function public.public_business(text) from public, anon, authenticated;
grant execute on function public.public_business(text) to anon, authenticated;

-- Public directory. Limited columns only.
create or replace function public.public_directory()
returns jsonb language sql stable security definer set search_path to public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'name', name, 'category', category,
    'city', city, 'cover', cover, 'logo', logo, 'isDemo', is_demo)
    order by created_at desc), '[]')
  from public.businesses
  where published and not suspended
    and (subscription = 'active' or trial_end is null or trial_end >= now()) $$;
revoke all on function public.public_directory() from public, anon, authenticated;
grant execute on function public.public_directory() to anon, authenticated;
