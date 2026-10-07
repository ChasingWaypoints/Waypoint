# Out-of-band migrations

These were written and run from the Supabase SQL editor but never committed
to `web/supabase/migrations`, and their numbers collide with different files
that *were* committed (037_roster_claim, 040_beacon_join_event,
041_rider_count_excludes_organizer). They are filed here, unchanged, so the
repo records what production depends on — notably `sos_incidents` and
`is_event_organizer()` from 037, which later migrations (038, 042) use.

| File | What it does | Prerequisite noted in the file |
| --- | --- | --- |
| 037_ice_minimization_sos_log.sql | `sos_incidents`, incident log, `is_event_organizer()`, ICE purge | — |
| 040_drop_profile_ice_plumbing.sql | Drops profile-level ICE card plumbing | App change removing `ice_token` deployed first |
| 041_emergency_event_scoped.sql | Repoints emergency lookup to event-scoped ICE, drops profile health columns | TrackingMap `renderEmergency` change deployed first |

Migrations 001–004 (the base schema) were never committed either.

## Which of these has production actually run?

Run in the Waypoint Supabase SQL editor (read-only):

```sql
select
  to_regclass('public.sos_incidents') is not null                       as ran_037_sos_incidents,
  to_regprocedure('public.is_event_organizer(uuid)') is not null        as ran_037_is_event_organizer,
  not exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'profiles'
                 and column_name = 'ice_token')                          as ran_040_ice_token_dropped,
  not exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'profiles'
                 and column_name = 'blood_type')                         as ran_041_blood_type_dropped;
```

Any `false` means that file has not been applied yet.
