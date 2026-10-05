-- 0008: Hardening review batch. Safe to apply on top of 0001-0007, in order.
-- (a) Internal functions move out of the PostgREST-exposed public schema.
-- (b) handle_new_user() becomes non-fatal + canonical no-plus phones.
-- (c) draft_save() RPC for optimistic draft sync. (d) Storage tightening.
-- (e) URL / media-ref / accent CHECKs.

-- ---------- (a) private internals ----------
create schema if not exists app_private;
alter function public.touch_updated_at() set schema app_private;
alter function public.force_business_owner() set schema app_private;
alter function public.is_admin() set schema app_private;
alter function public.handle_new_user() set schema app_private;
alter function public.log_event(text, text, text, uuid, text, uuid, text) set schema app_private;
grant usage on schema app_private to authenticated;
revoke all on function app_private.touch_updated_at() from public, anon, authenticated;
revoke all on function app_private.force_business_owner() from public, anon, authenticated;
revoke all on function app_private.handle_new_user() from public, anon, authenticated;
revoke all on function app_private.log_event(text, text, text, uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function app_private.is_admin() from public, anon, authenticated;
grant execute on function app_private.is_admin() to authenticated;

-- Policies must name the moved function (bindings are by OID, so recreate).
drop policy if exists profiles_admin_select on public.profiles;
create policy profiles_admin_select on public.profiles for select to authenticated
  using (app_private.is_admin());
drop policy if exists businesses_admin_all on public.businesses;
create policy businesses_admin_all on public.businesses
  for all to authenticated using (app_private.is_admin())
  with check (app_private.is_admin());
drop policy if exists activity_admin_select on public.activity_log;
create policy activity_admin_select on public.activity_log
  for select to authenticated using (app_private.is_admin());

-- admin_set_status() body referenced public.is_admin(): recreate it fixed.
create or replace function public.admin_set_status(p_business_id uuid, p_trial_end timestamptz,
  p_subscription text, p_suspended boolean)
returns public.businesses language plpgsql security definer set search_path to public, pg_temp as $$
declare v_row public.businesses%rowtype;
begin
  if not app_private.is_admin() then raise exception 'not authorized'; end if;
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

-- ---------- (b) non-fatal signup trigger, canonical phones, backstop ----------
-- Canonical phone form everywhere: E.164 digits WITHOUT '+'. GoTrue supplies
-- '+...'; every boundary strips exactly one leading '+' (mock, admin gate,
-- wizard prefill strip it client-side in 3b; never store the plus).
create or replace function app_private.handle_new_user()
returns trigger language plpgsql security definer set search_path to public, pg_temp as $$
begin
  begin
    insert into public.profiles (id, phone, name)
    values (new.id, regexp_replace(coalesce(new.phone, ''), '^\\+', ''),
            coalesce(new.raw_user_meta_data ->> 'name', ''))
    on conflict (id) do nothing;
  exception when others then
    -- Observable but non-fatal: signup proceeds; ensure_profile() backstops.
    raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
  end;
  return new;
end $$;
alter table public.profiles drop constraint if exists profiles_phone_key;

-- Backstop when the trigger row is ever missing (pre-trigger users, manual
-- deletes): creates the caller's own profile from the verified JWT claim.
create or replace function public.ensure_profile()
returns public.profiles language plpgsql security definer set search_path to public, pg_temp as $$
declare v_row public.profiles%rowtype;
  v_phone text := regexp_replace(coalesce((auth.jwt() ->> 'phone'), ''), '^\\+', '');
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.profiles (id, phone) values (auth.uid(), v_phone)
  on conflict (id) do nothing
  returning * into v_row;
  if found then return v_row; end if;
  select * into v_row from public.profiles where id = auth.uid();
  return v_row;
end $$;
revoke all on function public.ensure_profile() from public, anon, authenticated;
grant execute on function public.ensure_profile() to authenticated;

-- ---------- (c) optimistic draft save ----------
-- Client sends its base timestamp; a newer server row wins and comes back
-- with conflict:true instead of being silently overwritten.
create or replace function public.draft_save(p_data jsonb, p_base timestamptz)
returns jsonb language plpgsql security definer set search_path to public, pg_temp as $$
declare v_row public.drafts%rowtype;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into v_row from public.drafts where owner_id = auth.uid();
  if found and p_base is not null and v_row.updated_at > p_base then
    return jsonb_build_object('conflict', true, 'server', v_row.data, 'updated_at', v_row.updated_at);
  end if;
  insert into public.drafts (owner_id, data) values (auth.uid(), coalesce(p_data, '{}'))
  on conflict (owner_id) do update set data = excluded.data, updated_at = now()
  returning * into v_row;
  return jsonb_build_object('conflict', false, 'updated_at', v_row.updated_at);
end $$;
revoke all on function public.draft_save(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.draft_save(jsonb, timestamptz) to authenticated;

-- ---------- (d) storage: no anon policy, uuid paths, mp4/webm only ----------
drop policy if exists "business-media public read" on storage.objects;
-- Public reads are served by the bucket's public flag via /object/public/
-- URLs (no anon policy needed, none exists). Writes stay owner-scoped AND
-- path-shaped: {uid}/{uuid}.{ext} kills enumeration and non-media uploads.
drop policy if exists "business-media owner write" on storage.objects;
create policy "business-media owner write" on storage.objects
  for all to authenticated
  using (bucket_id = 'business-media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'business-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp|gif|mp4|webm)$');
update storage.buckets
  set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
  where id = 'business-media';

-- ---------- (e) URL / media-ref / accent CHECKs ----------
alter table public.businesses
  add constraint businesses_urls_https check (
    (facebook = '' or facebook like 'https://%')
    and (instagram = '' or instagram like 'https://%')),
  add constraint businesses_mediaref_pattern check (
    (logo = '' or logo like 'https://%' or logo like 'data:image/%' or logo like 'idb:%' or logo like 'assets/%')
    and (cover = '' or cover like 'https://%' or cover like 'data:image/%' or cover like 'idb:%' or cover like 'assets/%')),
  add constraint businesses_item_media check (
    not exists (
      select 1 from jsonb_array_elements(items) as it(value)
      where jsonb_typeof(it.value) <> 'object'
         or (it.value ->> 'kind') not in ('product', 'service')
         or jsonb_array_length(coalesce(
              case when jsonb_typeof(it.value -> 'photos') = 'array' then it.value -> 'photos' end, '[]')) > 4
         or exists (
           select 1 from jsonb_array_elements_text(coalesce(
             case when jsonb_typeof(it.value -> 'photos') = 'array' then it.value -> 'photos' end, '[]')) as ph(value)
           where ph.value not like 'https://%' and ph.value not like 'data:image/%'
             and ph.value not like 'idb:%' and ph.value not like 'assets/%')
         or ((it.value ->> 'video') is not null and (it.value ->> 'video') <> ''
             and (it.value ->> 'video') not like 'https://%'
             and (it.value ->> 'video') not like 'data:video/%'
             and (it.value ->> 'video') not like 'idb:%'
             and (it.value ->> 'video') not like 'assets/%'))),
  add constraint businesses_accent_hex check (
    theme ->> 'accent' is null or theme ->> 'accent' ~ '^#[0-9a-fA-F]{6}$');
