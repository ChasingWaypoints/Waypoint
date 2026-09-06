// Pure pricing helpers — safe to import from client components (no Stripe SDK).

// Riders pay per-event by how long they are tracked: <=3 days $10, <=7 days
// $12, else $15. Derived from the event's starts_at/ends_at.
export function eventDurationDays(startsAt?: string | null, endsAt?: string | null): number | null {
  if (!startsAt || !endsAt) return null;
  const a = new Date(startsAt).getTime();
  const b = new Date(endsAt).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1); // inclusive of both days
}

export function entrantFeeCentsForDays(days: number | null): number {
  if (!days || days <= 3) return 1000; // up to 3 days
  if (days <= 7) return 1200;          // up to 7 days
  return 1500;                         // up to 30 days (and beyond)
}
