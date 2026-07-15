export const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
export const errorResponse = (error) => {
  console.error(error);
  const status = Number(error?.status || 500);
  const message = status >= 500 ? "Interner Serverfehler." : String(error?.message || error);
  return json({ error: message }, status);
};
export const httpError = (status, message) => Object.assign(new Error(message), { status });
export async function readJson(req) {
  try { return await req.json(); } catch { throw httpError(400, "Ungültige JSON-Daten."); }
}
