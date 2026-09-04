import Stripe from "stripe";

// Lazy singleton — never instantiate at module load (build has no secret key).
let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!_stripe) _stripe = new Stripe(key);
  return _stripe;
}

// Event pricing: $200 up to 60 entrants, then $2 per additional entrant.
export function eventPriceCents(entrantCount: number): number {
  const base = 20000;
  const overage = Math.max(0, entrantCount - 60) * 200;
  return base + overage;
}
