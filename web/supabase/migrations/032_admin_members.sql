-- 032_admin_members.sql
-- Super-admin member directory + subscription counts on the platform stats.
-- Both are SECURITY DEFINER and gated by is_super_admin.

-- Extend the stats with subscription breakdown.
create or replace function public.admin_platform_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not coalesce((select is_super_admin from profiles where id = auth.uid()), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'users',          (select count(*) from profiles),
    'users_7d',       (select count(*) from profiles where created_at > now() - interval '7 days'),
    'subscribed',     (select count(*) from (
                          select user_id from user_subscriptions where status = 'active'
                          union
                          select user_id from org_subscriptions  where status = 'active'
                       ) s),
    'individual_subs',(select count(*) from user_subscriptions where status = 'active'),
    'org_subs',       (select count(*) from org_subscriptions  where status = 'active'),
    'events',         (select count(*) from events where not is_demo),
    'active_events',  (select count(*) from events where status = 'active' and not is_demo),
    'events_7d',      (select count(*) from events where created_at > now() - interval '7 days' and not is_demo),
    'participants',   (select count(*) from event_participants ep
                         join events e on e.id = ep.event_id where not e.is_demo),
    'reporting',      (select count(*) from event_participants ep
                         join events e on e.id = ep.event_id where not e.is_demo and ep.last_lat is not null),
    'paid_events',    (select count(*) from events where paid and not is_demo)
  ) into v;

  return v;
end; $$;
grant execute on function public.admin_platform_stats() to authenticated;

-- Member directory: one row per registered user with subscription state and the
-- number of (non-demo) events they organize.
create or replace function public.admin_list_members()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not coalesce((select is_super_admin from profiles where id = auth.uid()), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.created_at desc), '[]'::jsonb)
    into v
  from (
    select
      p.id,
      u.email                                          as email,
      p.display_name                                   as display_name,
      p.created_at                                     as created_at,
      coalesce(p.is_super_admin, false)                as is_super_admin,
      us.status                                        as sub_status,
      us.plan                                          as sub_plan,
      us.current_period_end                            as sub_until,
      os.status                                        as org_status,
      (select count(*) from events e where e.organizer_id = p.id and not e.is_demo) as events_organized
    from profiles p
    left join auth.users u          on u.id = p.id
    left join user_subscriptions us on us.user_id = p.id
    left join org_subscriptions os  on os.user_id = p.id
  ) t;

  return v;
end; $$;
grant execute on function public.admin_list_members() to authenticated;
