import { requireAdmin } from "./_shared/auth.mjs";
import { json, errorResponse } from "./_shared/http.mjs";
export default async () => {
  try {
    await requireAdmin();
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) throw Object.assign(new Error("SUPABASE_URL oder SUPABASE_ANON_KEY fehlt."), { status: 500 });
    return json({ supabase_url: supabaseUrl, supabase_anon_key: supabaseAnonKey, bucket: process.env.SUPABASE_STORAGE_BUCKET || "customer-files" });
  } catch (error) { return errorResponse(error); }
};
