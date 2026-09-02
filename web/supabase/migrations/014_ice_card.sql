-- ============================================================
-- Migration v14 — Shareable ICE (In Case of Emergency) card
--
-- A rider can share a Waypoint-branded emergency card at an unguessable
-- token URL (/ice/<token>) — for a bracelet, sticker, or to hand a first
-- responder. The token is separate from (and much longer than) the
-- 6-char Waypoint ID so the health info cannot be brute-forced.
-- Run after 013. Safe to re-run.
-- ============================================================

alter table public.profiles
  add column if not exists ice_token text unique;

update public.profiles
  set ice_token = replace(gen_random_uuid()::text, '-', '')
  where ice_token is null;

create or replace function public.set_ice_token()
returns trigger language plpgsql as $$
begin
  if new.ice_token is null then
    new.ice_token := replace(gen_random_uuid()::text, '-', '');
  end if;
  return new;
end; $$;

drop trigger if exists profiles_set_ice_token on public.profiles;
create trigger profiles_set_ice_token
  before insert on public.profiles
  for each row execute procedure public.set_ice_token();

-- Public read by the unguessable token only. Returns just the ICE fields.
create or replace function public.get_ice_card(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if p_token is null or length(trim(p_token)) < 16 then return null; end if;
  select jsonb_build_object(
    'name', nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''),
    'waypoint_id', waypoint_id,
    'blood_type', blood_type,
    'date_of_birth', date_of_birth,
    'phone', phone,
    'country', country,
    'emergency_contact_name', emergency_contact_name,
    'emergency_contact_phone', emergency_contact_phone,
    'emergency_contact_relation', emergency_contact_relation
  ) into v from profiles where ice_token = trim(p_token) limit 1;
  return v;
end; $$;
revoke all on function public.get_ice_card(text) from public;
grant execute on function public.get_ice_card(text) to anon, authenticated;
