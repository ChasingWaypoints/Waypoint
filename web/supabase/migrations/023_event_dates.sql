-- 023_event_dates.sql
-- Real event window: events already have starts_at; add ends_at so we can
-- compute duration. The entrant fee is derived from this window
-- (<=3d $10, <=7d $12, <=30d $15) in the API, not stored as a manual value.
alter table public.events add column if not exists ends_at timestamptz;
