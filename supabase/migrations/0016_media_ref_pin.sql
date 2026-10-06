-- 0016: Pin media URLs to THIS project (launch hardening). Replaces the
-- any-ref patterns from 0010 with literal msnbwndghxcsuugommvm.supabase.co. This makes
-- the branch production-specific by design; throwaway/CI copies keep 0010.
-- Evil-host and query-smuggling strings fail the ^...$ anchors as before.
-- NOTE: per-element item rules live in the validate_business_items()
-- trigger (CHECKs forbid subqueries); only the two regex constants change.

alter table public.businesses
  drop constraint if exists businesses_mediaref_pattern;

alter table public.businesses
  add constraint businesses_mediaref_pattern check (
    (logo = '' or logo ~ '^https://msnbwndghxcsuugommvm.supabase.co/storage/v1/object/public/business-media/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp|gif)$' or logo like 'assets/demo/%')
    and (cover = '' or cover ~ '^https://msnbwndghxcsuugommvm.supabase.co/storage/v1/object/public/business-media/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp|gif)$' or cover like 'assets/demo/%'));

create or replace function app_private.validate_business_items()
returns trigger language plpgsql set search_path to public, pg_temp as $$
declare
  it jsonb;
  ph text;
  photos jsonb;
  vkind text;
  vvideo text;
  img_re constant text :=
    '^https://msnbwndghxcsuugommvm.supabase.co/storage/v1/object/public/business-media/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp|gif)$';
  vid_re constant text :=
    '^https://msnbwndghxcsuugommvm.supabase.co/storage/v1/object/public/business-media/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.(mp4|webm)$';
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
