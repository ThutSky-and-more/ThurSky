import { requireAdmin } from "./_shared/auth.mjs";
import { supabaseAdmin, storageBucket } from "./_shared/supabase.mjs";
import { json, errorResponse, httpError, readJson } from "./_shared/http.mjs";
const MAX_SIZE = 5 * 1024 * 1024 * 1024;
export default async (req) => {
  try {
    await requireAdmin(); if (req.method !== "POST") throw httpError(405, "Methode nicht erlaubt.");
    const body = await readJson(req);
    if (!body.order_id || !body.file_name) throw httpError(400, "Bestellung oder Dateiname fehlt.");
    if (Number(body.size_bytes || 0) > MAX_SIZE) throw httpError(400, "Datei ist grösser als 5 GB.");
    const safeName = String(body.file_name).replace(/[^a-zA-Z0-9._-]+/g, "-");
    const storagePath = `${body.order_id}/${crypto.randomUUID()}-${safeName}`;
    const db = supabaseAdmin();
    const { data: order, error: orderError } = await db.from("orders").select("id").eq("id", body.order_id).single();
    if (orderError || !order) throw httpError(404, "Bestellung nicht gefunden.");
    const { data, error } = await db.storage.from(storageBucket()).createSignedUploadUrl(storagePath);
    if (error) throw error;
    return json({ storage_path: storagePath, signed_url: data.signedUrl, token: data.token });
  } catch (error) { return errorResponse(error); }
};
