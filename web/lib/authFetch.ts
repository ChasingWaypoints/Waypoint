"use client";

import { getSupabaseClient } from "./supabase/client";

/**
 * The web client keeps its Supabase session in localStorage, so server
 * routes that authenticate a user need the access token sent explicitly
 * as a Bearer header (getUserFromRequest reads it). Cookie-only requests
 * come back 401. Use authFetch for any API route that requires the user.
 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const supabase = getSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(init.headers || {});
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }
  return fetch(input, { ...init, headers });
}
