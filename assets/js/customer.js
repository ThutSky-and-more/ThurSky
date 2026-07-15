import { api, escapeHtml } from "./api.js";
const identity = window.netlifyIdentity;
identity.on("init", handleUser);
identity.on("login", (user) => { identity.close(); handleUser(user); });
identity.on("logout", () => location.href = "/");
identity.init();
document.querySelector("#logoutButton").addEventListener("click", () => identity.logout());

async function handleUser(user) {
  if (!user) { identity.open("login"); return; }
  const roles = user.app_metadata?.roles || [];
  if (roles.includes("admin")) { location.href = "/backend/"; return; }
  document.querySelector("#welcomeText").textContent = `Angemeldet als ${user.email}`;
  await loadOrders();
}

async function loadOrders() {
  const container = document.querySelector("#ordersContainer");
  try {
    const { orders } = await api("orders");
    if (!orders.length) { container.innerHTML = '<div class="card"><p>Noch keine Bestellung vorhanden.</p><a class="btn btn-primary" href="/#bestellen">Anfrage erstellen</a></div>'; return; }
    container.innerHTML = orders.map((order) => `<article class="card"><div style="display:flex;justify-content:space-between;gap:15px;flex-wrap:wrap"><div><p class="eyebrow">Bestellung ${escapeHtml(order.order_number)}</p><h2>${escapeHtml(order.package_name)}</h2></div><span class="status-pill">${escapeHtml(order.status_label)}</span></div><p><strong>Erstellt:</strong> ${formatDate(order.created_at)}${order.desired_date ? `<br><strong>Wunschdatum:</strong> ${formatDate(order.desired_date)}` : ""}</p>${order.admin_message ? `<div class="notice"><strong>Nachricht von ThurSky:</strong><br>${escapeHtml(order.admin_message)}</div>` : ""}<h3>Downloads</h3>${renderFiles(order.files || [])}</article>`).join("");
    container.querySelectorAll("[data-download]").forEach((button) => button.addEventListener("click", () => downloadFile(button.dataset.download, button)));
  } catch (error) { container.innerHTML = `<div class="notice notice-error">${escapeHtml(error.message)}</div>`; }
}

function renderFiles(files) {
  if (!files.length) return "<p>Noch keine Dateien freigegeben.</p>";
  return `<div class="grid">${files.map((file) => `<div><button class="btn btn-secondary btn-small" data-download="${escapeHtml(file.id)}">${escapeHtml(file.original_name)}</button></div>`).join("")}</div>`;
}
async function downloadFile(id, button) {
  const old = button.textContent; button.disabled = true; button.textContent = "Link wird erstellt …";
  try { const { url } = await api(`file-download?id=${encodeURIComponent(id)}`); location.href = url; }
  catch (error) { alert(error.message); }
  finally { button.disabled = false; button.textContent = old; }
}
function formatDate(value) { return new Intl.DateTimeFormat("de-CH", { dateStyle: "medium" }).format(new Date(value)); }
