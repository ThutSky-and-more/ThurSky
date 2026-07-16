const { createClient } = require("@supabase/supabase-js");

const VERSION = "2026-07-16-FILE-UPLOAD-V1";

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024;

function json(statusCode, body) {
  return {
    statusCode,
    headers: HEADERS,
    body: JSON.stringify(body)
  };
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function handleError(error) {
  console.error(
    `[file-upload-url ${VERSION}]`,
    error
  );

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

function parseBody(event) {
  try {
    return event.body
      ? JSON.parse(event.body)
      : {};
  } catch {
    throw httpError(
      400,
      "Die übertragenen Daten sind ungültig."
    );
  }
}

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

async function requireAdmin(event) {
  const token = getBearerToken(event);
  const origin = getSiteOrigin(event);

  const response = await fetch(
    `${origin}/.netlify/identity/user`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json"
      }
    }
  );

  const user =
    await response
      .json()
      .catch(() => null);

  if (!response.ok || !user) {
    throw httpError(
      401,
      "Deine Anmeldung konnte nicht bestätigt werden."
    );
  }

  const roles =
    user?.app_metadata?.roles ||
    user?.roles ||
    [];

  const normalizedRoles =
    Array.isArray(roles)
      ? roles.map((role) =>
          String(role)
            .trim()
            .toLowerCase()
        )
      : [];

  if (!normalizedRoles.includes("admin")) {
    throw httpError(
      403,
      "Nur Administratoren dürfen Dateien hochladen."
    );
  }

  return user;
}

function getSupabase() {
  let url =
    String(
      process.env.SUPABASE_URL || ""
    ).trim();

  const key =
    String(
      process.env
        .SUPABASE_SERVICE_ROLE_KEY || ""
    ).trim();

  /*
   * Falls versehentlich /rest/v1 eingetragen wurde,
   * wird der Wert auf die Projekt-URL korrigiert.
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

  if (!key) {
    throw httpError(
      500,
      "SUPABASE_SERVICE_ROLE_KEY fehlt."
    );
  }

  return createClient(
    url,
    key,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );
}

function getBucket() {
  const bucket =
    String(
      process.env
        .SUPABASE_STORAGE_BUCKET ||
      "customer-files"
    ).trim();

  if (!bucket) {
    throw httpError(
      500,
      "SUPABASE_STORAGE_BUCKET fehlt."
    );
  }

  return bucket;
}

function safeFileName(value) {
  const original =
    String(value || "").trim();

  if (!original) {
    throw httpError(
      400,
      "Der Dateiname fehlt."
    );
  }

  return original
    .normalize("NFKD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[^a-zA-Z0-9._-]+/g,
      "-"
    )
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 180) || "datei";
}

exports.handler = async function handler(
  event
) {
  try {
    console.log(
      `[file-upload-url ${VERSION}] ${event.httpMethod}`
    );

    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 204,
        headers: HEADERS,
        body: ""
      };
    }

    if (event.httpMethod !== "POST") {
      throw httpError(
        405,
        "Diese HTTP-Methode ist nicht erlaubt."
      );
    }

    await requireAdmin(event);

    const body = parseBody(event);

    const orderId =
      String(body.order_id || "").trim();

    const fileName =
      safeFileName(body.file_name);

    const sizeBytes =
      Number(body.size_bytes || 0);

    if (!orderId) {
      throw httpError(
        400,
        "Die Bestell-ID fehlt."
      );
    }

    if (
      !Number.isFinite(sizeBytes) ||
      sizeBytes < 0
    ) {
      throw httpError(
        400,
        "Die Dateigrösse ist ungültig."
      );
    }

    if (sizeBytes > MAX_FILE_SIZE) {
      throw httpError(
        400,
        "Die Datei ist grösser als 5 GB."
      );
    }

    const supabase =
      getSupabase();

    /*
     * Prüfen, ob die Bestellung existiert.
     */
    const {
      data: order,
      error: orderError
    } = await supabase
      .from("orders")
      .select("id")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError) {
      throw new Error(
        `Bestellung konnte nicht geprüft werden: ${orderError.message}`
      );
    }

    if (!order) {
      throw httpError(
        404,
        "Die Bestellung wurde nicht gefunden."
      );
    }

    const storagePath =
      `${orderId}/` +
      `${crypto.randomUUID()}-${fileName}`;

    const bucket =
      getBucket();

    const {
      data,
      error
    } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(
        storagePath
      );

    if (error) {
      throw new Error(
        `Upload-URL konnte nicht erstellt werden: ${error.message}`
      );
    }

    if (!data?.token) {
      throw new Error(
        "Supabase hat keinen Upload-Token zurückgegeben."
      );
    }

    return json(200, {
      ok: true,
      storage_path: storagePath,
      token: data.token,
      signed_url:
        data.signedUrl || null,
      bucket,
      version: VERSION
    });
  } catch (error) {
    return handleError(error);
  }
};
