from pathlib import Path

code = r'''const { createClient } = require("@supabase/supabase-js");

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function send(statusCode, payload) {
  return {
    statusCode,
    headers: HEADERS,
    body: JSON.stringify(payload),
  };
}

function makeError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseJson(event) {
  if (!event.body) return {};

  try {
    return JSON.parse(event.body);
  } catch {
    throw makeError(400, "Ungültige JSON-Daten.");
  }
}

function getIdentityUser(event, context) {
  /*
   * Klassische Netlify Functions:
   * context.clientContext.user
   *
   * Manche Laufzeiten stellen den Kontext zusätzlich unter event.context bereit.
   */
  const user =
    context?.clientContext?.user ||
    event?.context?.clientContext?.user ||
    null;

  if (!user) {
    throw makeError(
      401,
      "Bitte zuerst anmelden. Das Identity-Token wurde von Netlify nicht erkannt."
    );
  }

  /*
   * Netlify Identity liefert die UUID meistens als `sub`.
   * In einigen Kontexten kann zusätzlich `id` vorhanden sein.
   */
  const customerId =
    user.sub ||
    user.id ||
    user.user_metadata?.id ||
    user.app_metadata?.id ||
    null;

  if (!customerId) {
    console.error("IDENTITY DEBUG – Benutzerobjekt:", JSON.stringify(user));
    throw makeError(
      401,
      "Im Identity-Token wurde keine Benutzer-ID gefunden."
    );
  }

  const email =
    user.email ||
    user.user_metadata?.email ||
    null;

  if (!email) {
    throw makeError(
      400,
      "Im Identity-Token wurde keine E-Mail-Adresse gefunden."
    );
  }

  const roles = Array.isArray(user.roles)
    ? user.roles
    : Array.isArray(user.app_metadata?.roles)
      ? user.app_metadata.roles
      : [];

  return {
    customerId: String(customerId),
    email: String(email),
    roles,
    isAdmin: roles.includes("admin"),
    raw: user,
  };
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw makeError(500, "SUPABASE_URL fehlt in Netlify.");
  }

  if (!key) {
    throw makeError(
      500,
      "SUPABASE_SERVICE_ROLE_KEY fehlt in Netlify."
    );
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function required(value, label) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw makeError(400, `${label} fehlt.`);
  }

  return text;
}

function optional(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function createOrderNumber() {
  const now = new Date();

  const date =
    now.getUTCFullYear() +
    String(now.getUTCMonth() + 1).padStart(2, "0") +
    String(now.getUTCDate()).padStart(2, "0");

  const random = Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase();

  return `TS-${date}-${random}`;
}

async function createOrder(event, supabase, user) {
  const input = parseJson(event);

  /*
   * Diese Prüfung läuft unmittelbar vor dem Insert.
   * Dadurch kann customer_id nicht unbemerkt null werden.
   */
  if (!user.customerId) {
    throw makeError(
      500,
      "Interner Fehler: customerId ist vor dem Speichern leer."
    );
  }

  const orderToInsert = {
    order_number: createOrderNumber(),
    customer_id: user.customerId,
    customer_email: user.email,
    package_name: required(
      input.package_name ?? input.paket,
      "Das gewünschte Paket"
    ),
    status: "received",
    desired_date: optional(
      input.desired_date ?? input.datum
    ),
    street: required(
      input.street ?? input.strasse,
      "Die Strasse"
    ),
    postal_code: required(
      input.postal_code ?? input.plz,
      "Die Postleitzahl"
    ),
    city: required(
      input.city ?? input.ort,
      "Der Ort"
    ),
    customer_message: optional(
      input.customer_message ?? input.nachricht
    ),
    admin_message: null,
  };

  console.log("ORDERS VERSION: 2026-07-16-IDENTITY-FIX");
  console.log("Speichere Bestellung für customer_id:", user.customerId);

  const { data, error } = await supabase
    .from("orders")
    .insert(orderToInsert)
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Bestellung konnte nicht gespeichert werden: ${error.message}`
    );
  }

  return send(201, {
    ok: true,
    message: "Bestellung erfolgreich gespeichert.",
    order: data,
  });
}

async function listOrders(event, supabase, user) {
  let query = supabase
    .from("orders")
    .select(`
      *,
      order_files (
        id,
        order_id,
        file_name,
        storage_path,
        mime_type,
        size_bytes,
        created_at
      )
    `)
    .order("created_at", { ascending: false });

  if (!user.isAdmin) {
    query = query.eq("customer_id", user.customerId);
  }

  const id = optional(event.queryStringParameters?.id);
  if (id) query = query.eq("id", id);

  const { data, error } = await query;

  if (error) {
    throw new Error(
      `Bestellungen konnten nicht geladen werden: ${error.message}`
    );
  }

  return send(200, {
    ok: true,
    orders: data || [],
  });
}

async function updateOrder(event, supabase, user) {
  if (!user.isAdmin) {
    throw makeError(
      403,
      "Nur Administratoren dürfen Bestellungen bearbeiten."
    );
  }

  const input = parseJson(event);
  const orderId = required(
    input.id ?? input.order_id,
    "Die Bestell-ID"
  );

  const updates = {};

  if (input.status !== undefined) {
    updates.status = required(input.status, "Der Status");
  }

  if (input.admin_message !== undefined) {
    updates.admin_message = optional(input.admin_message);
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("orders")
    .update(updates)
    .eq("id", orderId)
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Bestellung konnte nicht aktualisiert werden: ${error.message}`
    );
  }

  return send(200, {
    ok: true,
    order: data,
  });
}

exports.handler = async function handler(event, context) {
  try {
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 204,
        headers: HEADERS,
        body: "",
      };
    }

    const user = getIdentityUser(event, context);
    const supabase = getSupabase();

    if (event.httpMethod === "GET") {
      return await listOrders(event, supabase, user);
    }

    if (event.httpMethod === "POST") {
      return await createOrder(event, supabase, user);
    }

    if (
      event.httpMethod === "PATCH" ||
      event.httpMethod === "PUT"
    ) {
      return await updateOrder(event, supabase, user);
    }

    throw makeError(
      405,
      `HTTP-Methode ${event.httpMethod} wird nicht unterstützt.`
    );
  } catch (error) {
    console.error("Fehler in der Function orders:", error);

    const statusCode = Number(error?.statusCode) || 500;

    return send(statusCode, {
      error:
        statusCode === 500
          ? "Interner Serverfehler"
          : error?.message || "Fehler",
      details: error?.message || String(error),
    });
  }
};
'''

path = Path("/mnt/data/orders-context-fix.js")
path.write_text(code, encoding="utf-8")
print(path)
