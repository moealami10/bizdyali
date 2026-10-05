-- 0010: Media URLs pinned to supabase.co public paths. The host must match
-- ^https://<ref>.supabase.co with the exact canonical path and a terminal
-- extension ($-anchored: query/fragment smuggling fails, so
-- https://evil.com/x.png?/storage/v1/object/public/business-media/... is rejected).
-- Foreign hosts cannot pass; an attacker-owned Supabase project can only
-- host its own content (self-poisoning, same as any owner-supplied field).
-- Replaces the looser 0009 patterns (dropped below).

alter table public.businesses
  drop constraint if exists businesses_mediaref_pattern,
  drop constraint if exists businesses_item_media;

alter table public.businesses
  add constraint businesses_mediaref_pattern check (
    (logo = '' or logo ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/business-media/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp|gif)$' or logo like 'assets/demo/%')
    and (cover = '' or cover ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/business-media/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp|gif)$' or cover like 'assets/demo/%')),
  add constraint businesses_item_media check (
    octet_length(items::text) <= 200000
    and not exists (
      select 1 from jsonb_array_elements(items) as it(value)
      where jsonb_typeof(it.value) <> 'object'
         or (it.value ->> 'kind') not in ('product', 'service')
         or jsonb_array_length(coalesce(
              case when jsonb_typeof(it.value -> 'photos') = 'array' then it.value -> 'photos' end, '[]')) > 4
         or exists (
           select 1 from jsonb_array_elements_text(coalesce(
             case when jsonb_typeof(it.value -> 'photos') = 'array' then it.value -> 'photos' end, '[]')) as ph(value)
           where ph.value is null or not (ph.value ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/business-media/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp|gif)$' or ph.value like 'assets/demo/%'))
         or ((it.value ->> 'video') is not null and (it.value ->> 'video') <> ''
             and not ((it.value ->> 'video') ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/business-media/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.(mp4|webm)$' or (it.value ->> 'video') like 'assets/demo/%'))));
