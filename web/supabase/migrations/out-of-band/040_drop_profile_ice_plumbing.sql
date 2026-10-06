-- ============================================================
-- Migration v40 — drop the profile-level ICE card plumbing.
--
-- The server-backed personal ICE card (/ice/<token> + get_ice_card) is replaced
-- by the client-side /ice-card (nothing stored server-side), and the profile UI
-- no longer reads or writes ice_token. Run AFTER the app change that removes
-- those references is deployed. Safe to re-run.
--
-- NOTE: profiles.blood_type and profiles.emergency_contact_* are NOT dropped
-- here — get_participant_emergency() still reads them for linked riders. Those
-- columns come out in a later migration once that function is repointed to the
-- event-scoped ICE on event_participants.
-- ============================================================

drop function if exists public.get_ice_card(text);
drop trigger if exists profiles_set_ice_token on public.profiles;
drop function if exists public.set_ice_token();
alter table public.profiles drop column if exists ice_token;
