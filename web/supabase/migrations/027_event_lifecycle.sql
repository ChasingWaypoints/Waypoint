-- 027_event_lifecycle.sql
-- Lifecycle actions for events, callable by the event's ORGANIZER or a SUPER
-- ADMIN. Both are SECURITY DEFINER with an explicit permission check, so they
-- need no service-role key and don't depend on an RLS delete policy existing.
--
--   end_event    -> mark 'completed' and close the window now. Command / GEP
--                   access already denies once status is 'completed'
--                   (025_command_expiry), so ending an event immediately
--                   revokes the recovery crew's live access.
--   delete_event -> hard delete. Every child row (participants, track points,
--                   stages, billing seats) is removed via ON DELETE CASCADE.

-- ── End an event ──────────────────────────────────────────────────────────
create or replace function public.end_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_org uuid;
begin
  select organizer_id into v_org from events where id = p_event_id;
  if v_org is null then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  if v_org <> auth.uid()
     and not coalesce((select is_super_admin from profiles where id = auth.uid()), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  update events
     set status  = 'completed',
         ends_at = least(coalesce(ends_at, now()), now())
   where id = p_event_id;
end;
$$;
grant execute on function public.end_event(uuid) to authenticated;

-- ── Delete an event (cascades to all its data) ────────────────────────────
create or replace function public.delete_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_org uuid;
begin
  select organizer_id into v_org from events where id = p_event_id;
  if v_org is null then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  if v_org <> auth.uid()
     and not coalesce((select is_super_admin from profiles where id = auth.uid()), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  delete from events where id = p_event_id;
end;
$$;
grant execute on function public.delete_event(uuid) to authenticated;
