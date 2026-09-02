-- ============================================================
-- Migration v11 — Seed last-known position for new entrants
--
-- get_entrant_feeds now also returns last_seen_at so the poller can
-- tell a brand-new entrant (no fix yet) from one already on the map.
-- For a new one it fetches the full feed (last-known position);
-- for an existing one it keeps asking only for the last hour.
--
-- Run in the Supabase SQL editor after 010. Safe to re-run.
-- ============================================================

create or replace function public.get_entrant_feeds()
returns table (
  id            uuid,
  event_id      uuid,
  display_name  text,
  device_type   text,
  feed_url      text,
  feed_id       text,
  feed_password text,
  last_seen_at  timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select ep.id, ep.event_id, ep.display_name::text, ep.device_type::text,
         ep.feed_url::text, ep.feed_id::text, ep.feed_password::text,
         ep.last_seen_at
  from event_participants ep
  join events e on e.id = ep.event_id
  where e.status = 'active'
    and ep.device_type in ('garmin','spot')
    and (ep.feed_url is not null or ep.feed_id is not null);
end;
$$;
grant execute on function public.get_entrant_feeds() to anon, authenticated;
