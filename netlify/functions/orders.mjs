import { requireUser } from "./_shared/auth.mjs";
import { supabaseAdmin } from "./_shared/supabase.mjs";
import { json, errorResponse, httpError, readJson } from "./_shared/http.mjs";
import { VALID_STATUSES, withStatusLabel, makeOrderNumber } from "./_shared/orders.mjs";

export default async (req) => {
  try {
    const user = await requireUser();
    const isAdmin = user.roles?.includes("admin");
    const db = supabaseAdmin();
    if (req.method === "GET") {
      const url = new URL(req.url);
      let query = db.from("orders").select("*, order_files(id,original_name,mime_type,size_bytes,created_at)").order("created_at", { ascending: false });
      if (!(isAdmin && url.searchParams.get("scope") === "all")) query = query.eq("customer_id", user.id);
      const { data, error } = await query;
      if (error) throw error;
      return json({ orders: (data || []).map((o) => withStatusLabel({ ...o, files: o.order_files || [], order_files: undefined })) });
    }
    if (req.method === "POST") {
      const body = await readJson(req);
      const customerId = isAdmin ? String(body.customer_id || "") : user.id;
      const customerEmail = isAdmin ? String(body.customer_email || "") : user.email;
      if (!customerId || !customerEmail) throw httpError(400, "Kunde fehlt.");
      if (!String(body.package_name || "").trim()) throw httpError(400, "Leistung fehlt.");
      const status = isAdmin && VALID_STATUSES.includes(body.status) ? body.status : "received";
      const row = {
        order_number: makeOrderNumber(), customer_id: customerId, customer_email: customerEmail,
        package_name: String(body.package_name).trim(), status,
        desired_date: body.desired_date || null,
        street: String(body.street || "").trim() || null, postal_code: String(body.postal_code || "").trim() || null,
        city: String(body.city || "").trim() || null, customer_message: String(body.customer_message || "").trim() || null,
        admin_message: isAdmin ? String(body.admin_message || "").trim() || null : null
      };
      const { data, error } = await db.from("orders").insert(row).select().single();
      if (error) throw error;
      return json({ order: withStatusLabel(data) }, 201);
    }
    if (req.method === "PATCH") {
      if (!isAdmin) throw httpError(403, "Nur Admins dürfen Bestellungen bearbeiten.");
      const body = await readJson(req);
      if (!body.id) throw httpError(400, "Bestell-ID fehlt.");
      const patch = {};
      if (body.status !== undefined) { if (!VALID_STATUSES.includes(body.status)) throw httpError(400, "Ungültiger Status."); patch.status = body.status; }
      if (body.admin_message !== undefined) patch.admin_message = String(body.admin_message || "").trim() || null;
      patch.updated_at = new Date().toISOString();
      const { data, error } = await db.from("orders").update(patch).eq("id", body.id).select().single();
      if (error) throw error;
      return json({ order: withStatusLabel(data) });
    }
    throw httpError(405, "Methode nicht erlaubt.");
  } catch (error) { return errorResponse(error); }
};
