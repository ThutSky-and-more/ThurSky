import { requireUser } from "./_shared/auth.mjs";
import { supabaseAdmin, storageBucket } from "./_shared/supabase.mjs";
import { json, errorResponse, httpError } from "./_shared/http.mjs";
export default async (req) => {
  try {
    const user = await requireUser(); if (req.method !== "GET") throw httpError(405, "Methode nicht erlaubt.");
    const id = new URL(req.url).searchParams.get("id"); if (!id) throw httpError(400, "Datei-ID fehlt.");
    const db = supabaseAdmin();
    const { data:file, error } = await db.from("order_files").select("id,storage_path,original_name,orders!inner(customer_id)").eq("id", id).single();
    if (error || !file) throw httpError(404, "Datei nicht gefunden.");
    const isAdmin = user.roles?.includes("admin");
    if (!isAdmin && file.orders.customer_id !== user.id) throw httpError(403, "Kein Zugriff auf diese Datei.");
    const { data:signed, error:signError } = await db.storage.from(storageBucket()).createSignedUrl(file.storage_path, 120, { download: file.original_name });
    if (signError) throw signError; return json({ url:signed.signedUrl, expires_in:120 });
  } catch (error) { return errorResponse(error); }
};
