const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(payload)
  };
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function body(event) {
  try {
    return event.body ? JSON.parse(event.body) : {};
  } catch {
    throw httpError(400, 'Ungültige JSON-Daten.');
  }
}

function fail(error) {
  console.error('Function error:', error);

  const statusCode = Number(error?.statusCode) || 500;
  const message =
    statusCode === 500
      ? 'Interner Serverfehler'
      : error?.message || 'Unbekannter Fehler';

  return json(statusCode, {
    error: message,
    details: String(error?.message || error || '')
  });
}

module.exports = {
  json,
  fail,
  httpError,
  body
};
