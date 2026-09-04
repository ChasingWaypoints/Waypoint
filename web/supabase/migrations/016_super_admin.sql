-- 016_super_admin.sql
-- Super-admin: a flag on the profile plus SECURITY DEFINER RPCs so a super
-- admin can browse every event across all organizers (bypassing RLS safely,
-- gated by the flag — no service-role key needed).

-- ── Flag ──────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists is_super_admin boolean not null default false;

-- Grant it to Victor's account (by login email).
update public.profiles
  set is_super_admin = true
  where id = (select id from auth.users where lower(email) = 'vo@chasingwaypoints.com');

-- ── Is the caller a super admin? (for the UI to show the Admin area) ───────
create or replace function public.am_i_super_admin()
returns boolean language sql security definer set search_path = public as $$
  select coalesce((select is_super_admin from profiles where id = auth.uid()), false);
$$;
grant execute on function public.am_i_super_admin() to authenticated;

-- ── All events, for the super-admin console ───────────────────────────────
create or replace function public.admin_list_events()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  if not coalesce((select is_super_admin from profiles where id = auth.uid()), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.created_at desc), '[]'::jsonb)
    into v_result
  from (
    select
      e.id,
      e.name,
      e.status,
      e.join_code,
      e.share_token,
      e.created_at,
      e.organizer_id,
      u.email as organizer_email,
      (select count(*) from event_participants ep where ep.event_id = e.id) as participant_count,
      (select count(*) from event_participants ep
         where ep.event_id = e.id and ep.last_lat is not null) as reporting_count
    from events e
    left join auth.users u on u.id = e.organizer_id
  ) t;

  return v_result;
end; $$;
grant execute on function public.admin_list_events() to authenticated;
