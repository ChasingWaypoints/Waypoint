-- ============================================================
-- Migration v12 — Waypoint ID (account linking identifier)
--
-- Every profile gets a short, unambiguous 6-char code a rider can put
-- on an event roster to link their Waypoint account. Linking is what
-- lets an organizer reach the rider's emergency info from the map in
-- an emergency. Run after 011. Safe to re-run.
-- ============================================================

alter table public.profiles
  add column if not exists waypoint_id text unique;

-- 6 chars from an alphabet with no 0/O/1/I/L, so it is easy to read
-- off a screen and type onto a roster without ambiguity.
create or replace function public.gen_waypoint_id()
returns text language plpgsql as $$
declare
  alphabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    perform 1 from public.profiles where waypoint_id = code;
    if not found then return code; end if;
  end loop;
end; $$;

-- Backfill existing profiles.
update public.profiles set waypoint_id = public.gen_waypoint_id()
  where waypoint_id is null;

-- Auto-assign on any new profile.
create or replace function public.set_waypoint_id()
returns trigger language plpgsql as $$
begin
  if new.waypoint_id is null then new.waypoint_id := public.gen_waypoint_id(); end if;
  return new;
end; $$;

drop trigger if exists profiles_set_waypoint_id on public.profiles;
create trigger profiles_set_waypoint_id
  before insert on public.profiles
  for each row execute procedure public.set_waypoint_id();

-- Resolve a code to a user id. SECURITY DEFINER so an organizer can
-- link a roster row without being able to read anyone's profile — it
-- returns only the id, nothing else.
create or replace function public.resolve_waypoint_id(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_code is null or length(trim(p_code)) = 0 then return null; end if;
  select id into v_id from profiles
    where upper(waypoint_id) = upper(trim(p_code)) limit 1;
  return v_id;
end; $$;
revoke all on function public.resolve_waypoint_id(text) from public;
grant execute on function public.resolve_waypoint_id(text) to authenticated;
