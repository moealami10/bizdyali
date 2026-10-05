-- 0007: Abuse-shape limits. Cheap CHECKs that bound row size and jsonb shape
-- so no client (or bug) can stuff megabytes into a text/jsonb column.
-- Kept separate so 0001-0006 stay a stable review unit.

-- Slugs: length bounds on top of the format + reserved-word checks in 0002.
alter table public.businesses
  add constraint businesses_slug_len check (char_length(slug) between 2 and 60);

-- Scalar text caps (generous vs. every real UI field; hostile vs. abuse).
alter table public.businesses
  add constraint businesses_name_len check (char_length(name) between 1 and 120),
  add constraint businesses_desc_len check (char_length(description) <= 5000),
  add constraint businesses_city_len check (char_length(city) <= 80),
  add constraint businesses_contact_len check (
    char_length(phone) <= 24 and char_length(whatsapp) <= 24
    and char_length(address) <= 200 and char_length(hours) <= 200
    and char_length(facebook) <= 300 and char_length(instagram) <= 300),
  add constraint businesses_mediaref_len check (
    char_length(logo) <= 500 and char_length(cover) <= 500);

-- Catalog: bounded array, whitelisted kinds only.
alter table public.businesses
  add constraint businesses_items_shape check (
    jsonb_typeof(items) = 'array'
    and jsonb_array_length(items) <= 100);
-- Per-element item rules (kind whitelist, photo/video patterns) cannot live in
-- CHECKs (no subqueries allowed) — they are enforced by the
-- validate_business_items() trigger in 0010 instead.

-- Small jsonb blobs: object shape + byte caps.
alter table public.businesses
  add constraint businesses_theme_shape check (
    jsonb_typeof(theme) = 'object' and octet_length(theme::text) <= 5000),
  add constraint businesses_hours_shape check (
    hours_week is null
    or (jsonb_typeof(hours_week) = 'object' and octet_length(hours_week::text) <= 2000)),
  add constraint businesses_quotes_shape check (
    jsonb_typeof(testimonials) = 'array' and jsonb_array_length(testimonials) <= 10
    and octet_length(testimonials::text) <= 10000),
  add constraint businesses_trust_shape check (
    jsonb_typeof(trust) = 'array' and jsonb_array_length(trust) <= 4
    and octet_length(trust::text) <= 1000);

-- Draft payload: object + 100KB cap (write-through buffer, not a file store).
alter table public.drafts
  add constraint drafts_data_shape check (
    jsonb_typeof(data) = 'object' and octet_length(data::text) <= 102400);

-- Storage: explicit public-read policy (defense in depth alongside the
-- public bucket flag). Anon gets SELECT only; writes stay owner-scoped
-- under the 0005 policy. No anon INSERT/UPDATE/DELETE policy exists.
create policy "business-media public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'business-media');
