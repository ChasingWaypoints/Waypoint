import Stripe from "stripe";

// Lazy singleton — never instantiate at module load (build has no secret key).
let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!_stripe) _stripe = new Stripe(key);
  return _stripe;
}

// ── Event seat pricing ──────────────────────────────────────────────────────
// $200 base unlocks 60 seats. Capacity beyond that is bought in blocks of 20
// seats for $40 ($2/seat). The join route enforces seats_paid as a hard cap,
// so overage can never leak on for free.
export const BASE_SEATS = 60;
export const BASE_CENTS = 20000;
export const SEATS_PER_BLOCK = 20;
export const SEAT_BLOCK_CENTS = 4000;

/** Blocks of 20 needed to cover `count` entrants beyond the 60 base. */
export function blocksForCount(entrantCount: number): number {
  return Math.max(0, Math.ceil((entrantCount - BASE_SEATS) / SEATS_PER_BLOCK));
}

/** Total seat capacity the base + overage blocks unlock for `count` entrants. */
export function seatsForCount(entrantCount: number): number {
  return BASE_SEATS + blocksForCount(entrantCount) * SEATS_PER_BLOCK;
}

/** Initial event price: $200 base plus $40 per overage block for current count. */
export function eventPriceCents(entrantCount: number): number {
  return BASE_CENTS + blocksForCount(entrantCount) * SEAT_BLOCK_CENTS;
}

/** Top-up price for adding N seat-blocks (20 seats / $40 each). */
export function seatBlockPriceCents(blocks: number): number {
  return Math.max(1, Math.floor(blocks)) * SEAT_BLOCK_CENTS;
}
