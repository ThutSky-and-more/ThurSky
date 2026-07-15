import { createClient } from "@supabase/supabase-js";
let client;
export function supabaseAdmin() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw Object.assign(new Error("Supabase-Umgebungsvariablen fehlen."), { status: 500 });
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
export const storageBucket = () => process.env.SUPABASE_STORAGE_BUCKET || "customer-files";
