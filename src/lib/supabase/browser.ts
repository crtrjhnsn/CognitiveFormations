import { createBrowserClient } from "@supabase/ssr";

// Browser client, used only to upload files to a signed URL the server issued.
export function createBrowserSupabase() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
