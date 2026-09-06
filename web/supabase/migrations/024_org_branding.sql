-- 024_org_branding.sql
-- White-label branding for Organization subscribers. Org-level (one identity per
-- org account) applied to that org's public event pages + embeds. Safe to re-run.

create table if not exists public.org_branding (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  org_name     text,
  logo_url     text,
  accent_color text,   -- hex e.g. #FF6600; validated in the API
  site_url     text,   -- optional org website (credit linkback target)
  updated_at   timestamptz not null default now()
);

alter table public.org_branding enable row level security;
drop policy if exists "own org branding rw" on public.org_branding;
create policy "own org branding rw" on public.org_branding
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Republish the public live feed so white-labelled events also carry the org's
-- logo + accent color (only when the organizer actually holds an org sub).
create or replace function public.get_event_live_positions(p_share_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_event record; v_result jsonb; v_stages jsonb; v_wl boolean; v_org jsonb;
begin
  select id, name, status, route_name, starts_at, logo_url, sponsors,
         payment_mode, suspended_at, public_show_route, public_show_waypoints, organizer_id
    into v_event from events where share_token = p_share_token limit 1;
  if v_event.id is null then return null; end if;
  if v_event.suspended_at is not null then return null; end if;  -- suspended = dark

  v_wl := coalesce(user_has_org(v_event.organizer_id), false);
  if v_wl then
    select jsonb_build_object(
      'org_name', b.org_name, 'org_logo_url', b.logo_url,
      'accent_color', b.accent_color, 'site_url', b.site_url)
    into v_org from org_branding b where b.user_id = v_event.organizer_id;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object('id', st.id, 'name', st.name, 'color', st.color,
      'route_line', case when v_event.public_show_route then st.route_line else null end,
      'waypoints',  case when v_event.public_show_waypoints then st.waypoints else '[]'::jsonb end)
    order by st.position, st.created_at
  ) filter (where st.visible), '[]'::jsonb)
  into v_stages from event_stages st where st.event_id = v_event.id;

  select jsonb_build_object(
    'event', jsonb_build_object('name', v_event.name, 'status', v_event.status,
      'route_name', v_event.route_name, 'starts_at', v_event.starts_at,
      'logo_url', v_event.logo_url, 'sponsors', coalesce(v_event.sponsors, '[]'::jsonb),
      'whitelabel', v_wl, 'org', v_org),
    'stages', v_stages,
    'entrants', coalesce(jsonb_agg(
      jsonb_build_object('id', ep.id, 'name', ep.display_name, 'number', ep.rider_number,
        'class', ep.rider_class, 'lat', ep.last_lat, 'lng', ep.last_lng,
        'last_seen_at', ep.last_seen_at, 'device_type', ep.device_type)
      order by ep.rider_number nulls last, ep.display_name
    ) filter (where ep.last_lat is not null
              and (v_event.payment_mode <> 'entrant' or ep.paid_at is not null)),
      '[]'::jsonb)
  ) into v_result
  from event_participants ep where ep.event_id = v_event.id;

  return v_result;
end; $$;
grant execute on function public.get_event_live_positions(text) to anon, authenticated;
