-- 039_join_display_name.sql
-- Join with the name the rider already has.
--
-- beacon_join_event fell back to profiles.first_name/last_name and then to the
-- literal 'Rider'. But a Waypoint display name lives in
-- auth.users.raw_user_meta_data->>'full_name' — that is what signup writes and
-- what the web join route uses. A new account has a name there and nothing in
-- profiles, so every phone join landed on the organizer's roster as "Rider".
--
-- Order now matches the web: what the app passed, then the auth display name,
-- then the profile name, then the email local-part, then 'Rider'. Reading
-- auth.users is fine here — the function is already SECURITY DEFINER and only
-- ever reads the row belonging to the beacon's own owner.

create or replace function public.beacon_display_name(p_user_id uuid)
returns text
language sql
security definer
set search_path = public, auth
as $fn$
  select coalesce(
    nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
    nullif(btrim(u.raw_user_meta_data->>'name'), ''),
    nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
    nullif(split_part(u.email, '@', 1), ''),
    'Rider'
  )
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = p_user_id;
$fn$;

revoke all on function public.beacon_display_name(uuid) from public, anon, authenticated;
