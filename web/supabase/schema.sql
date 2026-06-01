-- ============================================
-- WAYPOINT — Full Database Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================
-- USERS (extends Supabase auth.users)
-- ============================================
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  display_name text,
  avatar_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- ============================================
-- DEVICES
-- ============================================
create table public.devices (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  type text not null check (type in ('garmin', 'spot', 'zoleo', 'phone')),
  feed_url text,          -- Garmin MapShare KML URL
  feed_id text,           -- SPOT feed ID
  feed_password text,     -- SPOT feed password (optional)
  is_active boolean default true not null,
  last_polled_at timestamptz,
  poll_error text,
  created_at timestamptz default now() not null
);

-- ============================================
-- PRIVACY ZONES
-- ============================================
create table public.privacy_zones (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  center_lat double precision not null,
  center_lng double precision not null,
  radius_miles double precision not null default 0.5,
  created_at timestamptz default now() not null
);

-- ============================================
-- TRIPS
-- ============================================
create table public.trips (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  device_id uuid references public.devices(id) on delete set null,
  name text not null,
  status text not null default 'planning' check (status in ('planning', 'active', 'completed', 'archived')),
  is_public boolean default false not null,
  share_token text unique,
  share_password_hash text,
  share_expires_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- ============================================
-- TRACK POINTS
-- ============================================
create table public.track_points (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references public.trips(id) on delete cascade not null,
  device_id uuid references public.devices(id) on delete set null,
  lat double precision not null,
  lng double precision not null,
  altitude_m double precision,
  speed_kmh double precision,
  heading double precision,
  accuracy_m double precision,
  message text,
  source text not null default 'phone' check (source in ('garmin', 'spot', 'zoleo', 'phone')),
  source_latency_ms integer,
  recorded_at timestamptz not null,
  created_at timestamptz default now() not null
);

-- Index for fast trip track queries
create index track_points_trip_id_recorded_at on public.track_points(trip_id, recorded_at desc);
create index track_points_recorded_at on public.track_points(recorded_at desc);

-- ============================================
-- TRIP PHOTOS
-- ============================================
create table public.trip_photos (
  id uuid default uuid_generate_v4() primary key,
  trip_id uuid references public.trips(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  storage_path text not null,
  caption text,
  snap_lat double precision,
  snap_lng double precision,
  taken_at timestamptz,
  created_at timestamptz default now() not null
);

-- ============================================
-- EVENTS (Group Tracking)
-- ============================================
create table public.events (
  id uuid default uuid_generate_v4() primary key,
  organizer_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  code text unique not null,
  is_active boolean default true not null,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz default now() not null
);

-- ============================================
-- EVENT PARTICIPANTS
-- ============================================
create table public.event_participants (
  id uuid default uuid_generate_v4() primary key,
  event_id uuid references public.events(id) on delete cascade not null,
  display_name text not null,
  join_token text unique not null,
  last_lat double precision,
  last_lng double precision,
  last_seen_at timestamptz,
  created_at timestamptz default now() not null
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.privacy_zones enable row level security;
alter table public.trips enable row level security;
alter table public.track_points enable row level security;
alter table public.trip_photos enable row level security;
alter table public.events enable row level security;
alter table public.event_participants enable row level security;

-- Profiles
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- Devices
create policy "Users manage own devices" on public.devices for all using (auth.uid() = user_id);

-- Privacy zones
create policy "Users manage own privacy zones" on public.privacy_zones for all using (auth.uid() = user_id);

-- Trips (own trips)
create policy "Users manage own trips" on public.trips for all using (auth.uid() = user_id);
-- Public read via share token (handled in API, not RLS)

-- Track points
create policy "Users manage own track points" on public.track_points
  for all using (
    auth.uid() = (select user_id from public.trips where id = trip_id)
  );

-- Trip photos
create policy "Users manage own photos" on public.trip_photos for all using (auth.uid() = user_id);

-- Events
create policy "Organizers manage own events" on public.events for all using (auth.uid() = organizer_id);
create policy "Anyone can read active events" on public.events for select using (is_active = true);

-- Event participants (open read/insert for joining without auth)
create policy "Anyone can read event participants" on public.event_participants for select using (true);
create policy "Anyone can join an event" on public.event_participants for insert with check (true);
create policy "Participants can update own position" on public.event_participants
  for update using (true);

-- ============================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- ENABLE REALTIME
-- ============================================
alter publication supabase_realtime add table public.track_points;
alter publication supabase_realtime add table public.event_participants;
