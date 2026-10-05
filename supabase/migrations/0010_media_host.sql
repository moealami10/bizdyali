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
    and (cover = '' or cover ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/business-media/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp|gif)$' or cover like 'assets/demo/%'));

-- Per-element item rules cannot live in CHECKs (Postgres forbids subqueries
-- there), so they are enforced by this trigger instead. It fires on EVERY
-- insert/update including service-role writes: seeds and tests must satisfy
-- the same rules as owners (fail-fast proof at apply time).
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
    if vkind not in ('product', 'service') then raise exception 'bad item kind'; end if;
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
revoke all on function app_private.validate_business_items() from public, anon, authenticated;
create trigger businesses_validate_items before insert or update on public.businesses
  for each row execute function app_private.validate_business_items();
