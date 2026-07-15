const { createClient } = require("@supabase/supabase-js");
const crypto = require("node:crypto");

const RESPONSE_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, POST, PATCH, OPTIONS"
};

const ALLOWED_STATUSES = [
  "received",
  "planning",
  "confirmed",
  "captured",
  "editing",
  "ready",
  "completed",
  "cancelled"
];

const STATUS_LABELS = {
  received: "Anfrage eingegangen",
  planning: "Termin wird geplant",
  confirmed: "Termin bestätigt",
  captured: "Aufnahmen erstellt",
  editing: "In Bearbeitung",
  ready: "Bereit zum Download",
  completed: "Abgeschlossen",
  cancelled: "Storniert"
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: RESPONSE_HEADERS,
    body: JSON.stringify(payload)
  };
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseBody(event) {
  if (!event.body) return {};

  try {
    return JSON.parse(event.body);
  } catch {
    throw httpError(400, "Ungültige JSON-Daten.");
  }
}

function getUser(context) {
  const currentUser = context?.clientContext?.user;

  if (!currentUser) {
    throw httpError(401, "Bitte zuerst einloggen.");
  }

  return currentUser;
}

function getRoles(currentUser) {
  const roles = currentUser?.app_metadata?.roles;
  return Array.isArray(roles) ? roles : [];
}

function requireAdmin(context) {
  const currentUser = getUser(context);

  if (!getRoles(currentUser).includes("admin")) {
    throw httpError(403, "Nur Admins dürfen diese Aktion ausführen.");
  }

  return currentUser;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("Die Netlify-Variable SUPABASE_URL fehlt.");
  }

  if (!serviceKey) {
    throw new Error("Die Netlify-Variable SUPABASE_SERVICE_ROLE_KEY fehlt.");
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

function createOrderNumber() {
  const year = new Date().getFullYear();
  const datePart = Date.now().toString().slice(-8);
  const randomPart = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `TS-${year}-${datePart}-${randomPart}`;
}

function cleanText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function formatOrder(order) {
  const files = Array.isArray(order.order_files) ? order.order_files : [];

  return {
    ...order,
    status_label: STATUS_LABELS[order.status] || order.status,
    files,
    order_files: undefined
  };
}

function handleError(error) {
  console.error("Fehler in der Function orders:", error);

  const statusCode = Number(error?.statusCode) || 500;
  const publicMessage =
    statusCode >= 500
      ? "Interner Serverfehler"
      : error?.message || "Unbekannter Fehler";

  return json(statusCode, {
    error: publicMessage,
    details: error?.message || String(error)
  });
}

exports.handler = async function handler(event, context) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: RESPONSE_HEADERS,
      body: ""
    };
  }

  try {
    const currentUser = getUser(context);
    const isAdmin = getRoles(currentUser).includes("admin");
    const supabase = getSupabase();

    if (event.httpMethod === "GET") {
      const wantsAllOrders =
        event.queryStringParameters?.scope === "all" && isAdmin;

      let query = supabase
        .from("orders")
        .select(
          `
            *,
            order_files (
              id,
              original_name,
              mime_type,
              size_bytes,
              created_at
            )
          `
        )
        .order("created_at", { ascending: false });

      if (!wantsAllOrders) {
        query = query.eq("customer_id", currentUser.id);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Bestellungen konnten nicht geladen werden: ${error.message}`);
      }

      return json(200, {
        orders: (data || []).map(formatOrder)
      });
    }

    if (event.httpMethod === "POST") {
      const requestBody = parseBody(event);
      const packageName = cleanText(requestBody.package_name);

      if (!packageName) {
        throw httpError(400, "Bitte eine Leistung auswählen.");
      }

      const newOrder = {
        order_number: createOrderNumber(),
        customer_id: currentUser.id,
        customer_email: currentUser.email,
        package_name: packageName,
        status: "received",
        desired_date: requestBody.desired_date || null,
        street: cleanText(requestBody.street),
        postal_code: cleanText(requestBody.postal_code),
        city: cleanText(requestBody.city),
        customer_message: cleanText(requestBody.customer_message),
        admin_message: null
      };

      const { data, error } = await supabase
        .from("orders")
        .insert(newOrder)
        .select()
        .single();

      if (error) {
        throw new Error(`Bestellung konnte nicht gespeichert werden: ${error.message}`);
      }

      return json(201, {
        message: "Bestellung wurde gespeichert.",
        order: formatOrder(data)
      });
    }

    if (event.httpMethod === "PATCH") {
      requireAdmin(context);

      const requestBody = parseBody(event);
      const orderId = cleanText(requestBody.id);
      const status = cleanText(requestBody.status);

      if (!orderId) {
        throw httpError(400, "Die Bestell-ID fehlt.");
      }

      if (!status || !ALLOWED_STATUSES.includes(status)) {
        throw httpError(400, "Der ausgewählte Bestellstatus ist ungültig.");
      }

      const update = {
        status,
        admin_message: cleanText(requestBody.admin_message),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from("orders")
        .update(update)
        .eq("id", orderId)
        .select()
        .single();

      if (error) {
        throw new Error(`Bestellung konnte nicht aktualisiert werden: ${error.message}`);
      }

      return json(200, {
        message: "Bestellung wurde aktualisiert.",
        order: formatOrder(data)
      });
    }

    throw httpError(405, "Diese Anfragemethode ist nicht erlaubt.");
  } catch (error) {
    return handleError(error);
  }
};
