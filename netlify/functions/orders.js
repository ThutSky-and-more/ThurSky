from pathlib import Path

code = r'''const { createClient } = require("@supabase/supabase-js");

/**
 * ThurSky – Netlify Function: orders
 *
 * Datei:
 * netlify/functions/orders.js
 *
 * Benötigte Netlify-Variablen:
 * SUPABASE_URL
 * SUPABASE_SERVICE_ROLE_KEY
 *
 * Diese Version prüft das Netlify-Identity-Token direkt über
 * /.netlify/identity/user und verwendet die bestätigte Benutzer-ID.
 */

const VERSION = "2026-07-16-TOKEN-VERIFY-V1";

const RESPONSE_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: RESPONSE_HEADERS,
    body: JSON.stringify(payload),
  };
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function handleError(error) {
  console.error(`[orders ${VERSION}]`, error);

  const statusCode = Number(error?.statusCode) || 500;

  return json(statusCode, {
    error:
      statusCode >= 500
        ? "Interner Serverfehler"
        : error?.message || "Unbekannter Fehler",
    details: error?.message || String(error),
    version: VERSION,
  });
}

function parseBody(event) {
  if (!event.body) {
    return {};
  }

  try {
    return JSON.parse(event.body);
  } catch {
    throw createHttpError(400, "Die übertragenen Daten sind ungültig.");
  }
}

function requiredText(value, label) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw createHttpError(400, `${label} fehlt.`);
  }

  return text;
}

function optionalText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function getBearerToken(event) {
  const authorization =
    event.headers?.authorization ||
    event.headers?.Authorization ||
    "";

  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match?.[1]) {
    throw createHttpError(
      401,
      "Bitte zuerst anmelden. Es wurde kein Login-Token übertragen."
    );
  }

  return match[1].trim();
}

function getSiteOrigin(event) {
  const forwardedHost =
    event.headers?.["x-forwarded-host"] ||
    event.headers?.host;

  const forwardedProto =
    event.headers?.["x-forwarded-proto"] ||
    "https";

  if (!forwardedHost) {
    throw createHttpError(
      500,
      "Die Website-Adresse konnte in der Function nicht ermittelt werden."
    );
  }

  return `${forwardedProto}://${forwardedHost}`;
}

/**
 * Prüft das übertragene Token direkt bei Netlify Identity.
 * Die Antwort enthält unter anderem id, email und app_metadata.
 */
async function getVerifiedIdentityUser(event) {
  const token = getBearerToken(event);
  const origin = getSiteOrigin(event);
  const identityUrl = `${origin}/.netlify/identity/user`;

  const identityResponse = await fetch(identityUrl, {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
    },
  });

  let identityData = null;

  try {
    identityData = await identityResponse.json();
  } catch {
    identityData = null;
  }

  if (!identityResponse.ok) {
    console.error(
      `[orders ${VERSION}] Identity-Prüfung fehlgeschlagen:`,
      identityResponse.status,
      identityData
    );

    throw createHttpError(
      401,
      "Deine Anmeldung ist abgelaufen oder konnte nicht bestätigt werden. Bitte melde dich neu an."
    );
  }

  const customerId =
    identityData?.id ||
    identityData?.sub ||
    identityData?.user?.id ||
    identityData?.user?.sub ||
    null;

  const email =
    identityData?.email ||
    identityData?.user?.email ||
    null;

  if (!customerId) {
    console.error(
      `[orders ${VERSION}] Identity-Antwort ohne Benutzer-ID:`,
      JSON.stringify(identityData)
    );

    throw createHttpError(
      500,
      "Netlify Identity hat keine Benutzer-ID zurückgegeben."
    );
  }

  if (!email) {
    throw createHttpError(
      400,
      "Netlify Identity hat keine E-Mail-Adresse zurückgegeben."
    );
  }

  const roles =
    identityData?.app_metadata?.roles ||
    identityData?.roles ||
    identityData?.user?.app_metadata?.roles ||
    [];

  return {
    customerId: String(customerId),
    email: String(email),
    roles: Array.isArray(roles) ? roles : [],
    isAdmin: Array.isArray(roles) && roles.includes("admin"),
  };
}

function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw createHttpError(
      500,
      "SUPABASE_URL fehlt in den Netlify-Umgebungsvariablen."
    );
  }

  if (!serviceKey) {
    throw createHttpError(
      500,
      "SUPABASE_SERVICE_ROLE_KEY fehlt in den Netlify-Umgebungsvariablen."
    );
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function createOrderNumber() {
  const now = new Date();

  const datePart =
    now.getUTCFullYear() +
    String(now.getUTCMonth() + 1).padStart(2, "0") +
    String(now.getUTCDate()).padStart(2, "0");

  const randomPart = Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase();

  return `TS-${datePart}-${randomPart}`;
}

async function createOrder(event, supabase, user) {
  const input = parseBody(event);

  const orderToInsert = {
    order_number: createOrderNumber(),

    // Diese Werte stammen aus der geprüften Netlify-Identity-Antwort.
    customer_id: requiredText(
      user.customerId,
      "Die bestätigte Benutzer-ID"
    ),
    customer_email: requiredText(
      user.email,
      "Die bestätigte E-Mail-Adresse"
    ),

    package_name: requiredText(
      input.package_name ?? input.paket,
      "Das gewünschte Paket"
    ),
    status: "received",
    desired_date: optionalText(
      input.desired_date ?? input.datum
    ),
    street: requiredText(
      input.street ?? input.strasse,
      "Die Strasse"
    ),
    postal_code: requiredText(
      input.postal_code ?? input.plz,
      "Die Postleitzahl"
    ),
    city: requiredText(
      input.city ?? input.ort,
      "Der Ort"
    ),
    customer_message: optionalText(
      input.customer_message ?? input.nachricht
    ),
    admin_message: null,
  };

  console.log(`[orders ${VERSION}] Function aktiv`);
  console.log(
    `[orders ${VERSION}] Speichere Bestellung für customer_id=${orderToInsert.customer_id}`
  );

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

  return json(201, {
    ok: true,
    message: "Deine Bestellung wurde erfolgreich gespeichert.",
    order: data,
    version: VERSION,
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

  const requestedId = optionalText(
    event.queryStringParameters?.id
  );

  if (requestedId) {
    query = query.eq("id", requestedId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(
      `Bestellungen konnten nicht geladen werden: ${error.message}`
    );
  }

  return json(200, {
    ok: true,
    orders: data || [],
    version: VERSION,
  });
}

async function updateOrder(event, supabase, user) {
  if (!user.isAdmin) {
    throw createHttpError(
      403,
      "Nur Administratoren dürfen Bestellungen bearbeiten."
    );
  }

  const input = parseBody(event);

  const orderId = requiredText(
    input.id ?? input.order_id,
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
    const status = requiredText(input.status, "Der Status");

    if (!allowedStatuses.includes(status)) {
      throw createHttpError(
        400,
        `Ungültiger Status: ${status}`
      );
    }

    updates.status = status;
  }

  if (input.admin_message !== undefined) {
    updates.admin_message = optionalText(input.admin_message);
  }

  if (input.package_name !== undefined) {
    updates.package_name = requiredText(
      input.package_name,
      "Das Paket"
    );
  }

  if (input.desired_date !== undefined) {
    updates.desired_date = optionalText(input.desired_date);
  }

  if (Object.keys(updates).length === 0) {
    throw createHttpError(
      400,
      "Es wurden keine Änderungen übertragen."
    );
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

  return json(200, {
    ok: true,
    message: "Die Bestellung wurde aktualisiert.",
    order: data,
    version: VERSION,
  });
}

async function deleteOrder(event, supabase, user) {
  if (!user.isAdmin) {
    throw createHttpError(
      403,
      "Nur Administratoren dürfen Bestellungen löschen."
    );
  }

  const input = event.body ? parseBody(event) : {};

  const orderId = requiredText(
    event.queryStringParameters?.id ??
      input.id ??
      input.order_id,
    "Die Bestell-ID"
  );

  const { error } = await supabase
    .from("orders")
    .delete()
    .eq("id", orderId);

  if (error) {
    throw new Error(
      `Bestellung konnte nicht gelöscht werden: ${error.message}`
    );
  }

  return json(200, {
    ok: true,
    message: "Die Bestellung wurde gelöscht.",
    version: VERSION,
  });
}

exports.handler = async function handler(event) {
  try {
    console.log(`[orders ${VERSION}] ${event.httpMethod}`);

    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 204,
        headers: RESPONSE_HEADERS,
        body: "",
      };
    }

    const user = await getVerifiedIdentityUser(event);
    const supabase = getSupabaseClient();

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
        throw createHttpError(
          405,
          `Die HTTP-Methode ${event.httpMethod} wird nicht unterstützt.`
        );
    }
  } catch (error) {
    return handleError(error);
  }
};
'''

path = Path("/mnt/data/orders.js")
path.write_text(code, encoding="utf-8")
print(path)
