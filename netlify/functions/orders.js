const { createClient } = require("@supabase/supabase-js");

const VERSION = "2026-07-16-ORDERS-FIX-V4";

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

/* =========================================================
   ALLGEMEINE HILFSFUNKTIONEN
========================================================= */

function json(statusCode, payload) {
  return {
    statusCode,
    headers: HEADERS,
    body: JSON.stringify(payload),
  };
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function handleError(error) {
  console.error(`[orders ${VERSION}] Fehler:`, error);

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
    throw httpError(400, "Die übertragenen Daten sind ungültig.");
  }
}

function requiredText(value, label) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw httpError(400, `${label} fehlt.`);
  }

  return text;
}

function optionalText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

/* =========================================================
   NETLIFY IDENTITY
========================================================= */

function getBearerToken(event) {
  const authorization =
    event.headers?.authorization ||
    event.headers?.Authorization ||
    "";

  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match?.[1]) {
    throw httpError(
      401,
      "Bitte zuerst anmelden. Es wurde kein Login-Token übertragen."
    );
  }

  return match[1].trim();
}

function getSiteOrigin(event) {
  const host =
    event.headers?.["x-forwarded-host"] ||
    event.headers?.host;

  const protocol =
    event.headers?.["x-forwarded-proto"] ||
    "https";

  if (!host) {
    throw httpError(
      500,
      "Die Website-Adresse konnte nicht ermittelt werden."
    );
  }

  return `${protocol}://${host}`;
}

async function getVerifiedIdentityUser(event) {
  const token = getBearerToken(event);
  const origin = getSiteOrigin(event);

  const identityResponse = await fetch(
    `${origin}/.netlify/identity/user`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
      },
    }
  );

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

    throw httpError(
      401,
      "Deine Anmeldung konnte nicht bestätigt werden. Bitte melde dich neu an."
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
      `[orders ${VERSION}] Keine Benutzer-ID gefunden:`,
      JSON.stringify(identityData)
    );

    throw httpError(
      500,
      "Netlify Identity hat keine Benutzer-ID zurückgegeben."
    );
  }

  if (!email) {
    throw httpError(
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
    isAdmin:
      Array.isArray(roles) &&
      roles.includes("admin"),
  };
}

/* =========================================================
   SUPABASE
========================================================= */

function getSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw httpError(
      500,
      "SUPABASE_URL fehlt in den Netlify-Umgebungsvariablen."
    );
  }

  if (!serviceRoleKey) {
    throw httpError(
      500,
      "SUPABASE_SERVICE_ROLE_KEY fehlt in den Netlify-Umgebungsvariablen."
    );
  }

  return createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}

/* =========================================================
   BESTELLNUMMER
========================================================= */

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

/* =========================================================
   BESTELLUNGEN LADEN
========================================================= */

async function listOrders(event, supabase, user) {
  console.log(
    `[orders ${VERSION}] Lade Bestellungen für ${user.email}, admin=${user.isAdmin}`
  );

  /*
   * Wichtig:
   * Hier wird absichtlich nur die Tabelle "orders" geladen.
   * Die Tabelle "order_files" wird später separat behandelt.
   */
  let query = supabase
    .from("orders")
    .select("*")
    .order("created_at", {
      ascending: false,
    });

  /*
   * Kunden sehen nur ihre eigenen Bestellungen.
   * Administratoren sehen alle Bestellungen.
   */
  if (!user.isAdmin) {
    query = query.eq(
      "customer_id",
      user.customerId
    );
  }

  const requestedId = optionalText(
    event.queryStringParameters?.id
  );

  if (requestedId) {
    query = query.eq("id", requestedId);
  }

  const { data, error } = await query;

  if (error) {
    console.error(
      `[orders ${VERSION}] Supabase-Fehler beim Laden:`,
      error
    );

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

/* =========================================================
   BESTELLUNG ERSTELLEN
========================================================= */

async function createOrder(event, supabase, user) {
  const input = parseBody(event);

  const order = {
    order_number: createOrderNumber(),

    customer_id: requiredText(
      user.customerId,
      "Die Benutzer-ID"
    ),

    customer_email: requiredText(
      user.email,
      "Die E-Mail-Adresse"
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
      input.customer_message ??
      input.nachricht
    ),

    admin_message: null,
  };

  console.log(
    `[orders ${VERSION}] Neue Bestellung`
  );

  console.log(
    `[orders ${VERSION}] customer_id=${order.customer_id}`
  );

  console.log(
    `[orders ${VERSION}] customer_email=${order.customer_email}`
  );

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

  return json(201, {
    ok: true,
    message:
      "Deine Bestellung wurde erfolgreich gespeichert.",
    order: data,
    version: VERSION,
  });
}

/* =========================================================
   BESTELLUNG AKTUALISIEREN
========================================================= */

async function updateOrder(
  event,
  supabase,
  user
) {
  if (!user.isAdmin) {
    throw httpError(
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
    const status = requiredText(
      input.status,
      "Der Status"
    );

    if (!allowedStatuses.includes(status)) {
      throw httpError(
        400,
        `Ungültiger Status: ${status}`
      );
    }

    updates.status = status;
  }

  if (input.admin_message !== undefined) {
    updates.admin_message = optionalText(
      input.admin_message
    );
  }

  if (input.package_name !== undefined) {
    updates.package_name = requiredText(
      input.package_name,
      "Das Paket"
    );
  }

  if (input.desired_date !== undefined) {
    updates.desired_date = optionalText(
      input.desired_date
    );
  }

  if (input.street !== undefined) {
    updates.street = optionalText(
      input.street
    );
  }

  if (input.postal_code !== undefined) {
    updates.postal_code = optionalText(
      input.postal_code
    );
  }

  if (input.city !== undefined) {
    updates.city = optionalText(
      input.city
    );
  }

  if (Object.keys(updates).length === 0) {
    throw httpError(
      400,
      "Es wurden keine Änderungen übertragen."
    );
  }

  updates.updated_at =
    new Date().toISOString();

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
    message:
      "Die Bestellung wurde aktualisiert.",
    order: data,
    version: VERSION,
  });
}

/* =========================================================
   BESTELLUNG LÖSCHEN
========================================================= */

async function deleteOrder(
  event,
  supabase,
  user
) {
  if (!user.isAdmin) {
    throw httpError(
      403,
      "Nur Administratoren dürfen Bestellungen löschen."
    );
  }

  const input = event.body
    ? parseBody(event)
    : {};

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
    message:
      "Die Bestellung wurde gelöscht.",
    version: VERSION,
  });
}

/* =========================================================
   HAUPTFUNKTION
========================================================= */

exports.handler = async function handler(event) {
  try {
    console.log(
      `[orders ${VERSION}] ${event.httpMethod}`
    );

    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 204,
        headers: HEADERS,
        body: "",
      };
    }

    const user =
      await getVerifiedIdentityUser(event);

    const supabase = getSupabase();

    switch (event.httpMethod) {
      case "GET":
        return await listOrders(
          event,
          supabase,
          user
        );

      case "POST":
        return await createOrder(
          event,
          supabase,
          user
        );

      case "PATCH":
      case "PUT":
        return await updateOrder(
          event,
          supabase,
          user
        );

      case "DELETE":
        return await deleteOrder(
          event,
          supabase,
          user
        );

      default:
        throw httpError(
          405,
          `Die HTTP-Methode ${event.httpMethod} wird nicht unterstützt.`
        );
    }
  } catch (error) {
    return handleError(error);
  }
};
