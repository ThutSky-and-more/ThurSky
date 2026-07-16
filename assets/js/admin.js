(() => {
  "use strict";

  const identity = window.netlifyIdentity;

  let users = [];
  let orders = [];
  let initialized = false;

  /* =======================================================
     HILFSFUNKTIONEN
  ======================================================= */

  function escapeHtml(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[character]
    );
  }

  function setAdminIdentity(text) {
    const element = document.getElementById("adminIdentity");

    if (element) {
      element.textContent = text;
    }
  }

  function showMessage(message, isError = false) {
    const element = document.getElementById("adminMessage");

    if (!element) {
      return;
    }

    element.innerHTML = `
      <div class="notice ${
        isError ? "notice-error" : "notice-success"
      }">
        ${escapeHtml(message)}
      </div>
    `;
  }

  function showEditMessage(message, isError = false) {
    const element = document.getElementById("editResult");

    if (!element) {
      return;
    }

    element.innerHTML = `
      <div class="notice ${
        isError ? "notice-error" : "notice-success"
      }">
        ${escapeHtml(message)}
      </div>
    `;
  }

  function getRoles(user) {
    const values = [
      user?.app_metadata?.roles,
      user?.appMetadata?.roles,
      user?.roles
    ];

    const roles = new Set();

    values.forEach((value) => {
      if (Array.isArray(value)) {
        value.forEach((role) => {
          const normalized = String(role || "")
            .trim()
            .toLowerCase();

          if (normalized) {
            roles.add(normalized);
          }
        });
      }
    });

    return Array.from(roles);
  }

  async function api(path, options = {}) {
    const user = identity.currentUser();

    if (!user) {
      throw new Error("Bitte zuerst anmelden.");
    }

    const token = await user.jwt();

    const headers = new Headers(options.headers || {});

    headers.set("Authorization", `Bearer ${token}`);
    headers.set("Accept", "application/json");

    if (
      options.body &&
      !(options.body instanceof FormData)
    ) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(
      `/.netlify/functions/${path}`,
      {
        ...options,
        headers,
        cache: "no-store"
      }
    );

    const contentType =
      response.headers.get("content-type") || "";

    let payload;

    if (contentType.includes("application/json")) {
      payload = await response.json();
    } else {
      payload = await response.text();
    }

    if (!response.ok) {
      const message =
        payload?.details ||
        payload?.error ||
        payload ||
        `HTTP ${response.status}`;

      throw new Error(String(message));
    }

    return payload;
  }

  /* =======================================================
     START UND ADMIN-PRÜFUNG
  ======================================================= */

  if (!identity) {
    setAdminIdentity("Netlify Identity konnte nicht geladen werden.");

    showMessage(
      "Netlify Identity ist auf dieser Seite nicht verfügbar.",
      true
    );

    return;
  }

  identity.on("init", handleUser);

  identity.on("login", async (user) => {
    identity.close();
    initialized = false;
    await handleUser(user);
  });

  identity.on("logout", () => {
    window.location.href = "/";
  });

  identity.on("error", (error) => {
    console.error("Netlify Identity:", error);

    showMessage(
      "Bei der Anmeldung ist ein Fehler aufgetreten.",
      true
    );
  });

  identity.init();

  async function handleUser(user) {
    try {
      if (!user) {
        setAdminIdentity("Nicht angemeldet.");

        showMessage(
          "Bitte melde dich mit deinem Admin-Konto an.",
          true
        );

        identity.open("login");
        return;
      }

      const roles = getRoles(user);

      console.log("Benutzer:", user.email);
      console.log("Rollen:", roles);

      if (!roles.includes("admin")) {
        setAdminIdentity(
          `Angemeldet als ${user.email}, aber nicht als Admin.`
        );

        showMessage(
          "Dein Benutzerkonto enthält im aktuellen Login keine Admin-Rolle. Bitte vollständig abmelden und neu anmelden.",
          true
        );

        return;
      }

      setAdminIdentity(`Admin: ${user.email}`);
      showMessage("Admin-Backend wurde erfolgreich geladen.");

      if (initialized) {
        return;
      }

      initialized = true;

      const results = await Promise.allSettled([
        loadOrders(),
        loadUsers()
      ]);

      results.forEach((result) => {
        if (result.status === "rejected") {
          console.error(result.reason);
        }
      });
    } catch (error) {
      initialized = false;

      console.error("Admin-Startfehler:", error);

      setAdminIdentity("Fehler bei der Admin-Anmeldung.");

      showMessage(
        error.message || "Das Admin-Backend konnte nicht gestartet werden.",
        true
      );
    }
  }

  /* =======================================================
     FESTE SCHALTFLÄCHEN
  ======================================================= */

  document
    .querySelectorAll("[data-view]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        switchView(button.dataset.view);
      });
    });

  document
    .getElementById("refreshOrders")
    ?.addEventListener("click", loadOrders);

  document
    .getElementById("logoutButton")
    ?.addEventListener("click", () => {
      identity.logout();
    });

  document
    .getElementById("newOrderForm")
    ?.addEventListener("submit", createOrder);

  function switchView(name) {
    document
      .querySelectorAll(".admin-view")
      .forEach((view) => {
        view.classList.add("hidden");
      });

    const target =
      document.getElementById(`view-${name}`);

    if (target) {
      target.classList.remove("hidden");
    }

    document
      .querySelectorAll("[data-view]")
      .forEach((button) => {
        button.classList.toggle(
          "active",
          button.dataset.view === name
        );
      });
  }

  /* =======================================================
     BESTELLUNGEN
  ======================================================= */

  async function loadOrders() {
    const table = document.getElementById("ordersTable");

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
      const result = await api("orders", {
        method: "GET"
      });

      orders = Array.isArray(result?.orders)
        ? result.orders
        : [];

      renderOrders();
    } catch (error) {
      console.error("Bestellungen:", error);

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

      throw error;
    }
  }

  function renderOrders() {
    const table = document.getElementById("ordersTable");

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
      .map((order) => `
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
              data-edit-order="${escapeHtml(order.id)}"
            >
              Bearbeiten
            </button>
          </td>
        </tr>
      `)
      .join("");

    document
      .querySelectorAll("[data-edit-order]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          editOrder(button.dataset.editOrder);
        });
      });
  }

  /* =======================================================
     KUNDEN
  ======================================================= */

  async function loadUsers() {
    const table = document.getElementById("customersTable");

    try {
      const result = await api("admin-users", {
        method: "GET"
      });

      users = Array.isArray(result?.users)
        ? result.users
        : [];

      renderUsers();
      renderCustomerSelect();
    } catch (error) {
      console.error("Kunden:", error);

      if (table) {
        table.innerHTML = `
          <tr>
            <td colspan="3">
              Fehler: ${escapeHtml(error.message)}
            </td>
          </tr>
        `;
      }
    }
  }

  function renderUsers() {
    const table = document.getElementById("customersTable");

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
      .map((user) => `
        <tr>
          <td>
            ${escapeHtml(user.email || "")}
          </td>

          <td>
            <code>
              ${escapeHtml(user.id || "")}
            </code>
          </td>

          <td>
            ${escapeHtml(
              Array.isArray(user.roles)
                ? user.roles.join(", ")
                : ""
            )}
          </td>
        </tr>
      `)
      .join("");
  }

  function renderCustomerSelect() {
    const select = document.getElementById("newCustomer");

    if (!select) {
      return;
    }

    select.innerHTML = `
      <option value="">
        Bitte wählen
      </option>

      ${users
        .map((user) => `
          <option
            value="${escapeHtml(user.id || "")}"
            data-email="${escapeHtml(user.email || "")}"
          >
            ${escapeHtml(user.email || "")}
          </option>
        `)
        .join("")}
    `;
  }

  /* =======================================================
     BESTELLUNG ERSTELLEN
  ======================================================= */

  async function createOrder(event) {
    event.preventDefault();

    const customer =
      document.getElementById("newCustomer");

    const selected =
      customer?.selectedOptions?.[0];

    const packageInput =
      document.getElementById("newPackage");

    if (!customer?.value) {
      showMessage(
        "Bitte einen Kunden auswählen.",
        true
      );

      return;
    }

    if (!packageInput?.value.trim()) {
      showMessage(
        "Bitte eine Leistung eingeben.",
        true
      );

      return;
    }

    try {
      await api("orders", {
        method: "POST",

        body: JSON.stringify({
          customer_id: customer.value,

          customer_email:
            selected?.dataset?.email || "",

          package_name:
            packageInput.value.trim(),

          status:
            document.getElementById("newStatus")?.value ||
            "received",

          desired_date:
            document.getElementById("newDesiredDate")?.value ||
            null,

          admin_message:
            document
              .getElementById("newAdminMessage")
              ?.value.trim() || ""
        })
      });

      event.currentTarget.reset();

      showMessage("Bestellung wurde erstellt.");

      await loadOrders();
      switchView("orders");
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  /* =======================================================
     BESTELLUNG BEARBEITEN
  ======================================================= */

  function editOrder(id) {
    const order = orders.find(
      (item) => item.id === id
    );

    if (!order) {
      showMessage(
        "Bestellung wurde nicht gefunden.",
        true
      );

      return;
    }

    const editor = document.getElementById("orderEditor");

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
              >${escapeHtml(
                order.admin_message || ""
              )}</textarea>
            </div>

            <div class="field field-full">
              <label for="fileInput">
                Dateien hochladen
              </label>

              <input
                id="fileInput"
                type="file"
                accept="image/*,video/*,.pdf,.zip"
                multiple
              >

              <small>
                Mehrere Dateien können gleichzeitig ausgewählt werden.
              </small>
            </div>
          </div>

          <div class="btn-row">
            <button
              class="btn btn-primary"
              type="submit"
            >
              Änderungen speichern
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
      .getElementById("editOrderForm")
      ?.addEventListener("submit", async (event) => {
        event.preventDefault();

        try {
          await api("orders", {
            method: "PATCH",

            body: JSON.stringify({
              id: order.id,

              status:
                document.getElementById("editStatus")?.value,

              admin_message:
                document
                  .getElementById("editAdminMessage")
                  ?.value.trim() || ""
            })
          });

          showEditMessage(
            "Bestellung wurde aktualisiert."
          );

          await loadOrders();
        } catch (error) {
          showEditMessage(error.message, true);
        }
      });

    document
      .getElementById("uploadFileButton")
      ?.addEventListener("click", () => {
        uploadFiles(order);
      });

    editor.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  /* =======================================================
     MEHRFACH-UPLOAD
  ======================================================= */

  async function uploadFiles(order) {
    const input = document.getElementById("fileInput");
    const button = document.getElementById("uploadFileButton");
    const files = Array.from(input?.files || []);

    if (files.length === 0) {
      showEditMessage(
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
      const config = await api("public-config", {
        method: "GET"
      });

      if (
        !config?.supabase_url ||
        !config?.supabase_anon_key ||
        !config?.bucket
      ) {
        throw new Error(
          "Die Supabase-Konfiguration ist unvollständig."
        );
      }

      if (!window.supabase?.createClient) {
        throw new Error(
          "Die Supabase-Bibliothek wurde nicht geladen."
        );
      }

      const supabaseClient =
        window.supabase.createClient(
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

        showEditMessage(
          `Datei ${index + 1} von ${files.length}: ` +
          `${file.name} wird hochgeladen …`
        );

        try {
          const signed = await api("file-upload-url", {
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
              "Keine gültigen Upload-Daten erhalten."
            );
          }

          const { error: uploadError } =
            await supabaseClient.storage
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
              storage_path: signed.storage_path,
              original_name: file.name,
              mime_type:
                file.type ||
                "application/octet-stream",
              size_bytes: file.size
            })
          });

          successful += 1;
        } catch (error) {
          failed.push({
            name: file.name,
            message: error.message
          });
        }
      }

      input.value = "";

      if (failed.length === 0) {
        showEditMessage(
          `${successful} Datei(en) wurden erfolgreich hochgeladen.`
        );
      } else {
        showEditMessage(
          `${successful} erfolgreich, ` +
          `${failed.length} fehlgeschlagen: ` +
          failed
            .map((item) =>
              `${item.name}: ${item.message}`
            )
            .join(" | "),
          true
        );
      }
    } catch (error) {
      showEditMessage(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = "Dateien hochladen";
    }
  }

  function statusOptions(selected) {
    const statuses = {
      received: "Anfrage eingegangen",
      planning: "Termin wird geplant",
      confirmed: "Termin bestätigt",
      captured: "Aufnahmen erstellt",
      processing: "In Bearbeitung",
      ready: "Bereit zum Download",
      completed: "Abgeschlossen",
      cancelled: "Storniert"
    };

    return Object.entries(statuses)
      .map(([value, label]) => `
        <option
          value="${value}"
          ${value === selected ? "selected" : ""}
        >
          ${label}
        </option>
      `)
      .join("");
  }
})();
