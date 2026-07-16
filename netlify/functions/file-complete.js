const { createClient } = require("@supabase/supabase-js");

const VERSION = "2026-07-16-FILE-COMPLETE-V1";

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

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
    `[file-complete ${VERSION}]`,
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

  const isAdmin =
    Array.isArray(roles) &&
    roles.some(
      (role) =>
        String(role)
          .trim()
          .toLowerCase() === "admin"
    );

  if (!isAdmin) {
    throw httpError(
      403,
      "Nur Administratoren dürfen Dateien freigeben."
    );
  }

  return user;
}

function getSupabase() {
  let url =
    String(
      process.env.SUPABASE_URL || ""
    ).trim();

  url = url.replace(
    /\/rest\/v1\/?$/i,
    ""
  );

  const key =
    String(
      process.env
        .SUPABASE_SERVICE_ROLE_KEY || ""
    ).trim();

  if (!url || !key) {
    throw httpError(
      500,
      "Supabase-Umgebungsvariablen fehlen."
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

exports.handler = async function handler(
  event
) {
  try {
    console.log(
      `[file-complete ${VERSION}] ${event.httpMethod}`
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

    const body =
      parseBody(event);

    const orderId =
      String(
        body.order_id || ""
      ).trim();

    const storagePath =
      String(
        body.storage_path || ""
      ).trim();

    const originalName =
      String(
        body.original_name || ""
      ).trim();

    const mimeType =
      String(
        body.mime_type ||
        "application/octet-stream"
      ).trim();

    const sizeBytes =
      Number(body.size_bytes || 0);

    if (
      !orderId ||
      !storagePath ||
      !originalName
    ) {
      throw httpError(
        400,
        "Die Dateidaten sind unvollständig."
      );
    }

    /*
     * Der Pfad muss zur Bestellung gehören.
     */
    if (
      !storagePath.startsWith(
        `${orderId}/`
      )
    ) {
      throw httpError(
        400,
        "Der Speicherpfad gehört nicht zur Bestellung."
      );
    }

    const supabase =
      getSupabase();

    /*
     * Doppelten Eintrag verhindern.
     */
    const {
      data: existing,
      error: existingError
    } = await supabase
      .from("order_files")
      .select("id")
      .eq(
        "storage_path",
        storagePath
      )
      .maybeSingle();

    if (existingError) {
      throw new Error(
        `Dateieintrag konnte nicht geprüft werden: ${existingError.message}`
      );
    }

    if (existing) {
      return json(200, {
        ok: true,
        duplicate: true,
        file: existing,
        version: VERSION
      });
    }

    const {
      data,
      error
    } = await supabase
      .from("order_files")
      .insert({
        order_id: orderId,
        storage_path: storagePath,
        original_name: originalName,
        mime_type: mimeType,
        size_bytes:
          Number.isFinite(sizeBytes)
            ? sizeBytes
            : 0
      })
      .select(
        "id,order_id,storage_path,original_name,mime_type,size_bytes,created_at"
      )
      .single();

    if (error) {
      throw new Error(
        `Datei konnte nicht gespeichert werden: ${error.message}`
      );
    }

    return json(201, {
      ok: true,
      file: data,
      version: VERSION
    });
  } catch (error) {
    return handleError(error);
  }
};
