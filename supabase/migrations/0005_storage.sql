-- 0005: Media bucket. Public read; owner-scoped writes; size + MIME limits.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-media', 'business-media', true, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif',
        'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update set
  public = true, file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'video/quicktime'];

-- Public read is served by the public bucket; writes are owner-scoped:
-- every object must live under {auth.uid()}/... so owners can never
-- overwrite each other's files.
create policy "business-media owner write" on storage.objects
  for all to authenticated
  using (bucket_id = 'business-media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'business-media' and (storage.foldername(name))[1] = auth.uid()::text);
