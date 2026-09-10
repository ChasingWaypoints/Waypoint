# Waypoint Tracker — Asset Checklist & Build Readiness

**Captured:** 2026-09-10 · Repo audited live on `chasingwaypoints-mbp-local` at `~/Code/waypoint`

---

## Short answer

**No — I can't start building yet, and the reason is not what either of us assumed.**

The repo is far ahead of what my notes said, and one thing in it is quietly broken in a way that matters more than any asset on this list. Details in §1. Assets in §2–§5. What I need from you before Day 1 is §6 — it's five items.

---

## 1. What the repo audit turned up

`~/Code/waypoint` is on `main`, clean, but **1 commit behind origin/main** (`7862f1a Rider/fan onboarding: first-visit spectator guide + InfoTip`). Pull before we touch anything.

**The mobile app already exists and is much further along than my notes said.** Expo SDK **56** / RN 0.85.3 (not 54), EAS project ID `9616d6e2-8935-452e-b7a2-bdc08f95b845` already provisioned, bundle ID `com.chasingwaypoints.waypoint` on both platforms. It has auth, tabs (index / track / map / events / settings), Garmin / SPOT / ZOLEO setup screens, privacy zones, native Mapbox maps, and a `lib/backgroundTracking.ts`. Migrations are at **034**, not 013 — so the beacon migration is **035**, not 014.

**Then the problem:**

> `lib/backgroundTracking.ts` imports `expo-task-manager`. **`expo-task-manager` is not in `package.json` and not in `node_modules`.** The `TaskManager.defineTask()` call is wrapped in a try/catch that logs a warning and moves on.

Background tracking has never worked. It fails silently at import, the app looks fine, the Track screen renders, and nothing records once the phone is in a pocket. `expo-location` is also missing from the plugins array in `app.config.ts`, so the background-location config plugin isn't applying either.

Four more gaps in the same file, all of which would have bitten at a real event:

| Gap | Consequence |
|---|---|
| Background task inserts straight into Supabase, no queue | Every point in a dead zone is lost forever. In Baja that's most of them. This is the #1 fix. |
| Writes to `track_points` keyed by `trip_id` only — no `event_track_points` path anywhere in `mobile/` | The phone beacon cannot feed an event map at all today. The whole point of the product. |
| `Accuracy.Balanced`, no `activityType`, fixed interval | Coarse fixes, iOS free to deprioritize the app, no adaptive cadence. |
| No battery %, no heading in the payload | Organizer can't tell "stopped" from "dead phone." |

None of that needs an asset from you — it's my work, and it's roughly Days 2–4 of the plan. But it does change the framing: **this is not a new app build, it's a repair-and-ship of an existing one.** That's good news for the 14 days.

---

## 2. Accounts & credentials — only you can supply these

The theme here: give me **API keys, not passwords**. Every one of these lets EAS build and submit without me ever touching a login.

| # | Asset | Where it comes from | Blocks |
|---|---|---|---|
| 1 | **App Store Connect API key** — `.p8` file + Key ID + Issuer ID | App Store Connect → Users and Access → Integrations → App Store Connect API → generate a key with **App Manager** role | EAS Submit to iOS |
| 2 | **Apple Team ID** and whether the account is **Individual or Organization** | Apple Developer → Membership | iOS submit + the whole Android timeline (§6) |
| 3 | **Google Play service account JSON** | Play Console → Setup → API access → link a Google Cloud project → create service account → grant **Release manager** → download JSON | EAS Submit to Android |
| 4 | **Play account type + production access status** | Play Console → Settings → Developer account → Account details | Whether Android ships Day 14 or Day 24 |
| 5 | **EAS login on this MacBook** — run `eas login`, or give me an `EXPO_TOKEN` | expo.dev → Account settings → Access tokens | All builds |
| 6 | **Mapbox secret download token** (`sk.…`, scope `DOWNLOADS:READ`) | Mapbox account → Tokens | Android builds fail without it |
| 7 | **Supabase Waypoint project** — service role key + permission to run migration 035 | Supabase dashboard → Project settings → API | Beacon backend |
| 8 | **Vercel env access** for the Waypoint project | Vercel dashboard | `CRON_SECRET` hardening + new API routes |
| 9 | *(Optional)* **Sentry DSN** | sentry.io, free tier | Crash visibility at the first real event — worth the 20 minutes |

Put 1, 3, and 6 somewhere on the MacBook I can reach (a `secrets/` folder inside `~/Code/waypoint` that's gitignored works) or paste them into EAS as secrets yourself with `eas secret:create`.

---

## 3. Domain & web

| # | Asset | Notes |
|---|---|---|
| 10 | **waypointtracking.com — registered, and pointed where?** | The single biggest open question. The tracker module's `DEFAULT_BASE_URL` already points at it. Does the Waypoint web app serve this domain, or is `app.chasingwaypoints.com` still the only live host? |
| 11 | **Decision: alias or separate site** | Cheapest path: add waypointtracking.com as a domain alias on the existing Vercel project so it serves the same app. Anything else is a second build. |
| 12 | **Privacy policy live at a public URL** | Draft exists in this project (`claude/privacy-policy-draft.md`). Both stores require a reachable URL, and Play cross-checks it against your Data Safety answers. |
| 13 | **Terms live at a public URL** | Draft exists (`claude/terms-and-conditions-draft.md`). |
| 14 | **Support email address** | Required by both stores. `support@chasingwaypoints.com` or similar — must actually receive mail. |
| 15 | **`apple-app-site-association` + `assetlinks.json`** | I generate them; they just have to be served from the domain. Automatic once Vercel serves it. |

---

## 4. Store listing assets

Existing in `mobile/assets/`: `icon.png`, `android-icon-foreground/background/monochrome.png`, `splash-icon.png`, `favicon.png`. Those cover the app itself. The **store listings** need more:

| # | Asset | Spec | Who |
|---|---|---|---|
| 16 | App icon, store-ready | 1024×1024 PNG, no alpha, no rounded corners | I can generate from the brand palette; you approve |
| 17 | **Play feature graphic** | 1024×500 PNG — required, Play won't publish without it | I generate |
| 18 | **iPhone screenshots** | 6.9" display, 3–10 shots | I capture from a simulator once the app runs |
| 19 | **iPad screenshots** | Only if `supportsTablet` stays `true` — it currently is. **Recommend flipping it to `false`** and skipping this entirely; nobody rides with an iPad. | Decision needed |
| 20 | **Android screenshots** | Phone, plus 7" and 10" tablet if you list tablet support | I capture |
| 21 | Short description | 80 characters | I draft, you approve |
| 22 | Full description | Up to 4000 characters | I draft — includes the measured battery number |
| 23 | **Android background-location demo video** | Screen recording on a real Android phone: disclosure screen → permission prompt → tracking running → the dot moving on the portal. Unlisted YouTube link. | **You must shoot this** — needs a physical device and your hands |
| 24 | Category + content rating answers | Play content rating questionnaire; App Store age rating | You answer, I can pre-fill |

Brand direction for all of it: Uniform Blue `#0C1E29` ground, Palesun Yellow `#FFFE15` accents, acid-green track lines, lime `#CCFF00` on primary actions. Note the current foreground-service notification color in `backgroundTracking.ts` is `#FAA634` — an orange that's in no part of your palette. Fixing.

---

## 5. Review-process assets

| # | Asset | Notes |
|---|---|---|
| 25 | **Demo account for reviewers** | A real Waypoint login (email + password) entered into an active test event, valid through review. Both stores require it since the app is behind auth. Your existing "Test" event works. |
| 26 | **Reviewer notes** | One paragraph explaining what the app does and how to see a dot move. I draft. |
| 27 | **Data Safety answers (Play)** and **App Privacy labels (iOS)** | I pre-fill; they must match the privacy policy word for word or it's an automatic rejection. |
| 28 | **Legal entity name + address for the listing** | Waypoint Group Holdings LLC. Play shows a public developer address. |

---

## 6. What I need from you before Day 1 — five items

1. **Play Console → Settings → Developer account → Account details.** Does it say Personal or Organization, and has any app reached production on it? This is the whole Android timeline.
2. **Apple Developer → Membership.** Individual or Organization? (If Organization, you have a free D-U-N-S already, which matters if #1 comes back Personal.)
3. **Is waypointtracking.com registered, and does anything serve it today?**
4. **Which Mac are you at right now?** This session is linked to the MacBook (`chasingwaypoints-mbp-local`) and I've got `~/Code/waypoint` connected. If you're at the Studio downstairs, say so before I write anything — the edits land here, not there.
5. **The credentials in §2, items 1, 3, 5 and 6.** Those four unblock actual building. 7 and 8 unblock the backend the same day.

Give me 1–4 and I can start on the code gaps in §1 immediately — those need no credentials at all. Items 1, 3, 5, 6 are only needed the first time we cut a build, which is Day 3.

---

## 7. Corrections to the spec doc

`claude/waypoint-tracker-app-spec.md` was written before this audit. Now corrected: Expo SDK **56** (not 54), migration **035** (not 014), EAS project already provisioned, bundle ID already `com.chasingwaypoints.waypoint`, and the v1 build is a repair-and-extend of `mobile/` rather than a fresh scaffold. The 14-day plan holds — Day 3 gets easier, Days 1–2 get a bug fix added.
