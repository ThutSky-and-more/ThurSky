const { createClient } = require("@supabase/supabase-js");

const VERSION = "2026-07-16-FILE-DOWNLOAD-V1";

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
    `[file-download ${VERSION}]`,
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

async function requireUser(event) {
  const token =
    getBearerToken(event);

  const origin =
    getSiteOrigin(event);

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

  const id =
    user?.id ||
    user?.sub ||
    null;

  if (!id) {
    throw httpError(
      500,
      "Die Benutzer-ID fehlt."
    );
  }

  const roles =
    user?.app_metadata?.roles ||
    user?.roles ||
    [];

  return {
    id: String(id),
    email:
      String(user?.email || ""),
    isAdmin:
      Array.isArray(roles) &&
      roles.some(
        (role) =>
          String(role)
            .trim()
            .toLowerCase() ===
          "admin"
      )
  };
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

function getBucket() {
  return String(
    process.env
      .SUPABASE_STORAGE_BUCKET ||
    "customer-files"
  ).trim();
}

exports.handler = async function handler(
  event
) {
  try {
    console.log(
      `[file-download ${VERSION}] ${event.httpMethod}`
    );

    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 204,
        headers: HEADERS,
        body: ""
      };
    }

    if (event.httpMethod !== "GET") {
      throw httpError(
        405,
        "Diese HTTP-Methode ist nicht erlaubt."
      );
    }

    const user =
      await requireUser(event);

    const fileId =
      String(
        event
          .queryStringParameters
          ?.id || ""
      ).trim();

    if (!fileId) {
      throw httpError(
        400,
        "Die Datei-ID fehlt."
      );
    }

    const supabase =
      getSupabase();

    const {
      data: file,
      error
    } = await supabase
      .from("order_files")
      .select(`
        id,
        order_id,
        storage_path,
        original_name,
        mime_type,
        size_bytes,
        orders!inner (
          customer_id
        )
      `)
      .eq("id", fileId)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Datei konnte nicht geladen werden: ${error.message}`
      );
    }

    if (!file) {
      throw httpError(
        404,
        "Die Datei wurde nicht gefunden."
      );
    }

    const customerId =
      file?.orders?.customer_id;

    if (
      !user.isAdmin &&
      String(customerId) !== user.id
    ) {
      throw httpError(
        403,
        "Du darfst diese Datei nicht herunterladen."
      );
    }

    const {
      data: signed,
      error: signedError
    } = await supabase.storage
      .from(getBucket())
      .createSignedUrl(
        file.storage_path,
        120,
        {
          download:
            file.original_name
        }
      );

    if (signedError) {
      throw new Error(
        `Downloadlink konnte nicht erstellt werden: ${signedError.message}`
      );
    }

    if (!signed?.signedUrl) {
      throw new Error(
        "Supabase hat keinen Downloadlink zurückgegeben."
      );
    }

    return json(200, {
      ok: true,
      url: signed.signedUrl,
      file_name:
        file.original_name,
      expires_in: 120,
      version: VERSION
    });
  } catch (error) {
    return handleError(error);
  }
};
