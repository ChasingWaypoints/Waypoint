-- 025_command_expiry.sql
-- Command / GEP credentials expire WITH the event: once it's completed or
-- cancelled, or more than a day past its end date, the token stops resolving.
-- Recovery access should not outlive the event. Safe to re-run.
create or replace function public.get_command_by_token(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_event_id uuid; v_status text; v_ends timestamptz;
begin
  if p_token is null or length(trim(p_token)) < 8 then return null; end if;
  select event_id into v_event_id from event_gep_credentials where gep_token = trim(p_token) limit 1;
  if v_event_id is null then
    select event_id into v_event_id from event_participants where gep_token = trim(p_token) limit 1;
  end if;
  if v_event_id is null then return null; end if;

  select status::text, ends_at into v_status, v_ends from events where id = v_event_id;
  if v_status in ('completed', 'cancelled') then return null; end if;
  if v_ends is not null and now() > v_ends + interval '1 day' then return null; end if;

  return build_command_payload(v_event_id);
end;
$$;
grant execute on function public.get_command_by_token(text) to anon, authenticated;
