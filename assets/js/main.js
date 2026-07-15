import { api } from "./api.js";

const nav = document.querySelector("#mainNav");
document.querySelector("#menuToggle")?.addEventListener("click", () => nav?.classList.toggle("open"));
document.querySelectorAll("#mainNav a").forEach((a) => a.addEventListener("click", () => nav?.classList.remove("open")));
document.querySelector("#year").textContent = new Date().getFullYear();

const identity = window.netlifyIdentity;
identity?.on("init", updateLoginState);
identity?.on("login", (user) => { updateLoginState(user); identity.close(); });
identity?.on("logout", () => updateLoginState(null));
identity?.init();

document.querySelector("#loginForOrder")?.addEventListener("click", () => identity?.open("login"));

document.querySelector("#orderForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const result = document.querySelector("#orderResult");
  if (!identity?.currentUser()) {
    identity?.open("login");
    result.innerHTML = '<div class="notice notice-error">Bitte zuerst anmelden.</div>';
    return;
  }
  result.innerHTML = '<div class="notice">Anfrage wird gespeichert …</div>';
  try {
    await api("orders", { method: "POST", body: JSON.stringify({
      package_name: document.querySelector("#package").value,
      desired_date: document.querySelector("#desiredDate").value || null,
      street: document.querySelector("#street").value.trim(),
      postal_code: document.querySelector("#postalCode").value.trim(),
      city: document.querySelector("#city").value.trim(),
      customer_message: document.querySelector("#message").value.trim()
    }) });
    event.currentTarget.reset();
    result.innerHTML = '<div class="notice notice-success">Danke! Die Anfrage wurde deinem Kundenkonto hinzugefügt.</div>';
  } catch (error) {
    result.innerHTML = `<div class="notice notice-error">${error.message}</div>`;
  }
});

function updateLoginState(user) {
  const notice = document.querySelector("#orderLoginNotice");
  const button = document.querySelector("#loginForOrder");
  if (!notice || !button) return;
  if (user) {
    notice.textContent = `Angemeldet als ${user.email}`;
    notice.className = "notice notice-success";
    button.textContent = "Kundenkonto öffnen";
    button.onclick = () => { location.href = "/konto/"; };
  } else {
    notice.textContent = "Bitte melde dich an, bevor du die Anfrage sendest.";
    notice.className = "notice";
    button.textContent = "Anmelden";
    button.onclick = () => identity?.open("login");
  }
}
