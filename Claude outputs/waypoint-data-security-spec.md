# Waypoint — Data Security & Privacy Specification

**Product:** Waypoint live event tracking (waypointtracking.com)
**Operator:** Waypoint Group Holdings LLC (DBA Chasing Waypoints Media)
**Scope:** How rider personal, health, and location data is classified, stored, transmitted, and accessed.
**Last updated:** 2026-09-10

---

## 1. Data we collect and how we classify it

| Category | Fields | Classification |
|---|---|---|
| Identity (PII) | Name, rider number, email, phone, date of birth | Personal data |
| Emergency contact | Contact name, phone, relationship | Personal data (third-party) |
| Health / ICE | Blood type, allergies | **Personal health information** (health data) |
| Location | Real-time and historical GPS position | Sensitive personal data (precise geolocation) |
| Billing | Stripe customer / subscription IDs only | Non-sensitive tokens; **no card data stored** |

We do **not** collect or store payment card numbers — card entry is handled entirely by Stripe Checkout.

## 2. Regulatory posture

- **We treat blood type and allergies as personal health information and protect them accordingly** — encryption, strict access limits, consent at capture, and defined retention (Sections 3–5).
- **This is not HIPAA "PHI," and we do not claim HIPAA compliance.** HIPAA "Protected Health Information" is a defined term that applies only to healthcare providers, health plans, clearinghouses, and their business associates. Waypoint is an event-tracking service and is none of these, so HIPAA does not govern this data. We call this out deliberately to avoid over-representing our regulatory status.
- **Applicable regimes:** U.S. state privacy law (notably California CPRA, under which health data *and* precise geolocation are "Sensitive Personal Information") and, for any EU/UK riders, GDPR/UK GDPR (health and precise location are special-category data). Our controls are built to the standard those regimes require: lawful basis via explicit consent, data minimization, purpose limitation, and defined retention.

## 3. Encryption

- **In transit:** All traffic is encrypted over HTTPS/TLS end to end (application edge and database).
- **At rest:** All data is encrypted at rest using AES-256, managed by our infrastructure provider (Supabase / PostgreSQL).

## 4. Access control

- **Row-Level Security (RLS)** is enforced at the database. Emergency/health fields on an event roster are readable **only by that event's organizer**; a rider's own profile is readable **only by that rider**.
- **Spectators have no access** to health, emergency-contact, or SOS data. The public live map returns only name, number, class, position, last-seen, and device type — verified in code.
- **Emergency ICE card** is served only via an unguessable 128-bit token, returns only ICE fields, and is marked private / no-store (not cached).
- **Recovery ("Command") access** that exposes ICE for responders is gated per-participant by token, and **every access is logged** with timestamp, IP, and user agent.
- **Secrets** (database service key, payment keys) are server-side only and never exposed to the browser.

## 5. Consent, minimization, purpose & retention

Sections 3 and 4 (encryption and access control) are **in place and verified today.** The items in this section are **policy commitments being finalized before real rider health data is collected:**

- **Consent at capture:** Health and location data are collected under explicit, informed consent presented at the point of entry, stating what is collected, why, who can see it, and for how long. Rider self-entry is preferred over third-party entry of a rider's health data.
- **Minimization:** Only fields needed for emergency response are collected.
- **Purpose limitation:** Health and location data are used solely for live event tracking and emergency response — never for advertising or resale. **We do not sell personal or location data.**
- **Retention:** Health/emergency data and precise location tracks are retained only for the operational life of the event and a defined post-event window, then deleted or anonymized.

## 6. Data subject rights

Riders may request access to, or deletion of, their personal data. Account and associated data deletion is supported via an authenticated deletion endpoint.

## 7. Sub-processors

- **Supabase** — application database and authentication (encryption at rest/in transit; SOC 2).
- **Vercel** — application hosting / edge delivery (TLS).
- **Stripe** — payment processing (PCI-DSS; card data never touches our systems).

## 8. Caveats (stated in good faith)

- This specification reflects a code- and schema-level security review, not a third-party penetration test. A pen test can be arranged for enterprise or insurer requirements.
- Platform-level security for the sub-processors above relies on their published compliance certifications.

---

*Prepared by Waypoint Group Holdings LLC. Contact for security and privacy questions: admin@chasingwaypoints.com.*
