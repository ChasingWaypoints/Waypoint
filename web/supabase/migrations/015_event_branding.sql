-- 015_event_branding.sql
-- Event branding: an event logo and a list of sponsors, shown on the public
-- tracking page (logo + headline sponsors in the header, the rest in a bottom
-- strip). Images live in a public Storage bucket; the event row keeps the URLs.

-- ── Columns ───────────────────────────────────────────────────────────────
alter table public.events add column if not exists logo_url text;
-- sponsors: array of { name, logo_url, url?, headline? }
alter table public.events add column if not exists sponsors jsonb not null default '[]'::jsonb;

-- ── Public bucket for branding images ─────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('event-branding', 'event-branding', true)
on conflict (id) do nothing;

-- Anyone may read (public spectator page); only signed-in users may write.
-- Event ownership is enforced at the app layer: an uploaded URL only appears
-- publicly once the organizer saves it onto their event (organizer-guarded PATCH).
drop policy if exists "event-branding read"   on storage.objects;
drop policy if exists "event-branding insert" on storage.objects;
drop policy if exists "event-branding update" on storage.objects;
drop policy if exists "event-branding delete" on storage.objects;

create policy "event-branding read"
  on storage.objects for select
  using (bucket_id = 'event-branding');

create policy "event-branding insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'event-branding');

create policy "event-branding update"
  on storage.objects for update to authenticated
  using (bucket_id = 'event-branding');

create policy "event-branding delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'event-branding');

-- ── Republish the public live RPC to carry logo_url + sponsors ────────────
create or replace function public.get_event_live_positions(p_share_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_event record; v_result jsonb; v_stages jsonb;
begin
  select id, name, status, route_name, starts_at, logo_url, sponsors
    into v_event from events where share_token = p_share_token limit 1;
  if v_event.id is null then return null; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object('id', st.id, 'name', st.name, 'color', st.color,
                       'route_line', st.route_line, 'waypoints', st.waypoints)
    order by st.position, st.created_at
  ) filter (where st.visible), '[]'::jsonb)
  into v_stages from event_stages st where st.event_id = v_event.id;

  select jsonb_build_object(
    'event', jsonb_build_object('name', v_event.name, 'status', v_event.status,
      'route_name', v_event.route_name, 'starts_at', v_event.starts_at,
      'logo_url', v_event.logo_url, 'sponsors', coalesce(v_event.sponsors, '[]'::jsonb)),
    'stages', v_stages,
    'entrants', coalesce(jsonb_agg(
      jsonb_build_object('id', ep.id, 'name', ep.display_name, 'number', ep.rider_number,
        'class', ep.rider_class, 'lat', ep.last_lat, 'lng', ep.last_lng,
        'last_seen_at', ep.last_seen_at, 'device_type', ep.device_type)
      order by ep.rider_number nulls last, ep.display_name
    ) filter (where ep.last_lat is not null), '[]'::jsonb)
  ) into v_result
  from event_participants ep where ep.event_id = v_event.id;

  return v_result;
end; $$;
grant execute on function public.get_event_live_positions(text) to anon, authenticated;
