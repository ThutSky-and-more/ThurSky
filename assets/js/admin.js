import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { api, escapeHtml } from "./api.js";

const identity = window.netlifyIdentity;

let users = [];
let orders = [];
let backendLoaded = false;

/* =========================================================
   START
========================================================= */

if (!identity) {
  document.body.innerHTML = `
    <main style="max-width:700px;margin:50px auto;padding:20px">
      <section class="box">
        <h1>Admin-Backend</h1>
        <p>Netlify Identity konnte nicht geladen werden.</p>
        <a href="/">Zur Startseite</a>
      </section>
    </main>
  `;

  throw new Error("Netlify Identity wurde nicht geladen.");
}

identity.on("init", async (user) => {
  await handleUser(user);
});

identity.on("login", async (user) => {
  identity.close();
  backendLoaded = false;
  await handleUser(user);
});

identity.on("logout", () => {
  window.location.href = "/";
});

identity.on("error", (error) => {
  console.error("Netlify-Identity-Fehler:", error);
  showMessage(
    "Bei der Anmeldung ist ein Fehler aufgetreten.",
    true
  );
});

identity.init();

/* =========================================================
   FESTE BUTTONS VERBINDEN
========================================================= */

document
  .querySelector("#logoutButton")
  ?.addEventListener("click", async () => {
    await identity.logout();
  });

document
  .querySelector("#refreshOrders")
  ?.addEventListener("click", async () => {
    await loadOrders();
  });

document
  .querySelector("#newOrderForm")
  ?.addEventListener("submit", createOrder);

document
  .querySelectorAll("[data-view]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      switchView(button.dataset.view);
    });
  });

/* =========================================================
   ADMIN PRÜFEN
========================================================= */

async function handleUser(user) {
  try {
    if (!user) {
      setAdminIdentity(
        "Bitte mit dem Admin-Konto anmelden."
      );

      identity.open("login");
      return;
    }

    let token = "";

    try {
      token = await user.jwt(true);
    } catch (refreshError) {
      console.warn(
        "Token konnte nicht erzwungen erneuert werden:",
        refreshError
      );

      token = await user.jwt();
    }

    const roles = getRoles(user, token);

    console.log("Angemeldeter Benutzer:", user.email);
    console.log("Erkannte Rollen:", roles);

    if (!roles.includes("admin")) {
      setAdminIdentity(
        `Angemeldet als ${user.email}, aber ohne aktuelle Admin-Rolle.`
      );

      showMessage(
        "Dein aktuelles Login-Token enthält die Rolle admin nicht. Bitte vollständig abmelden und erneut anmelden.",
        true
      );

      return;
    }

    setAdminIdentity(`Admin: ${user.email}`);

    if (backendLoaded) {
      return;
    }

    backendLoaded = true;

    await Promise.all([
      loadUsers(),
      loadOrders()
    ]);
  } catch (error) {
    backendLoaded = false;

    console.error(
      "Fehler beim Start des Adminbackends:",
      error
    );

    setAdminIdentity(
      "Die Admin-Anmeldung konnte nicht geprüft werden."
    );

    showMessage(
      error.message ||
        "Das Adminbackend konnte nicht geladen werden.",
      true
    );
  }
}

function getRoles(user, token) {
  const roleSet = new Set();

  function addRoles(value) {
    if (Array.isArray(value)) {
      value.forEach((role) => {
        const normalized = String(role || "")
          .trim()
          .toLowerCase();

        if (normalized) {
          roleSet.add(normalized);
        }
      });

      return;
    }

    if (typeof value === "string") {
      value
        .split(",")
        .map((role) => role.trim().toLowerCase())
        .filter(Boolean)
        .forEach((role) => roleSet.add(role));
    }
  }

  addRoles(user.app_metadata?.roles);
  addRoles(user.appMetadata?.roles);
  addRoles(user.roles);

  const claims = decodeJwt(token);

  addRoles(claims.app_metadata?.roles);
  addRoles(claims.appMetadata?.roles);
  addRoles(claims.roles);

  return Array.from(roleSet);
}

function decodeJwt(token) {
  if (!token || typeof token !== "string") {
    return {};
  }

  try {
    const parts = token.split(".");

    if (parts.length < 2) {
      return {};
    }

    const base64 = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const padding =
      "=".repeat((4 - (base64.length % 4)) % 4);

    const decoded = window.atob(base64 + padding);

    const bytes = Uint8Array.from(
      decoded,
      (character) => character.charCodeAt(0)
    );

    const json = new TextDecoder().decode(bytes);

    return JSON.parse(json);
  } catch (error) {
    console.warn("JWT konnte nicht gelesen werden:", error);
    return {};
  }
}

function setAdminIdentity(text) {
  const element =
    document.querySelector("#adminIdentity");

  if (element) {
    element.textContent = text;
  }
}

/* =========================================================
   ANSICHTEN UMSCHALTEN
========================================================= */

function switchView(name) {
  document
    .querySelectorAll(".admin-view")
    .forEach((view) => {
      view.classList.add("hidden");
    });

  const target =
    document.querySelector(`#view-${name}`);

  if (target) {
    target.classList.remove("hidden");
  }

  document
    .querySelectorAll("[data-view]")
    .forEach((button) => {
      const isActive =
        button.dataset.view === name;

      button.classList.toggle(
        "active",
        isActive
      );
    });
}

/* =========================================================
   KUNDEN LADEN
========================================================= */

async function loadUsers() {
  try {
    const result = await api("admin-users");

    users = Array.isArray(result?.users)
      ? result.users
      : [];

    renderUsers();
    renderCustomerSelect();
  } catch (error) {
    console.error(
      "Kunden konnten nicht geladen werden:",
      error
    );

    const table =
      document.querySelector("#customersTable");

    if (table) {
      table.innerHTML = `
        <tr>
          <td colspan="3">
            Fehler: ${escapeHtml(error.message)}
          </td>
        </tr>
      `;
    }

    showMessage(
      `Kunden konnten nicht geladen werden: ${error.message}`,
      true
    );
  }
}

function renderUsers() {
  const table =
    document.querySelector("#customersTable");

  if (!table) {
    return;
  }

  if (users.length === 0) {
    table.innerHTML = `
      <tr>
        <td colspan="3">
          Keine Benutzer gefunden.
        </td>
      </tr>
    `;

    return;
  }

  table.innerHTML = users
    .map((user) => {
      return `
        <tr>
          <td>${escapeHtml(user.email || "")}</td>

          <td>
            <code>${escapeHtml(user.id || "")}</code>
          </td>

          <td>
            ${escapeHtml(
              Array.isArray(user.roles)
                ? user.roles.join(", ")
                : ""
            )}
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderCustomerSelect() {
  const select =
    document.querySelector("#newCustomer");

  if (!select) {
    return;
  }

  select.innerHTML = `
    <option value="">
      Bitte wählen
    </option>

    ${users
      .map((user) => {
        return `
          <option
            value="${escapeHtml(user.id || "")}"
            data-email="${escapeHtml(user.email || "")}"
          >
            ${escapeHtml(user.email || "")}
          </option>
        `;
      })
      .join("")}
  `;
}

/* =========================================================
   BESTELLUNGEN LADEN
========================================================= */

async function loadOrders() {
  const table =
    document.querySelector("#ordersTable");

  if (table) {
    table.innerHTML = `
      <tr>
        <td colspan="5">
          Bestellungen werden geladen …
        </td>
      </tr>
    `;
  }

  try {
    const result =
      await api("orders?scope=all");

    orders = Array.isArray(result?.orders)
      ? result.orders
      : [];

    renderOrders();
  } catch (error) {
    console.error(
      "Bestellungen konnten nicht geladen werden:",
      error
    );

    if (table) {
      table.innerHTML = `
        <tr>
          <td colspan="5">
            Fehler: ${escapeHtml(error.message)}
          </td>
        </tr>
      `;
    }

    showMessage(
      `Bestellungen konnten nicht geladen werden: ${error.message}`,
      true
    );
  }
}

function renderOrders() {
  const table =
    document.querySelector("#ordersTable");

  if (!table) {
    return;
  }

  if (orders.length === 0) {
    table.innerHTML = `
      <tr>
        <td colspan="5">
          Keine Bestellungen vorhanden.
        </td>
      </tr>
    `;

    return;
  }

  table.innerHTML = orders
    .map((order) => {
      return `
        <tr>
          <td>
            ${escapeHtml(order.order_number || "")}
          </td>

          <td>
            ${escapeHtml(order.customer_email || "")}
          </td>

          <td>
            ${escapeHtml(order.package_name || "")}
          </td>

          <td>
            ${escapeHtml(
              order.status_label ||
              order.status ||
              ""
            )}
          </td>

          <td>
            <button
              class="btn btn-secondary btn-small"
              type="button"
              data-edit-order="${escapeHtml(order.id || "")}"
            >
              Bearbeiten
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  document
    .querySelectorAll("[data-edit-order]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        editOrder(button.dataset.editOrder);
      });
    });
}

/* =========================================================
   NEUE BESTELLUNG
========================================================= */

async function createOrder(event) {
  event.preventDefault();

  const select =
    document.querySelector("#newCustomer");

  const selectedOption =
    select?.selectedOptions?.[0];

  const packageInput =
    document.querySelector("#newPackage");

  if (!select?.value) {
    showMessage(
      "Bitte einen Kunden auswählen.",
      true
    );

    return;
  }

  if (!packageInput?.value.trim()) {
    showMessage(
      "Bitte eine Leistung oder ein Paket eingeben.",
      true
    );

    return;
  }

  try {
    await api("orders", {
      method: "POST",

      body: JSON.stringify({
        customer_id: select.value,

        customer_email:
          selectedOption?.dataset?.email || "",

        package_name:
          packageInput.value.trim(),

        status:
          document.querySelector("#newStatus")?.value ||
          "received",

        desired_date:
          document.querySelector("#newDesiredDate")?.value ||
          null,

        admin_message:
          document
            .querySelector("#newAdminMessage")
            ?.value.trim() || ""
      })
    });

    event.currentTarget.reset();

    showMessage(
      "Bestellung wurde erfolgreich erstellt."
    );

    await loadOrders();

    switchView("orders");
  } catch (error) {
    showMessage(
      `Bestellung konnte nicht erstellt werden: ${error.message}`,
      true
    );
  }
}

/* =========================================================
   BESTELLUNG BEARBEITEN
========================================================= */

function editOrder(id) {
  const order =
    orders.find((item) => item.id === id);

  if (!order) {
    showMessage(
      "Bestellung wurde nicht gefunden.",
      true
    );

    return;
  }

  const editor =
    document.querySelector("#orderEditor");

  if (!editor) {
    return;
  }

  editor.innerHTML = `
    <section class="box">
      <form id="editOrderForm">
        <h2>
          ${escapeHtml(order.order_number || "")}
          bearbeiten
        </h2>

        <div class="form-grid">
          <div class="field">
            <label for="editStatus">
              Status
            </label>

            <select id="editStatus">
              ${statusOptions(order.status)}
            </select>
          </div>

          <div class="field field-full">
            <label for="editAdminMessage">
              Nachricht an Kunden
            </label>

            <textarea
              id="editAdminMessage"
              rows="5"
            >${escapeHtml(order.admin_message || "")}</textarea>
          </div>

          <div class="field field-full">
            <label for="fileInput">
              Bilder oder Dateien hochladen
            </label>

            <input
              id="fileInput"
              type="file"
              accept="image/*,video/*,.pdf,.zip"
              multiple
            >

            <small>
              Mehrere Dateien können gleichzeitig ausgewählt
              und nacheinander hochgeladen werden.
            </small>
          </div>
        </div>

        <div class="btn-row">
          <button
            class="btn btn-primary"
            type="submit"
          >
            Status und Nachricht speichern
          </button>

          <button
            class="btn btn-secondary"
            id="uploadFileButton"
            type="button"
          >
            Dateien hochladen
          </button>
        </div>

        <div id="editResult"></div>
      </form>
    </section>
  `;

  document
    .querySelector("#editOrderForm")
    ?.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        try {
          await api("orders", {
            method: "PATCH",

            body: JSON.stringify({
              id: order.id,

              status:
                document.querySelector("#editStatus")?.value,

              admin_message:
                document
                  .querySelector("#editAdminMessage")
                  ?.value.trim() || ""
            })
          });

          showEditResult(
            "Bestellung wurde aktualisiert.",
            false
          );

          await loadOrders();
        } catch (error) {
          showEditResult(
            error.message,
            true
          );
        }
      }
    );

  document
    .querySelector("#uploadFileButton")
    ?.addEventListener(
      "click",
      async () => {
        await uploadFiles(order);
      }
    );

  editor.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

/* =========================================================
   MEHRFACH-UPLOAD
========================================================= */

async function uploadFiles(order) {
  const input =
    document.querySelector("#fileInput");

  const button =
    document.querySelector("#uploadFileButton");

  const files =
    Array.from(input?.files || []);

  if (files.length === 0) {
    showEditResult(
      "Bitte mindestens eine Datei auswählen.",
      true
    );

    return;
  }

  button.disabled = true;
  button.textContent = "Upload läuft …";

  let successful = 0;
  const failed = [];

  try {
    const config =
      await api("public-config");

    if (
      !config?.supabase_url ||
      !config?.supabase_anon_key ||
      !config?.bucket
    ) {
      throw new Error(
        "Die Supabase-Konfiguration ist unvollständig."
      );
    }

    const supabase = createClient(
      config.supabase_url,
      config.supabase_anon_key,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    );

    for (
      let index = 0;
      index < files.length;
      index += 1
    ) {
      const file = files[index];

      showEditResult(
        `Datei ${index + 1} von ${files.length}: ` +
        `${file.name} wird vorbereitet …`,
        false
      );

      try {
        const signed =
          await api("file-upload-url", {
            method: "POST",

            body: JSON.stringify({
              order_id: order.id,
              file_name: file.name,
              mime_type:
                file.type ||
                "application/octet-stream",
              size_bytes: file.size
            })
          });

        if (
          !signed?.storage_path ||
          !signed?.token
        ) {
          throw new Error(
            "Die Upload-Function lieferte keine gültigen Upload-Daten."
          );
        }

        const { error: uploadError } =
          await supabase.storage
            .from(config.bucket)
            .uploadToSignedUrl(
              signed.storage_path,
              signed.token,
              file,
              {
                contentType:
                  file.type ||
                  "application/octet-stream"
              }
            );

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        await api("file-complete", {
          method: "POST",

          body: JSON.stringify({
            order_id: order.id,
            storage_path:
              signed.storage_path,
            original_name: file.name,
            mime_type:
              file.type ||
              "application/octet-stream",
            size_bytes: file.size
          })
        });

        successful += 1;
      } catch (error) {
        console.error(
          `Upload von ${file.name} fehlgeschlagen:`,
          error
        );

        failed.push({
          name: file.name,
          message: error.message
        });
      }
    }

    input.value = "";

    if (failed.length === 0) {
      showEditResult(
        `${successful} Datei(en) wurden erfolgreich hochgeladen.`,
        false
      );

      return;
    }

    const failedText = failed
      .map(
        (item) =>
          `${item.name}: ${item.message}`
      )
      .join(" | ");

    showEditResult(
      `${successful} erfolgreich, ` +
      `${failed.length} fehlgeschlagen. ` +
      failedText,
      true
    );
  } catch (error) {
    showEditResult(
      error.message ||
        "Der Upload konnte nicht gestartet werden.",
      true
    );
  } finally {
    button.disabled = false;
    button.textContent = "Dateien hochladen";
  }
}

/* =========================================================
   STATUS
========================================================= */

function statusOptions(selected) {
  const statuses = {
    received: "Anfrage eingegangen",
    planning: "Termin wird geplant",
    confirmed: "Termin bestätigt",
    captured: "Aufnahmen erstellt",
    recorded: "Aufnahmen erstellt",
    processing: "In Bearbeitung",
    editing: "In Bearbeitung",
    ready: "Bereit zum Download",
    completed: "Abgeschlossen",
    cancelled: "Storniert"
  };

  return Object.entries(statuses)
    .map(([value, label]) => {
      return `
        <option
          value="${value}"
          ${value === selected ? "selected" : ""}
        >
          ${label}
        </option>
      `;
    })
    .join("");
}

/* =========================================================
   MELDUNGEN
========================================================= */

function showMessage(
  message,
  isError = false
) {
  const element =
    document.querySelector("#adminMessage");

  if (!element) {
    return;
  }

  element.innerHTML = `
    <div class="notice ${
      isError
        ? "notice-error"
        : "notice-success"
    }">
      ${escapeHtml(message)}
    </div>
  `;
}

function showEditResult(
  message,
  isError = false
) {
  const element =
    document.querySelector("#editResult");

  if (!element) {
    return;
  }

  element.innerHTML = `
    <div class="notice ${
      isError
        ? "notice-error"
        : "notice-success"
    }">
      ${escapeHtml(message)}
    </div>
  `;
}
