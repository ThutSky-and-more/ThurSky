from pathlib import Path

code = r'''const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function response(statusCode, data) {
  return {
    statusCode,
    headers: HEADERS,
    body: JSON.stringify(data),
  };
}

function errorResponse(error) {
  console.error("Fehler in der Function orders:", error);

  const statusCode = Number(error?.statusCode) || 500;

  return response(statusCode, {
    error:
      statusCode === 500
        ? "Interner Serverfehler"
        : error?.message || "Unbekannter Fehler",
    details: error?.message || String(error),
  });
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseBody(event) {
  if (!event.body) {
    return {};
  }

  try {
    return JSON.parse(event.body);
  } catch {
    throw httpError(400, "Die übermittelten Daten sind kein gültiges JSON.");
  }
}

function getUser(event) {
  const user = event?.context?.clientContext?.user;

  if (!user) {
    throw httpError(401, "Bitte zuerst anmelden.");
  }

  /*
   * Bei Netlify Identity befindet sich die Benutzer-ID üblicherweise in `sub`.
   * Manche Umgebungen liefern zusätzlich oder alternativ `id`.
   */
  const customerId = user.sub || user.id;

  if (!customerId) {
    console.error("Identity-Benutzer ohne sub/id:", user);
    throw httpError(
      401,
      "Die Benutzer-ID konnte nicht aus dem Login-Token gelesen werden."
    );
  }

  const email =
    user.email ||
    user.user_metadata?.email ||
    user.app_metadata?.email ||
    null;

  if (!email) {
    throw httpError(
      400,
      "Die E-Mail-Adresse konnte nicht aus dem Benutzerkonto gelesen werden."
    );
  }

  const roles = Array.isArray(user.roles)
    ? user.roles
    : Array.isArray(user.app_metadata?.roles)
      ? user.app_metadata.roles
      : [];

  return {
    raw: user,
    customerId,
    email,
    roles,
    isAdmin: roles.includes("admin"),
  };
}

function getSupabase() {
  if (!SUPABASE_URL) {
    throw httpError(500, "Die Umgebungsvariable SUPABASE_URL fehlt.");
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw httpError(
      500,
      "Die Umgebungsvariable SUPABASE_SERVICE_ROLE_KEY fehlt."
    );
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function createOrderNumber() {
  const now = new Date();
  const datePart = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
  ].join("");

  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();

  return `TS-${datePart}-${randomPart}`;
}

function normalizeNullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function normalizeRequiredString(value, fieldName) {
  const text = normalizeNullableString(value);

  if (!text) {
    throw httpError(400, `${fieldName} fehlt.`);
  }

  return text;
}

async function listOrders(event, supabase, user) {
  const params = event.queryStringParameters || {};
  const requestedId = normalizeNullableString(params.id);

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

  if (requestedId) {
    query = query.eq("id", requestedId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Bestellungen konnten nicht geladen werden: ${error.message}`);
  }

  return response(200, {
    ok: true,
    orders: data || [],
  });
}

async function createOrder(event, supabase, user) {
  const input = parseBody(event);

  const packageName = normalizeRequiredString(
    input.package_name || input.paket,
    "Das gewünschte Paket"
  );

  const street = normalizeRequiredString(
    input.street || input.strasse,
    "Die Strasse"
  );

  const postalCode = normalizeRequiredString(
    input.postal_code || input.plz,
    "Die Postleitzahl"
  );

  const city = normalizeRequiredString(
    input.city || input.ort,
    "Der Ort"
  );

  const desiredDate = normalizeNullableString(
    input.desired_date || input.datum
  );

  const customerMessage = normalizeNullableString(
    input.customer_message || input.nachricht
  );

  const order = {
    order_number: createOrderNumber(),

    // WICHTIG: Nicht nur user.id verwenden.
    customer_id: user.customerId,
    customer_email: user.email,

    package_name: packageName,
    status: "received",
    desired_date: desiredDate,
    street,
    postal_code: postalCode,
    city,
    customer_message: customerMessage,
    admin_message: null,
  };

  const { data, error } = await supabase
    .from("orders")
    .insert(order)
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Bestellung konnte nicht gespeichert werden: ${error.message}`
    );
  }

  return response(201, {
    ok: true,
    message: "Die Bestellung wurde erfolgreich gespeichert.",
    order: data,
  });
}

async function updateOrder(event, supabase, user) {
  if (!user.isAdmin) {
    throw httpError(403, "Nur Administratoren dürfen Bestellungen bearbeiten.");
  }

  const input = parseBody(event);

  const orderId = normalizeRequiredString(
    input.id || input.order_id,
    "Die Bestell-ID"
  );

  const allowedStatuses = [
    "received",
    "planning",
    "confirmed",
    "captured",
    "processing",
    "ready",
    "completed",
    "cancelled",
  ];

  const updates = {};

  if (input.status !== undefined) {
    const status = normalizeRequiredString(input.status, "Der Status");

    if (!allowedStatuses.includes(status)) {
      throw httpError(
        400,
        `Ungültiger Status. Erlaubt sind: ${allowedStatuses.join(", ")}.`
      );
    }

    updates.status = status;
  }

  if (input.admin_message !== undefined) {
    updates.admin_message = normalizeNullableString(input.admin_message);
  }

  if (input.package_name !== undefined) {
    updates.package_name = normalizeRequiredString(
      input.package_name,
      "Das Paket"
    );
  }

  if (input.desired_date !== undefined) {
    updates.desired_date = normalizeNullableString(input.desired_date);
  }

  if (input.street !== undefined) {
    updates.street = normalizeNullableString(input.street);
  }

  if (input.postal_code !== undefined) {
    updates.postal_code = normalizeNullableString(input.postal_code);
  }

  if (input.city !== undefined) {
    updates.city = normalizeNullableString(input.city);
  }

  if (Object.keys(updates).length === 0) {
    throw httpError(400, "Es wurden keine Änderungen übermittelt.");
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
      `Die Bestellung konnte nicht aktualisiert werden: ${error.message}`
    );
  }

  return response(200, {
    ok: true,
    message: "Die Bestellung wurde aktualisiert.",
    order: data,
  });
}

async function deleteOrder(event, supabase, user) {
  if (!user.isAdmin) {
    throw httpError(403, "Nur Administratoren dürfen Bestellungen löschen.");
  }

  const params = event.queryStringParameters || {};
  const input = event.body ? parseBody(event) : {};

  const orderId = normalizeRequiredString(
    params.id || input.id || input.order_id,
    "Die Bestell-ID"
  );

  const { error } = await supabase
    .from("orders")
    .delete()
    .eq("id", orderId);

  if (error) {
    throw new Error(
      `Die Bestellung konnte nicht gelöscht werden: ${error.message}`
    );
  }

  return response(200, {
    ok: true,
    message: "Die Bestellung wurde gelöscht.",
  });
}

exports.handler = async function handler(event) {
  try {
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 204,
        headers: HEADERS,
        body: "",
      };
    }

    const user = getUser(event);
    const supabase = getSupabase();

    switch (event.httpMethod) {
      case "GET":
        return await listOrders(event, supabase, user);

      case "POST":
        return await createOrder(event, supabase, user);

      case "PATCH":
      case "PUT":
        return await updateOrder(event, supabase, user);

      case "DELETE":
        return await deleteOrder(event, supabase, user);

      default:
        throw httpError(
          405,
          `Die HTTP-Methode ${event.httpMethod} wird nicht unterstützt.`
        );
    }
  } catch (error) {
    return errorResponse(error);
  }
};
'''

path = Path("/mnt/data/orders.js")
path.write_text(code, encoding="utf-8")
print(path)
