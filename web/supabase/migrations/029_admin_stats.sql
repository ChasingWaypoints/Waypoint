-- 029_admin_stats.sql
-- Platform-wide metrics for the Super Admin dashboard. SECURITY DEFINER, gated
-- by is_super_admin. Event/participant counts exclude the demo event.
create or replace function public.admin_platform_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not coalesce((select is_super_admin from profiles where id = auth.uid()), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'users',         (select count(*) from profiles),
    'users_7d',      (select count(*) from profiles where created_at > now() - interval '7 days'),
    'events',        (select count(*) from events where not is_demo),
    'active_events', (select count(*) from events where status = 'active' and not is_demo),
    'events_7d',     (select count(*) from events where created_at > now() - interval '7 days' and not is_demo),
    'participants',  (select count(*) from event_participants ep
                        join events e on e.id = ep.event_id where not e.is_demo),
    'reporting',     (select count(*) from event_participants ep
                        join events e on e.id = ep.event_id where not e.is_demo and ep.last_lat is not null),
    'paid_events',   (select count(*) from events where paid and not is_demo)
  ) into v;

  return v;
end; $$;
grant execute on function public.admin_platform_stats() to authenticated;
