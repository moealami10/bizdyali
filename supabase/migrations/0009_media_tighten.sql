-- 0009: Media references pinned to the business-media public path and the
-- vendored demo set. No data:, no idb:, no arbitrary https://.
-- Residual risk (documented): any https URL containing the canonical public
-- path substring passes the LIKE. That can only poison the attacker's OWN
-- page (all page content is owner-supplied anyway); the render layer
-- allowlists schemes independently, and Storage writes remain uuid-pathed.

alter table public.businesses
  drop constraint if exists businesses_mediaref_pattern,
  drop constraint if exists businesses_item_media;

alter table public.businesses
  add constraint businesses_mediaref_pattern check (
    (logo = '' or logo like 'https://%/storage/v1/object/public/business-media/%'
      or logo like 'assets/demo/%')
    and (cover = '' or cover like 'https://%/storage/v1/object/public/business-media/%'
      or cover like 'assets/demo/%')),
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
           where (ph.value not like 'https://%/storage/v1/object/public/business-media/%.jpg'
               and ph.value not like 'https://%/storage/v1/object/public/business-media/%.jpeg'
               and ph.value not like 'https://%/storage/v1/object/public/business-media/%.png'
               and ph.value not like 'https://%/storage/v1/object/public/business-media/%.webp'
               and ph.value not like 'https://%/storage/v1/object/public/business-media/%.gif'
               and ph.value not like 'assets/demo/%'))
         or ((it.value ->> 'video') is not null and (it.value ->> 'video') <> ''
             and (it.value ->> 'video') not like 'https://%/storage/v1/object/public/business-media/%.mp4'
             and (it.value ->> 'video') not like 'https://%/storage/v1/object/public/business-media/%.webm'
             and (it.value ->> 'video') not like 'assets/demo/%')));

-- The 0006 demo seed satisfies every constraint in 0007-0009 by construction
-- (assets/demo/* paths, 4 photos max, no video, no accent, short scalars).
-- If a migration ever fails loudly at apply time on the seed, that failure
-- IS the proof mechanism: seeds must satisfy the same rules as owners.
