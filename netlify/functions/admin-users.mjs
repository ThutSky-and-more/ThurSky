import { admin } from "@netlify/identity";
import { requireAdmin } from "./_shared/auth.mjs";
import { json, errorResponse } from "./_shared/http.mjs";
export default async () => {
  try {
    await requireAdmin();
    const result = await admin.listUsers();
    const source = Array.isArray(result) ? result : (result.users || []);
    const users = source.map((u) => ({ id: u.id, email: u.email, roles: u.roles || u.app_metadata?.roles || [] }));
    return json({ users });
  } catch (error) { return errorResponse(error); }
};
