import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { api, escapeHtml } from "./api.js";
const identity = window.netlifyIdentity;
let users = [];
let orders = [];
identity.on("init", handleUser); identity.on("login", (u) => { identity.close(); handleUser(u); }); identity.on("logout", () => location.href = "/"); identity.init();
document.querySelector("#logoutButton").addEventListener("click", () => identity.logout());
document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
document.querySelector("#refreshOrders").addEventListener("click", loadOrders);
document.querySelector("#newOrderForm").addEventListener("submit", createOrder);

async function handleUser(user) {
  if (!user) { identity.open("login"); return; }
  const roles = user.app_metadata?.roles || [];
  if (!roles.includes("admin")) { location.href = "/konto/"; return; }
  document.querySelector("#adminIdentity").textContent = `Admin: ${user.email}`;
  await Promise.all([loadUsers(), loadOrders()]);
}
function switchView(name) { document.querySelectorAll(".admin-view").forEach((v) => v.classList.add("hidden")); document.querySelector(`#view-${name}`).classList.remove("hidden"); document.querySelectorAll("[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === name)); }
async function loadUsers() {
  try { ({ users } = await api("admin-users"));
    document.querySelector("#customersTable").innerHTML = users.map((u) => `<tr><td>${escapeHtml(u.email)}</td><td><code>${escapeHtml(u.id)}</code></td><td>${escapeHtml((u.roles || []).join(", "))}</td></tr>`).join("");
    document.querySelector("#newCustomer").innerHTML = '<option value="">Bitte wählen</option>' + users.map((u) => `<option value="${escapeHtml(u.id)}" data-email="${escapeHtml(u.email)}">${escapeHtml(u.email)}</option>`).join("");
  } catch (e) { showMessage(e.message, true); }
}
async function loadOrders() {
  try { ({ orders } = await api("orders?scope=all"));
    document.querySelector("#ordersTable").innerHTML = orders.map((o) => `<tr><td>${escapeHtml(o.order_number)}</td><td>${escapeHtml(o.customer_email)}</td><td>${escapeHtml(o.package_name)}</td><td>${escapeHtml(o.status_label)}</td><td><button class="btn btn-secondary btn-small" data-edit="${escapeHtml(o.id)}">Bearbeiten</button></td></tr>`).join("") || '<tr><td colspan="5">Keine Bestellungen.</td></tr>';
    document.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => editOrder(b.dataset.edit)));
  } catch (e) { showMessage(e.message, true); }
}
async function createOrder(event) {
  event.preventDefault(); const select = document.querySelector("#newCustomer"); const option = select.selectedOptions[0];
  try { await api("orders", { method: "POST", body: JSON.stringify({ customer_id: select.value, customer_email: option.dataset.email, package_name: document.querySelector("#newPackage").value.trim(), status: document.querySelector("#newStatus").value, desired_date: document.querySelector("#newDesiredDate").value || null, admin_message: document.querySelector("#newAdminMessage").value.trim() }) }); event.currentTarget.reset(); showMessage("Bestellung erstellt."); await loadOrders(); switchView("orders"); }
  catch (e) { showMessage(e.message, true); }
}
function editOrder(id) {
  const o = orders.find((x) => x.id === id); if (!o) return;
  document.querySelector("#orderEditor").innerHTML = `<form class="card section" id="editOrderForm"><h2>${escapeHtml(o.order_number)} bearbeiten</h2><div class="form-grid"><div class="field"><label>Status</label><select id="editStatus">${statusOptions(o.status)}</select></div><div class="field field-full"><label>Nachricht an Kunden</label><textarea id="editAdminMessage">${escapeHtml(o.admin_message || "")}</textarea></div><div class="field field-full"><label>Datei hochladen</label><input id="fileInput" type="file"><small>Für grosse Videos wird die Datei direkt in den privaten Supabase-Speicher übertragen.</small></div></div><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-primary" type="submit">Speichern</button><button class="btn btn-secondary" type="button" id="uploadFileButton">Datei hochladen</button></div><div id="editResult"></div></form>`;
  document.querySelector("#editOrderForm").addEventListener("submit", async (event) => { event.preventDefault(); try { await api("orders", { method: "PATCH", body: JSON.stringify({ id, status: document.querySelector("#editStatus").value, admin_message: document.querySelector("#editAdminMessage").value.trim() }) }); showMessage("Bestellung aktualisiert."); await loadOrders(); } catch (e) { showMessage(e.message, true); } });
  document.querySelector("#uploadFileButton").addEventListener("click", () => uploadFile(o));
}
async function uploadFile(order) {
  const input = document.querySelector("#fileInput"); const file = input.files[0]; if (!file) { alert("Bitte Datei auswählen."); return; }
  const result = document.querySelector("#editResult"); result.innerHTML = '<div class="notice">Upload wird vorbereitet …</div>';
  try {
    const signed = await api("file-upload-url", { method: "POST", body: JSON.stringify({ order_id: order.id, file_name: file.name, mime_type: file.type || "application/octet-stream", size_bytes: file.size }) });
    const config = await api("public-config");
    const supabase = createClient(config.supabase_url, config.supabase_anon_key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: uploadError } = await supabase.storage.from(config.bucket).uploadToSignedUrl(signed.storage_path, signed.token, file, { contentType: file.type || "application/octet-stream" });
    if (uploadError) throw uploadError;
    await api("file-complete", { method: "POST", body: JSON.stringify({ order_id: order.id, storage_path: signed.storage_path, original_name: file.name, mime_type: file.type || "application/octet-stream", size_bytes: file.size }) });
    result.innerHTML = '<div class="notice notice-success">Datei wurde hochgeladen und dem Kunden freigegeben.</div>'; input.value = "";
  } catch (e) { result.innerHTML = `<div class="notice notice-error">${escapeHtml(e.message)}</div>`; }
}
function statusOptions(selected) { const list = {received:"Anfrage eingegangen",planning:"Termin wird geplant",confirmed:"Termin bestätigt",recorded:"Aufnahmen erstellt",editing:"In Bearbeitung",ready:"Bereit zum Download",completed:"Abgeschlossen",cancelled:"Storniert"}; return Object.entries(list).map(([v,l]) => `<option value="${v}" ${v===selected?"selected":""}>${l}</option>`).join(""); }
function showMessage(message, error=false) { document.querySelector("#adminMessage").innerHTML = `<div class="notice ${error?"notice-error":"notice-success"}">${escapeHtml(message)}</div>`; }
