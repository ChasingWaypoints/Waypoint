-- 026_registration_consent.sql
-- Self-registration: record WHEN a rider consented to share their emergency /
-- medical info. Medical fields (blood_type, allergies, ICE) are only stored when
-- this is set. ICE columns + email already exist (migration 020). Safe to re-run.
alter table public.event_participants
  add column if not exists ice_consent_at timestamptz;
