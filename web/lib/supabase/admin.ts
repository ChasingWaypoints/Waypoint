import { createClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS entirely.
// Requires SUPABASE_SERVICE_ROLE_KEY in environment.
// Prefer SECURITY DEFINER RPCs (via createAnonClient) over this where possible.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Anon-key client for server-side routes that call SECURITY DEFINER RPCs.
// The anon key is already public (NEXT_PUBLIC_), so this is safe to use in
// any API route.  SECURITY DEFINER functions provide the elevated access.
export function createAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
