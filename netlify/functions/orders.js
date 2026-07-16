const { createClient } = require("@supabase/supabase-js");

const VERSION = "2026-07-16-ORDERS-EMAIL-V1";

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

const VALID_STATUSES = [
  "received",
  "planning",
  "confirmed",
  "captured",
  "recorded",
  "processing",
  "editing",
  "ready",
  "completed",
  "cancelled"
];

/* =========================================================
   ANTWORTEN UND FEHLER
========================================================= */

function json(statusCode, payload) {
  return {
    statusCode,
    headers: HEADERS,
    body: JSON.stringify(payload)
  };
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function handleError(error) {
  console.error(`[orders ${VERSION}] Fehler:`, error);

  const statusCode =
    Number(error?.statusCode) || 500;

  return json(statusCode, {
    error:
      statusCode >= 500
        ? "Interner Serverfehler"
        : error?.message || "Unbekannter Fehler",

    details:
      error?.message || String(error),

    version: VERSION
  });
}

/* =========================================================
   DATEN LESEN UND PRÜFEN
========================================================= */

function parseBody(event) {
  if (!event.body) {
    return {};
  }

  try {
    return JSON.parse(event.body);
  } catch {
    throw httpError(
      400,
      "Die übertragenen Daten sind ungültig."
    );
  }
}

function requiredText(value, label) {
  const text =
    String(value ?? "").trim();

  if (!text) {
    throw httpError(
      400,
      `${label} fehlt.`
    );
  }

  return text;
}

function optionalText(value) {
  const text =
    String(value ?? "").trim();

  return text || null;
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[character]
  );
}

/* =========================================================
   NETLIFY IDENTITY
========================================================= */

function getBearerToken(event) {
  const authorization =
    event.headers?.authorization ||
    event.headers?.Authorization ||
    "";

  const match =
    authorization.match(
      /^Bearer\s+(.+)$/i
    );

  if (!match?.[1]) {
    throw httpError(
      401,
      "Bitte zuerst anmelden."
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

function normalizeRoles(value) {
  if (Array.isArray(value)) {
    return value
      .map((role) =>
        String(role || "")
          .trim()
          .toLowerCase()
      )
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((role) =>
        role.trim().toLowerCase()
      )
      .filter(Boolean);
  }

  return [];
}

async function getVerifiedIdentityUser(event) {
  const token =
    getBearerToken(event);

  const origin =
    getSiteOrigin(event);

  const identityResponse =
    await fetch(
      `${origin}/.netlify/identity/user`,
      {
        method: "GET",

        headers: {
          authorization:
            `Bearer ${token}`,

          accept:
            "application/json"
        }
      }
    );

  const identityData =
    await identityResponse
      .json()
      .catch(() => null);

  if (
    !identityResponse.ok ||
    !identityData
  ) {
    console.error(
      `[orders ${VERSION}] Identity-Prüfung fehlgeschlagen:`,
      identityResponse.status,
      identityData
    );

    throw httpError(
      401,
      "Deine Anmeldung konnte nicht bestätigt werden. Bitte melde dich erneut an."
    );
  }

  const id =
    identityData?.id ||
    identityData?.sub ||
    identityData?.user?.id ||
    identityData?.user?.sub ||
    null;

  const email =
    identityData?.email ||
    identityData?.user?.email ||
    null;

  if (!id) {
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

  const roles = new Set([
    ...normalizeRoles(
      identityData?.app_metadata?.roles
    ),

    ...normalizeRoles(
      identityData?.appMetadata?.roles
    ),

    ...normalizeRoles(
      identityData?.roles
    ),

    ...normalizeRoles(
      identityData?.user
        ?.app_metadata
        ?.roles
    )
  ]);

  return {
    id: String(id),
    email: String(email),
    roles: Array.from(roles),
    isAdmin: roles.has("admin")
  };
}

/* =========================================================
   SUPABASE
========================================================= */

function getSupabase() {
  let url =
    String(
      process.env.SUPABASE_URL || ""
    ).trim();

  const serviceRoleKey =
    String(
      process.env
        .SUPABASE_SERVICE_ROLE_KEY ||
      ""
    ).trim();

  /*
   * Entfernt /rest/v1, falls es versehentlich
   * bei SUPABASE_URL eingetragen wurde.
   */
  url = url.replace(
    /\/rest\/v1\/?$/i,
    ""
  );

  if (!url) {
    throw httpError(
      500,
      "SUPABASE_URL fehlt."
    );
  }

  if (!serviceRoleKey) {
    throw httpError(
      500,
      "SUPABASE_SERVICE_ROLE_KEY fehlt."
    );
  }

  return createClient(
    url,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    }
  );
}

/* =========================================================
   BESTELLNUMMER UND DATUM
========================================================= */

function createOrderNumber() {
  const now = new Date();

  const datePart =
    now.getUTCFullYear() +
    String(
      now.getUTCMonth() + 1
    ).padStart(2, "0") +
    String(
      now.getUTCDate()
    ).padStart(2, "0");

  const randomPart =
    Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase();

  return `TS-${datePart}-${randomPart}`;
}

function formatDate(value) {
  if (!value) {
    return "Kein Wunschdatum angegeben";
  }

  const date =
    new Date(`${value}T12:00:00`);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(value);
  }

  return new Intl.DateTimeFormat(
    "de-CH",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }
  ).format(date);
}

/* =========================================================
   RESEND-E-MAIL
========================================================= */

async function sendResendEmail({
  to,
  subject,
  text,
  html,
  replyTo,
  idempotencyKey
}) {
  const apiKey =
    String(
      process.env.RESEND_API_KEY ||
      ""
    ).trim();

  const from =
    String(
      process.env.ORDER_EMAIL_FROM ||
      ""
    ).trim();

  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY fehlt."
    );
  }

  if (!from) {
    throw new Error(
      "ORDER_EMAIL_FROM fehlt."
    );
  }

  if (!to) {
    throw new Error(
      "Die Empfängeradresse fehlt."
    );
  }

  const payload = {
    from,
    to: [to],
    subject,
    text,
    html
  };

  if (replyTo) {
    payload.reply_to =
      replyTo;
  }

  const response =
    await fetch(
      "https://api.resend.com/emails",
      {
        method: "POST",

        headers: {
          authorization:
            `Bearer ${apiKey}`,

          "content-type":
            "application/json",

          ...(idempotencyKey
            ? {
                "idempotency-key":
                  idempotencyKey
              }
            : {})
        },

        body:
          JSON.stringify(payload)
      }
    );

  const responseData =
    await response
      .json()
      .catch(() => null);

  if (!response.ok) {
    const message =
      responseData?.message ||
      responseData?.error ||
      JSON.stringify(responseData) ||
      `HTTP ${response.status}`;

    throw new Error(
      `Resend-Fehler: ${message}`
    );
  }

  return responseData;
}

async function sendOrderNotification(order) {
  const recipient =
    String(
      process.env
        .ORDER_NOTIFICATION_EMAIL ||
      ""
    ).trim();

  if (!recipient) {
    console.warn(
      `[orders ${VERSION}] ` +
      "ORDER_NOTIFICATION_EMAIL fehlt. " +
      "E-Mail wird übersprungen."
    );

    return {
      sent: false,
      skipped: true,
      reason:
        "ORDER_NOTIFICATION_EMAIL fehlt."
    };
  }

  const desiredDate =
    formatDate(
      order.desired_date
    );

  const address = [
    order.street,
    [
      order.postal_code,
      order.city
    ]
      .filter(Boolean)
      .join(" ")
  ]
    .filter(Boolean)
    .join(", ");

  const backendUrl =
    "https://dronenshots-kemmental.ch/backend/";

  const subject =
    `Neue Bestellung ${order.order_number} – ` +
    `${order.package_name}`;

  const text = [
    "Eine neue Bestellung ist bei ThurSky eingegangen.",
    "",
    `Bestellnummer: ${order.order_number}`,
    `Kunde: ${order.customer_email}`,
    `Leistung: ${order.package_name}`,
    `Status: ${order.status}`,
    `Wunschdatum: ${desiredDate}`,
    `Adresse: ${address || "Keine Adresse angegeben"}`,
    "",
    "Nachricht des Kunden:",
    order.customer_message ||
      "Keine Nachricht angegeben.",
    "",
    `Admin-Backend: ${backendUrl}`
  ].join("\n");

  const html = `
    <!doctype html>
    <html lang="de">
      <body
        style="
          margin:0;
          padding:0;
          background:#f3f3f3;
          font-family:Arial,sans-serif;
          color:#222;
        "
      >
        <div
          style="
            width:100%;
            padding:30px 15px;
            box-sizing:border-box;
          "
        >
          <div
            style="
              max-width:680px;
              margin:0 auto;
              overflow:hidden;
              border-radius:20px;
              background:#ffffff;
              box-shadow:
                0 12px 30px
                rgba(0,0,0,.12);
            "
          >
            <div
              style="
                padding:28px;
                background:#256c70;
                color:#ffffff;
              "
            >
              <h1
                style="
                  margin:0;
                  font-size:28px;
                "
              >
                Neue Bestellung
              </h1>

              <p
                style="
                  margin:10px 0 0;
                  color:#ffffff;
                "
              >
                Eine neue Anfrage ist bei ThurSky
                eingegangen.
              </p>
            </div>

            <div style="padding:28px">
              <table
                cellpadding="0"
                cellspacing="0"
                role="presentation"
                style="
                  width:100%;
                  border-collapse:collapse;
                "
              >
                ${emailRow(
                  "Bestellnummer",
                  order.order_number
                )}

                ${emailRow(
                  "Kunde",
                  order.customer_email
                )}

                ${emailRow(
                  "Leistung",
                  order.package_name
                )}

                ${emailRow(
                  "Wunschdatum",
                  desiredDate
                )}

                ${emailRow(
                  "Adresse",
                  address ||
                    "Keine Adresse angegeben"
                )}
              </table>

              <div
                style="
                  margin-top:24px;
                  padding:18px;
                  border-left:
                    5px solid #f5a623;
                  border-radius:10px;
                  background:#f8f8f8;
                "
              >
                <strong>
                  Nachricht des Kunden
                </strong>

                <p
                  style="
                    margin:8px 0 0;
                    white-space:pre-wrap;
                    line-height:1.6;
                  "
                >${escapeHtml(
                  order.customer_message ||
                  "Keine Nachricht angegeben."
                )}</p>
              </div>

              <p style="margin:28px 0 0">
                <a
                  href="${backendUrl}"
                  style="
                    display:inline-block;
                    padding:14px 20px;
                    border-radius:12px;
                    background:#256c70;
                    color:#ffffff;
                    text-decoration:none;
                    font-weight:bold;
                  "
                >
                  Admin-Backend öffnen
                </a>
              </p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  const result =
    await sendResendEmail({
      to: recipient,
      subject,
      text,
      html,
      replyTo:
        order.customer_email,

      idempotencyKey:
        `new-order-admin-${order.id}`
    });

  console.log(
    `[orders ${VERSION}] ` +
    "Bestell-E-Mail gesendet:",
    result?.id
  );

  return {
    sent: true,
    id: result?.id || null
  };
}

function emailRow(label, value) {
  return `
    <tr>
      <td
        style="
          width:38%;
          padding:12px 10px;
          border-bottom:
            1px solid #e5e5e5;
          vertical-align:top;
          color:#5b6265;
        "
      >
        <strong>
          ${escapeHtml(label)}
        </strong>
      </td>

      <td
        style="
          padding:12px 10px;
          border-bottom:
            1px solid #e5e5e5;
          vertical-align:top;
        "
      >
        ${escapeHtml(value)}
      </td>
    </tr>
  `;
}

/* =========================================================
   BESTELLUNGEN LADEN
========================================================= */

async function listOrders(
  event,
  supabase,
  user
) {
  console.log(
    `[orders ${VERSION}] ` +
    `Lade Bestellungen für ${user.email}, ` +
    `admin=${user.isAdmin}`
  );

  let query =
    supabase
      .from("orders")
      .select(`
        *,
        order_files (
          id,
          order_id,
          original_name,
          mime_type,
          size_bytes,
          created_at
        )
      `)
      .order(
        "created_at",
        {
          ascending: false
        }
      );

  /*
   * Administratoren sehen alle Bestellungen.
   * Kunden sehen ausschließlich ihre eigenen.
   */
  if (!user.isAdmin) {
    query =
      query.eq(
        "customer_id",
        user.id
      );
  }

  const requestedId =
    optionalText(
      event
        .queryStringParameters
        ?.id
    );

  if (requestedId) {
    query =
      query.eq(
        "id",
        requestedId
      );
  }

  const {
    data,
    error
  } = await query;

  if (error) {
    throw new Error(
      `Bestellungen konnten nicht geladen werden: ${error.message}`
    );
  }

  const orders =
    (data || []).map(
      (order) => ({
        ...order,

        files:
          Array.isArray(
            order.order_files
          )
            ? order.order_files
            : [],

        order_files:
          undefined
      })
    );

  return json(200, {
    ok: true,
    orders,
    version: VERSION
  });
}

/* =========================================================
   BESTELLUNG ERSTELLEN
========================================================= */

async function createOrder(
  event,
  supabase,
  user
) {
  const input =
    parseBody(event);

  /*
   * Wenn ein Admin eine Bestellung erstellt,
   * darf das ausgewählte Kundenkonto verwendet werden.
   * Normale Kunden können nur für sich selbst bestellen.
   */
  const customerId =
    user.isAdmin &&
    optionalText(
      input.customer_id
    )
      ? requiredText(
          input.customer_id,
          "Die Kunden-ID"
        )
      : user.id;

  const customerEmail =
    user.isAdmin &&
    optionalText(
      input.customer_email
    )
      ? requiredText(
          input.customer_email,
          "Die Kunden-E-Mail"
        )
      : user.email;

  const requestedStatus =
    optionalText(
      input.status
    );

  const status =
    user.isAdmin &&
    requestedStatus &&
    VALID_STATUSES.includes(
      requestedStatus
    )
      ? requestedStatus
      : "received";

  const order = {
    order_number:
      createOrderNumber(),

    customer_id:
      requiredText(
        customerId,
        "Die Benutzer-ID"
      ),

    customer_email:
      requiredText(
        customerEmail,
        "Die E-Mail-Adresse"
      ),

    package_name:
      requiredText(
        input.package_name ??
        input.paket,
        "Das gewünschte Paket"
      ),

    status,

    desired_date:
      optionalText(
        input.desired_date ??
        input.datum
      ),

    street:
      optionalText(
        input.street ??
        input.strasse
      ),

    postal_code:
      optionalText(
        input.postal_code ??
        input.plz
      ),

    city:
      optionalText(
        input.city ??
        input.ort
      ),

    customer_message:
      optionalText(
        input.customer_message ??
        input.nachricht
      ),

    admin_message:
      optionalText(
        input.admin_message
      )
  };

  /*
   * Bei einer Kundenbestellung Adresse verlangen.
   * Ein Admin darf Bestellungen ohne Adresse erstellen.
   */
  if (!user.isAdmin) {
    order.street =
      requiredText(
        order.street,
        "Die Strasse"
      );

    order.postal_code =
      requiredText(
        order.postal_code,
        "Die Postleitzahl"
      );

    order.city =
      requiredText(
        order.city,
        "Der Ort"
      );
  }

  console.log(
    `[orders ${VERSION}] ` +
    `Neue Bestellung für ${order.customer_email}`
  );

  const {
    data,
    error
  } = await supabase
    .from("orders")
    .insert(order)
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `Bestellung konnte nicht gespeichert werden: ${error.message}`
    );
  }

  /*
   * Die E-Mail darf die erfolgreiche Bestellung
   * niemals rückgängig machen.
   */
  let emailNotification = {
    sent: false,
    skipped: false,
    error: null
  };

  try {
    emailNotification =
      await sendOrderNotification(
        data
      );
  } catch (emailError) {
    console.error(
      `[orders ${VERSION}] ` +
      "Bestellung wurde gespeichert, " +
      "aber die E-Mail konnte nicht gesendet werden:",
      emailError
    );

    emailNotification = {
      sent: false,
      skipped: false,
      error:
        emailError?.message ||
        String(emailError)
    };
  }

  return json(201, {
    ok: true,

    message:
      "Die Bestellung wurde erfolgreich gespeichert.",

    order: data,

    email_notification_sent:
      emailNotification.sent === true,

    version: VERSION
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

  const input =
    parseBody(event);

  const orderId =
    requiredText(
      input.id ??
      input.order_id,
      "Die Bestell-ID"
    );

  const updates = {};

  if (
    input.status !== undefined
  ) {
    const status =
      requiredText(
        input.status,
        "Der Status"
      );

    if (
      !VALID_STATUSES.includes(
        status
      )
    ) {
      throw httpError(
        400,
        `Ungültiger Status: ${status}`
      );
    }

    updates.status =
      status;
  }

  if (
    input.admin_message !==
    undefined
  ) {
    updates.admin_message =
      optionalText(
        input.admin_message
      );
  }

  if (
    input.package_name !==
    undefined
  ) {
    updates.package_name =
      requiredText(
        input.package_name,
        "Das Paket"
      );
  }

  if (
    input.desired_date !==
    undefined
  ) {
    updates.desired_date =
      optionalText(
        input.desired_date
      );
  }

  if (
    input.street !== undefined
  ) {
    updates.street =
      optionalText(
        input.street
      );
  }

  if (
    input.postal_code !==
    undefined
  ) {
    updates.postal_code =
      optionalText(
        input.postal_code
      );
  }

  if (
    input.city !== undefined
  ) {
    updates.city =
      optionalText(
        input.city
      );
  }

  if (
    Object.keys(updates)
      .length === 0
  ) {
    throw httpError(
      400,
      "Es wurden keine Änderungen übertragen."
    );
  }

  updates.updated_at =
    new Date().toISOString();

  const {
    data,
    error
  } = await supabase
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
    version: VERSION
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

  const input =
    event.body
      ? parseBody(event)
      : {};

  const orderId =
    requiredText(
      event
        .queryStringParameters
        ?.id ??
      input.id ??
      input.order_id,
      "Die Bestell-ID"
    );

  const {
    error
  } = await supabase
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

    version: VERSION
  });
}

/* =========================================================
   HAUPTFUNKTION
========================================================= */

exports.handler =
  async function handler(event) {
    try {
      console.log(
        `[orders ${VERSION}] ` +
        `${event.httpMethod}`
      );

      if (
        event.httpMethod ===
        "OPTIONS"
      ) {
        return {
          statusCode: 204,
          headers: HEADERS,
          body: ""
        };
      }

      const user =
        await getVerifiedIdentityUser(
          event
        );

      const supabase =
        getSupabase();

      switch (
        event.httpMethod
      ) {
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
