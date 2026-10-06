-- 0014: admin_set_status() gains an optional published flag so admin
-- "unpublish to draft" keeps working after cutover. Direct client writes to
-- published remain impossible (column grants + trigger); only this RPC moves
-- it, admin-gated and logged like every other lifecycle change.
-- Drop the 4-arg overload first so only one callable shape exists.
drop function if exists public.admin_set_status(uuid, timestamptz, text, boolean);

create or replace function public.admin_set_status(p_business_id uuid, p_trial_end timestamptz,
  p_subscription text, p_suspended boolean, p_published boolean default null)
returns public.businesses language plpgsql security definer set search_path to public, pg_temp as $$
declare v_row public.businesses%rowtype;
begin
  if not app_private.is_admin() then raise exception 'not authorized'; end if;
  if p_subscription is not null and p_subscription not in ('none', 'active') then raise exception 'bad subscription'; end if;
  perform set_config('bizdyali.bypass_owner_force', 'on', true);
  update public.businesses set
    trial_end = coalesce(p_trial_end, trial_end),
    subscription = coalesce(p_subscription, subscription),
    suspended = coalesce(p_suspended, suspended),
    published = coalesce(p_published, published)
  where id = p_business_id returning * into v_row;
  if not found then raise exception 'business not found'; end if;
  insert into public.activity_log (type, actor, actor_name, business_id, business_name, owner_id, details)
  values ('admin_action', 'admin', '', v_row.id, v_row.name, v_row.owner_id,
    'status: trial_end=' || coalesce(v_row.trial_end::text, 'null')
    || ' subscription=' || v_row.subscription || ' suspended=' || v_row.suspended
    || ' published=' || v_row.published);
  return v_row;
end $$;
revoke all on function public.admin_set_status(uuid, timestamptz, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_status(uuid, timestamptz, text, boolean, boolean) to authenticated;
