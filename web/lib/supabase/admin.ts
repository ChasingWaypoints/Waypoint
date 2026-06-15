import { createClient } from "@supabase/supabase-js";

// Service-role client — never expose to the browser
// Used only in server-side API routes that need admin privileges
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
