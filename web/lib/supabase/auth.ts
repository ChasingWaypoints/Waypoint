import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { createClient } from "./server";

/**
 * Resolves the authenticated user from either:
 *   - An Authorization: Bearer <token> header (mobile app)
 *   - A session cookie (web browser)
 *
 * Returns { user, supabase } where supabase is scoped to that user's token,
 * or { user: null } if unauthenticated.
 */
export async function getUserFromRequest(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: { user } } = await supabase.auth.getUser(token);
    return { user, supabase };
  }

  // Fall back to cookie-based auth (web)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { user, supabase };
}
