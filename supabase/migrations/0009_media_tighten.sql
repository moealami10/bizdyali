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
  add constraint businesses_items_bytes check (
    octet_length(items::text) <= 200000);
-- Per-element rules moved to the 0010 trigger (CHECKs forbid subqueries).

-- The 0006 demo seed satisfies every constraint in 0007-0009 by construction
-- (assets/demo/* paths, 4 photos max, no video, no accent, short scalars).
-- If a migration ever fails loudly at apply time on the seed, that failure
-- IS the proof mechanism: seeds must satisfy the same rules as owners.
