-- 0015: Trigger-bypass harness fix (found live, not by review).
-- See the inline comment: role-only bypass misfires inside SECURITY DEFINER
-- RPCs on this stack. RPC writes are now enforced identically to direct
-- writes; service_role / migrations / GoTrue paths still bypass (no JWT).

create or replace function app_private.force_business_owner()
returns trigger language plpgsql set search_path to public, pg_temp as $$
declare
  v_count integer;
  v_ostart timestamptz;
  v_ts timestamptz;
begin
  -- Bypass: non-login roles WITHOUT a JWT identity (service_role, migration
  -- owner, GoTrue internals), or a server-verified admin. Role alone is NOT
  -- sufficient: PostgREST executes SECURITY DEFINER RPCs with
  -- current_user='postgres' while the caller's JWT claims remain visible, so
  -- gating on the role would skip enforcement for every RPC write (found
  -- live: page cap never fired through publish_business()). Requiring a null
  -- uid keeps service/migration paths open while forcing all RPC writes
  -- through the rules below.
  if (current_user not in ('authenticated', 'anon') and auth.uid() is null)
     or app_private.is_admin() then
    return new;
  end if;
  new.owner_id := auth.uid();
  -- Per-owner page cap (trial-farming + abuse brake; demo/service bypass above).
  select count(*) into v_count from public.businesses where owner_id = new.owner_id;
  if tg_op = 'INSERT' and v_count >= 5 then
    raise exception 'business limit reached';
  end if;
  -- WHY THE ALLOWLIST BRANCHES BELOW EXIST (do not delete as "dead code"):
  -- SECURITY DEFINER changes privileges, not current_user, so this trigger
  -- fires identically for direct owner writes and publish_business() writes.
  -- The column grants exclude every server-owned column, therefore any write
  -- reaching these branches with published/trial set MUST have come through
  -- publish_business() (the sole holder of those columns via definer rights).
  -- Deleting the branches would make publishing impossible with no replacement.
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
  elsif tg_op = 'UPDATE' and new.published is true and new.trial_start is not null
        and (old.trial_start is null or old.trial_end is null) then
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
