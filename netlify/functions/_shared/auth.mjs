import { getUser } from "@netlify/identity";
import { httpError } from "./http.mjs";
export async function requireUser() {
  const user = await getUser();
  if (!user) throw httpError(401, "Bitte anmelden.");
  return user;
}
export async function requireAdmin() {
  const user = await requireUser();
  if (!user.roles?.includes("admin")) throw httpError(403, "Keine Admin-Berechtigung.");
  return user;
}
