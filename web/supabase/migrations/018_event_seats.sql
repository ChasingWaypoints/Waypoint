-- 018_event_seats.sql
-- Paid-event seat capacity. A paid event unlocks 60 seats for the $200 base.
-- Organizers add capacity in blocks of 20 seats for $40 ($2/seat). The join
-- route enforces seats_paid as the hard cap on paid events; comped events are
-- uncapped. seats_paid is set/incremented by the Stripe webhook.

alter table public.events add column if not exists seats_paid integer;

-- Backfill: any already-paid event gets the 60-seat base so existing paid
-- events keep working (and aren't suddenly capped at their current count).
update public.events set seats_paid = 60 where paid = true and seats_paid is null;

comment on column public.events.seats_paid is
  'Paid seat capacity for a paid event: 60 base (+20 per $40 block). NULL until paid.';
