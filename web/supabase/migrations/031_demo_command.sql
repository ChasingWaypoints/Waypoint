-- 031_demo_command.sql
-- Let the command feed (positions + precise coordinates + ICE) serve the DEMO
-- event to any signed-in user, so the demo's organizer view shows coordinates
-- and emergency cards read-only. Organizer / super-admin behaviour is unchanged
-- — this only ADDS an is_demo allowance. build_command_payload is untouched, so
-- no real event's private data is exposed.
create or replace function public.get_command_for_event(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select organizer_id into v_org from events where id = p_event_id;
  if v_org is null then return null; end if;
  if v_org <> auth.uid()
     and not coalesce((select is_super_admin from profiles where id = auth.uid()), false)
     and not coalesce((select is_demo from events where id = p_event_id), false) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  return build_command_payload(p_event_id);
end;
$$;
grant execute on function public.get_command_for_event(uuid) to authenticated;
