-- 0012: Live-test fix. The INSERT column grant deliberately excludes owner_id
-- (server-owned), which left clients with no legal way to insert at all:
-- sending it hits the grant wall, omitting it fails the RLS WITH CHECK.
-- Resolution: the column defaults to auth.uid(), so clients simply omit it.
-- The RLS check and the force trigger then agree on the same value, and
-- forged ids remain impossible (ungranted column). Service-role seeds and
-- publish_business() set owner_id explicitly and are unaffected.
alter table public.businesses alter column owner_id set default auth.uid();
