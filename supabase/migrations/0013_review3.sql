-- 0013: Independent-review batch. One file, no edits to 0001-0012.
-- (a) Trigger: no GUC flag, no is_demo bypass. Bypass only for non-login
--     roles or is_admin(). First-publish transitions are allowlisted by
--     shape (grants make them RPC-only reachable); everything else reverts.
-- (b) UPDATE grant narrowed to the explicit safe-column list.
-- (c) publish_business(): phone claim required, trial set when null, owner
--     trial window (anti-farming). Public liveness excludes null trials.
-- (d) Owner policies require a phone claim. (e) Regex + kind + name fixes.
-- (f) Per-owner page cap (5) + owner trial window (profiles.trial_started_at).

-- ---------- (f) owner trial window ----------
alter table public.profiles add column if not exists trial_started_at timestamptz;
alter table public.profiles
  drop constraint if exists profiles_name_len;
alter table public.profiles
  add constraint profiles_name_len check (char_length(name) <= 120);

-- ---------- (a) forcing trigger, rewritten ----------
create or replace function app_private.force_business_owner()
returns trigger language plpgsql set search_path to public, pg_temp as $$
declare
  v_count integer;
  v_ostart timestamptz;
  v_ts timestamptz;
begin
  -- Bypass: anyone who did not arrive as anon/authenticated, or a
  -- server-verified admin. Everyone else is forced below.
  if current_user not in ('authenticated', 'anon') or app_private.is_admin() then
    return new;
  end if;
  new.owner_id := auth.uid();
  -- Per-owner page cap (trial-farming + abuse brake; demo/service bypass above).
  select count(*) into v_count from public.businesses where owner_id = new.owner_id;
  if tg_op = 'INSERT' and v_count >= 5 then
    raise exception 'business limit reached';
  end if;
  if tg_op = 'INSERT' and new.published is true and new.trial_start is not null then
    -- First-publish write. Unreachable directly (grants exclude these columns),
    -- so only publish_business() gets here. Normalize defensively.
    select trial_started_at into v_ostart from public.profiles where id = new.owner_id;
    v_ts := coalesce(new.trial_start, now());
    new.trial_start := v_ts;
    new.trial_end := least(new.trial_start + interval '14 days',
                           coalesce(v_ostart, new.trial_start) + interval '14 days');
    new.subscription := 'none';
    new.suspended := false;
    new.is_demo := false;
  elsif tg_op = 'UPDATE' and old.published = false and old.trial_start is null
        and new.published is true then
    -- First-publish transition on republish path. Same reachability argument.
    select trial_started_at into v_ostart from public.profiles where id = new.owner_id;
    v_ts := coalesce(new.trial_start, now());
    new.trial_start := v_ts;
    new.trial_end := least(new.trial_start + interval '14 days',
                           coalesce(v_ostart, new.trial_start) + interval '14 days');
    new.subscription := 'none';
    new.suspended := false;
    new.owner_id := old.owner_id;
    new.is_demo := old.is_demo;
    new.created_at := old.created_at;
  else
    -- Default: server-owned columns cannot move through direct writes.
    if tg_op = 'INSERT' then
      new.published := false;
      new.trial_start := null;
      new.trial_end := null;
      new.subscription := 'none';
      new.suspended := false;
      new.is_demo := false;
    else
      new.owner_id := old.owner_id;
      new.published := old.published;
      new.trial_start := old.trial_start;
      new.trial_end := old.trial_end;
      new.subscription := old.subscription;
      new.suspended := old.suspended;
      new.is_demo := old.is_demo;
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end $$;

-- ---------- (b) explicit UPDATE column list (was whole-table) ----------
revoke update on public.businesses from authenticated;
grant update
  (name, category, description, phone, whatsapp, address, city, hours,
   facebook, instagram, offering_type, logo, cover, items, theme, hours_week,
   testimonials, trust, slug)
  on public.businesses to authenticated;
-- NOTE: admin direct writes to server columns now fail at grant level too;
-- admin_set_status() remains the only path (it is exempt in the trigger).

-- ---------- (c) publish: phone claim, null-trial fill, owner window ----------
create or replace function public.publish_business(p_slug text, p_data jsonb)
returns public.businesses language plpgsql security definer set search_path to public, pg_temp as $$
declare
  v_slug citext := lower(trim(both from coalesce(p_slug, '')));
  v_row public.businesses%rowtype;
  v_owner_start timestamptz;
  v_ts timestamptz;
  v_te timestamptz;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if coalesce((auth.jwt() ->> 'phone'), '') = '' then raise exception 'phone required'; end if;
  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'bad slug'; end if;
  if v_slug in ('admin','api','auth','login','dashboard','create','index','terms','privacy') then raise exception 'reserved slug'; end if;
  if coalesce(length(trim(both from coalesce(p_data ->> 'name', ''))), 0) < 2 then raise exception 'name required'; end if;
  if coalesce(p_data ->> 'category', '') = '' then raise exception 'category required'; end if;
  if coalesce(length(coalesce(p_data ->> 'description', '')), 0) < 10 then raise exception 'description too short'; end if;
  -- Owner trial window: set once, bounds every business trial (delete +
  -- recreate buys nothing because the window surv lives on the profile).
  update public.profiles set trial_started_at = coalesce(trial_started_at, now())
   where id = auth.uid() returning trial_started_at into v_owner_start;
  if v_owner_start is null then v_owner_start := now(); end if;
  select * into v_row from public.businesses where owner_id = auth.uid() and slug = v_slug;
  if not found then
    v_ts := now();
    v_te := least(now() + interval '14 days', v_owner_start + interval '14 days');
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
       true, v_ts, v_te)
    returning * into v_row;
    insert into public.activity_log (type, actor, actor_name, business_id, business_name, owner_id, details)
    values ('business_created', 'owner', '', v_row.id, v_row.name, auth.uid(), 'published'),
           ('trial_started', 'system', '', v_row.id, v_row.name, auth.uid(), '14-day trial');
  else
    -- Trial dates are filled when null (first publish, legacy rows) and
    -- never touched once set: republishing cannot extend a trial.
    if v_row.trial_start is null or v_row.trial_end is null then
      v_ts := now();
      v_te := least(now() + interval '14 days', v_owner_start + interval '14 days');
    else
      v_ts := v_row.trial_start;
      v_te := v_row.trial_end;
    end if;
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
      trust = coalesce(p_data -> 'trust', trust), published = true,
      trial_start = v_ts, trial_end = v_te
    where id = v_row.id returning * into v_row;
  end if;
  return v_row;
end $$;
-- Live = not suspended AND (demo OR paid OR an unexpired non-null trial).
-- Null-trial non-demo rows are dark by construction.
create or replace function public.public_business(p_slug text)
returns jsonb language plpgsql stable security definer set search_path to public, pg_temp as $$
declare v public.businesses%rowtype;
begin
  select * into v from public.businesses
   where slug = lower(trim(both from coalesce(p_slug, ''))) and published;
  if not found then return null; end if;
  if v.suspended or not (v.is_demo or v.subscription = 'active'
     or (v.trial_end is not null and v.trial_end >= now())) then
    return jsonb_build_object('name', v.name, 'status', 'unavailable', 'slug', v.slug);
  end if;
  return jsonb_build_object('slug', v.slug, 'name', v.name, 'category', v.category,
    'description', v.description, 'phone', v.phone, 'whatsapp', v.whatsapp,
    'logo', v.logo, 'cover', v.cover,
    'address', v.address, 'city', v.city, 'hours', v.hours, 'facebook', v.facebook,
    'instagram', v.instagram, 'offeringType', v.offering_type, 'items', v.items,
    'theme', v.theme, 'hoursWeek', v.hours_week, 'testimonials', v.testimonials, 'trust', v.trust);
end $$;
create or replace function public.public_directory()
returns jsonb language sql stable security definer set search_path to public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'name', name, 'category', category,
    'city', city, 'cover', cover, 'logo', logo, 'isDemo', is_demo)
    order by created_at desc), '[]')
  from public.businesses
  where published and not suspended
    and (is_demo or subscription = 'active'
         or (trial_end is not null and trial_end >= now())) $$;

-- ---------- (d) phone claim required in owner policies ----------
drop policy if exists businesses_self_all on public.businesses;
create policy businesses_self_all on public.businesses
  for all to authenticated using (owner_id = auth.uid() and coalesce((auth.jwt() ->> 'phone'), '') <> '')
  with check (owner_id = auth.uid() and coalesce((auth.jwt() ->> 'phone'), '') <> '');
drop policy if exists drafts_self_all on public.drafts;
create policy drafts_self_all on public.drafts
  for all to authenticated using (owner_id = auth.uid() and coalesce((auth.jwt() ->> 'phone'), '') <> '')
  with check (owner_id = auth.uid() and coalesce((auth.jwt() ->> 'phone'), '') <> '');
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles for select to authenticated
  using (id = auth.uid() and coalesce((auth.jwt() ->> 'phone'), '') <> '');
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid() and coalesce((auth.jwt() ->> 'phone'), '') <> '')
  with check (id = auth.uid() and coalesce((auth.jwt() ->> 'phone'), '') <> '');

-- ---------- (e) regex + kind fixes ----------
create or replace function app_private.handle_new_user()
returns trigger language plpgsql security definer set search_path to public, pg_temp as $$
begin
  begin
    insert into public.profiles (id, phone, name)
    values (new.id, regexp_replace(coalesce(new.phone, ''), '^\+', ''),
            coalesce(new.raw_user_meta_data ->> 'name', ''))
    on conflict (id) do nothing;
  exception when others then
    -- Observable but non-fatal: signup proceeds; ensure_profile() backstops.
    raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
  end;
  return new;
end $$;
create or replace function public.ensure_profile()
returns public.profiles language plpgsql security definer set search_path to public, pg_temp as $$
declare v_row public.profiles%rowtype;
  v_phone text := regexp_replace(coalesce((auth.jwt() ->> 'phone'), ''), '^\+', '');
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.profiles (id, phone) values (auth.uid(), v_phone)
  on conflict (id) do nothing
  returning * into v_row;
  if found then return v_row; end if;
  select * into v_row from public.profiles where id = auth.uid();
  return v_row;
end $$;
create or replace function app_private.validate_business_items()
returns trigger language plpgsql set search_path to public, pg_temp as $$
declare
  it jsonb;
  ph text;
  photos jsonb;
  vkind text;
  vvideo text;
  img_re constant text :=
    '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/business-media/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp|gif)$';
  vid_re constant text :=
    '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/business-media/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.(mp4|webm)$';
begin
  for it in select * from jsonb_array_elements(new.items) loop
    if jsonb_typeof(it) <> 'object' then raise exception 'item must be an object'; end if;
    vkind := it ->> 'kind';
    if coalesce(vkind, '') not in ('product', 'service') then raise exception 'bad item kind'; end if;
    if jsonb_typeof(it -> 'photos') = 'array' then
      photos := it -> 'photos';
      if jsonb_array_length(photos) > 4 then raise exception 'too many item photos'; end if;
      for ph in select * from jsonb_array_elements_text(photos) loop
        if ph is null or not (ph ~ img_re or ph like 'assets/demo/%') then
          raise exception 'bad item photo';
        end if;
      end loop;
    end if;
    vvideo := it ->> 'video';
    if vvideo is not null and vvideo <> ''
       and not (vvideo ~ vid_re or vvideo like 'assets/demo/%') then
      raise exception 'bad item video';
    end if;
  end loop;
  return new;
end $$;
