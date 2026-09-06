import type { Metadata } from "next";
import LegalDoc from "../../components/LegalDoc";

export const metadata: Metadata = {
  title: "Privacy Policy — Waypoint",
  description: "How Waypoint handles your location and emergency data.",
};

const MARKDOWN = `# Waypoint — Privacy Policy


**Effective date:** [DATE]
**Controller / operator:** [Legal entity — e.g. Waypoint Group Holdings LLC]
("Waypoint," "we," "us"), operator of app.chasingwaypoints.com (the "Service").
This Policy explains what we collect, why, who sees it, and your choices. It works
alongside our Terms of Service.

---

## 1. A note on sensitive data
The Service is built around two sensitive categories: **location data** and
**emergency/medical ("ICE") information** (emergency contact, blood type,
allergies). We treat these with extra care: ICE/medical data is stored only with
your explicit consent, is shown only to the event organizer and the authorized
command/recovery users they designate, and is **never** shown on public or
embedded maps.

## 2. Information we collect
- **Account:** email address and password (passwords are handled by our auth
  provider; we do not see them in plain text).
- **Profile (optional):** name, date of birth, phone, country, blood type, and
  emergency contact — provided by you.
- **Event participation:** rider name/number, class, device type, and the beacon
  feed links (Garmin inReach MapShare, SPOT feed, ZOLEO) you or an organizer add.
- **Location data:** positions reported by your GPS beacon or browser/phone
  tracker while you are tracking, including timestamps and, where available,
  altitude and speed.
- **Emergency/ICE data:** emergency contact, blood type, and allergies — collected
  only with your explicit, recorded consent (see Section 5), or provided by an
  organizer who represents they have your consent.
- **Payments:** processed by **Stripe**. We do **not** store full card numbers;
  we keep transaction and subscription identifiers and status.
- **Usage & technical:** IP address, device/browser info, and access logs
  (including logs of who accesses a Command/Google Earth feed via a shared token).

## 3. How we use information
To provide the Service (show live positions, run events, process payments); to
authenticate and secure accounts; to make emergency/ICE information available to
authorized organizer/command users during an event; to prevent abuse and enforce
our Terms; to communicate service and billing messages; and to comply with law.

## 4. How information is shared
- **With organizers and their command/recovery users:** an event's organizer, and
  the command users they authorize via a per-credential link, can see entrants'
  live positions and (for ICE-consented entrants) emergency information for that
  event. Command/Google Earth credentials **expire when the event ends**.
- **On public / embedded maps:** only when an organizer enables public sharing,
  and only non-sensitive fields (name, number, class, position, last-seen). ICE,
  medical, and SOS details are never included.
- **Sub-processors** that help run the Service: **Supabase** (database/hosting),
  **Vercel** (application hosting), **Mapbox** (maps), **Stripe** (payments), and
  the beacon networks you connect (**Garmin, SPOT, ZOLEO**). Each has its own
  privacy terms.
- **Legal / safety:** where required by law or to protect rights, safety, or the
  integrity of the Service.
- We do **not** sell your personal information.

## 5. Consent for emergency/medical data
When you enter emergency/medical information during registration, you are asked to
affirmatively consent, with wording substantially as follows, and the time of
consent is recorded:

> *"I consent to sharing this emergency and medical information with the event
> organizer and emergency responders for the purpose of this event."*

If you do not consent, that information is not stored. Where an **organizer**
enters an entrant's information (e.g. a roster upload), the organizer represents
that they have obtained the entrant's consent; organizers are the responsible
party for that data.

## 6. Retention
We keep account and profile data while your account is active. Event and location
data are retained to operate and show the event and its history [confirm retention
window with counsel]. Command/feed credentials stop working once an event ends.
You can delete your account (Section 7), which removes your associated data,
subject to limited records we must keep for legal, tax, or fraud-prevention
purposes.

## 7. Your choices and rights
- **Access / correction:** view and edit your profile in the app; an organizer can
  correct your event details (e.g. rider number/class).
- **Deletion:** delete your account from the app to remove your data.
- **Withdraw consent:** you can remove emergency/medical information you provided;
  removing it stops it from being shown going forward.
- Depending on where you live, you may have additional rights (e.g. under the
  **CCPA/CPRA** or **GDPR**) to access, correct, delete, or port your data, to
  object to or restrict processing, and to non-discrimination for exercising them.
  [Add the specific request channel and verification process with counsel.]

## 8. Security
Data is encrypted in transit (HTTPS) and at rest, access is restricted by
row-level security so only you and authorized organizer/command users can reach
your data, and sensitive links (ICE cards, command feeds) are gated by
unguessable tokens. No system is perfectly secure; we cannot guarantee absolute
security.

## 9. Children
The Service is not directed to children under [13/16]. We do not knowingly collect
their data. A minor may participate only through a parent/guardian or organizer who
provides the required consent. [Confirm age threshold and handling with counsel.]

## 10. International users
The Service is operated from the United States; using it means your data may be
processed in the U.S. [Add transfer mechanism/language if you serve EU/UK/other
regions.]

## 11. Changes to this Policy
We may update this Policy; material changes will be posted with a new effective
date and, where appropriate, notice.

## 12. Contact
[Company legal name], [address]. Privacy questions / data requests:
[privacy@ / support@ email].`;

export default function Page() {
  return <LegalDoc markdown={MARKDOWN} />;
}
