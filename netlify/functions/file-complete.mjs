import { requireAdmin } from "./_shared/auth.mjs";
import { supabaseAdmin } from "./_shared/supabase.mjs";
import { json, errorResponse, httpError, readJson } from "./_shared/http.mjs";
export default async (req) => {
  try {
    await requireAdmin(); if (req.method !== "POST") throw httpError(405, "Methode nicht erlaubt.");
    const b = await readJson(req);
    if (!b.order_id || !b.storage_path || !b.original_name) throw httpError(400, "Dateidaten unvollständig.");
    const db = supabaseAdmin();
    const { data, error } = await db.from("order_files").insert({ order_id:b.order_id, storage_path:b.storage_path, original_name:String(b.original_name), mime_type:String(b.mime_type || "application/octet-stream"), size_bytes:Number(b.size_bytes || 0) }).select().single();
    if (error) throw error; return json({ file:data }, 201);
  } catch (error) { return errorResponse(error); }
};
