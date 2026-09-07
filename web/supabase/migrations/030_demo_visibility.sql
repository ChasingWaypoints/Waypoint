-- 030_demo_visibility.sql
-- Let any signed-in user open the DEMO event's ORGANIZER view read-only, so a
-- prospect can explore both the spectator side (/event/<token>) and the
-- organizer side (dashboard). These SELECT policies are additive (OR'd with the
-- existing ones) and scoped strictly to is_demo rows. Edits remain blocked: the
-- PATCH/DELETE/roster API routes still check organizer_id server-side, and the
-- UI hides every edit control unless you own the event.

drop policy if exists "events_select_demo" on public.events;
create policy "events_select_demo" on public.events
  for select to authenticated
  using (is_demo = true);

drop policy if exists "ep_select_demo" on public.event_participants;
create policy "ep_select_demo" on public.event_participants
  for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.is_demo));
