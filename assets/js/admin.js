import {
  createClient
} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

import {
  api,
  escapeHtml
} from "./api.js";

const identity = window.netlifyIdentity;

let users = [];
let orders = [];

/* =========================================================
   INITIALISIERUNG
========================================================= */

identity.on("init", handleUser);

identity.on("login", (user) => {
  identity.close();
  handleUser(user);
});

identity.on("logout", () => {
  location.href = "/";
});

identity.init();

document
  .querySelector("#logoutButton")
  ?.addEventListener("click", () => {
    identity.logout();
  });

document
  .querySelectorAll("[data-view]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      switchView(button.dataset.view);
    });
  });

document
  .querySelector("#refreshOrders")
  ?.addEventListener("click", loadOrders);

document
  .querySelector("#newOrderForm")
  ?.addEventListener("submit", createOrder);

/* =========================================================
   ADMIN PRÜFEN
========================================================= */

async function handleUser(user) {
  if (!user) {
    identity.open("login");
    return;
  }

  const roles =
    user.app_metadata?.roles ||
    [];

  if (!roles.includes("admin")) {
    location.href = "/konto/";
    return;
  }

  const adminIdentity =
    document.querySelector("#adminIdentity");

  if (adminIdentity) {
    adminIdentity.textContent =
      `Admin: ${user.email}`;
  }

  await Promise.all([
    loadUsers(),
    loadOrders()
  ]);
}

/* =========================================================
   ANSICHTEN
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
      button.classList.toggle(
        "active",
        button.dataset.view === name
      );
    });
}

/* =========================================================
   BENUTZER LADEN
========================================================= */

async function loadUsers() {
  try {
    const result =
      await api("admin-users");

    users =
      Array.isArray(result?.users)
        ? result.users
        : [];

    const table =
      document.querySelector(
        "#customersTable"
      );

    if (table) {
      table.innerHTML =
        users.length > 0
          ? users
              .map(
                (user) => `
                  <tr>
                    <td>
                      ${escapeHtml(user.email)}
                    </td>

                    <td>
                      <code>
                        ${escapeHtml(user.id)}
                      </code>
                    </td>

                    <td>
                      ${escapeHtml(
                        (user.roles || []).join(", ")
                      )}
                    </td>
                  </tr>
                `
              )
              .join("")
          : `
              <tr>
                <td colspan="3">
                  Keine Benutzer gefunden.
                </td>
              </tr>
            `;
    }

    const select =
      document.querySelector(
        "#newCustomer"
      );

    if (select) {
      select.innerHTML = `
        <option value="">
          Bitte wählen
        </option>

        ${users
          .map(
            (user) => `
              <option
                value="${escapeHtml(user.id)}"
                data-email="${escapeHtml(user.email)}"
              >
                ${escapeHtml(user.email)}
              </option>
            `
          )
          .join("")}
      `;
    }
  } catch (error) {
    showMessage(
      error.message,
      true
    );
  }
}

/* =========================================================
   BESTELLUNGEN LADEN
========================================================= */

async function loadOrders() {
  try {
    const result =
      await api("orders?scope=all");

    orders =
      Array.isArray(result?.orders)
        ? result.orders
        : [];

    const table =
      document.querySelector(
        "#ordersTable"
      );

    if (!table) {
      return;
    }

    table.innerHTML =
      orders.length > 0
        ? orders
            .map(
              (order) => `
                <tr>
                  <td>
                    ${escapeHtml(
                      order.order_number
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      order.customer_email
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      order.package_name
                    )}
                  </td>

                  <td>
                    ${escapeHtml(
                      order.status_label ||
                      order.status
                    )}
                  </td>

                  <td>
                    <button
                      class="btn btn-secondary btn-small"
                      type="button"
                      data-edit="${escapeHtml(order.id)}"
                    >
                      Bearbeiten
                    </button>
                  </td>
                </tr>
              `
            )
            .join("")
        : `
            <tr>
              <td colspan="5">
                Keine Bestellungen vorhanden.
              </td>
            </tr>
          `;

    document
      .querySelectorAll("[data-edit]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            editOrder(
              button.dataset.edit
            );
          }
        );
      });
  } catch (error) {
    showMessage(
      error.message,
      true
    );
  }
}

/* =========================================================
   BESTELLUNG ERSTELLEN
========================================================= */

async function createOrder(event) {
  event.preventDefault();

  const select =
    document.querySelector(
      "#newCustomer"
    );

  const option =
    select?.selectedOptions?.[0];

  if (!select?.value) {
    showMessage(
      "Bitte einen Kunden auswählen.",
      true
    );
    return;
  }

  try {
    await api("orders", {
      method: "POST",

      body: JSON.stringify({
        customer_id:
          select.value,

        customer_email:
          option?.dataset?.email || "",

        package_name:
          document
            .querySelector("#newPackage")
            ?.value
            .trim() || "",

        status:
          document
            .querySelector("#newStatus")
            ?.value || "received",

        desired_date:
          document
            .querySelector("#newDesiredDate")
            ?.value || null,

        admin_message:
          document
            .querySelector("#newAdminMessage")
            ?.value
            .trim() || ""
      })
    });

    event.currentTarget.reset();

    showMessage(
      "Bestellung wurde erstellt."
    );

    await loadOrders();

    switchView("orders");
  } catch (error) {
    showMessage(
      error.message,
      true
    );
  }
}

/* =========================================================
   BESTELLUNG BEARBEITEN
========================================================= */

function editOrder(id) {
  const order =
    orders.find(
      (item) => item.id === id
    );

  if (!order) {
    showMessage(
      "Bestellung wurde nicht gefunden.",
      true
    );
    return;
  }

  const editor =
    document.querySelector(
      "#orderEditor"
    );

  if (!editor) {
    return;
  }

  editor.innerHTML = `
    <form
      class="card section"
      id="editOrderForm"
    >
      <h2>
        ${escapeHtml(
          order.order_number
        )}
        bearbeiten
      </h2>

      <div class="form-grid">
        <div class="field">
          <label for="editStatus">
            Status
          </label>

          <select id="editStatus">
            ${statusOptions(
              order.status
            )}
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
            Bilder oder Dateien hochladen
          </label>

          <input
            id="fileInput"
            type="file"
            accept="image/*,video/*,.zip,.pdf"
            multiple
          >

          <small>
            Du kannst mehrere Dateien gleichzeitig auswählen.
            Die Dateien werden nacheinander in den privaten
            Supabase-Speicher hochgeladen.
          </small>
        </div>
      </div>

      <div
        style="
          display:flex;
          gap:10px;
          flex-wrap:wrap;
        "
      >
        <button
          class="btn btn-primary"
          type="submit"
        >
          Speichern
        </button>

        <button
          class="btn btn-secondary"
          type="button"
          id="uploadFileButton"
        >
          Dateien hochladen
        </button>
      </div>

      <div id="editResult"></div>
    </form>
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
              id,

              status:
                document
                  .querySelector("#editStatus")
                  ?.value,

              admin_message:
                document
                  .querySelector(
                    "#editAdminMessage"
                  )
                  ?.value
                  .trim() || ""
            })
          });

          showMessage(
            "Bestellung wurde aktualisiert."
          );

          await loadOrders();
        } catch (error) {
          showMessage(
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
      () => uploadFiles(order)
    );
}

/* =========================================================
   MEHRERE DATEIEN HOCHLADEN
========================================================= */

async function uploadFiles(order) {
  const input =
    document.querySelector(
      "#fileInput"
    );

  const result =
    document.querySelector(
      "#editResult"
    );

  const uploadButton =
    document.querySelector(
      "#uploadFileButton"
    );

  const files =
    Array.from(
      input?.files || []
    );

  if (files.length === 0) {
    alert(
      "Bitte mindestens eine Datei auswählen."
    );
    return;
  }

  if (!order?.id) {
    result.innerHTML = `
      <div class="notice notice-error">
        Die Bestell-ID fehlt.
      </div>
    `;

    return;
  }

  if (uploadButton) {
    uploadButton.disabled = true;
    uploadButton.textContent =
      "Upload läuft …";
  }

  let successfulUploads = 0;

  const failedUploads = [];

  try {
    /*
     * Öffentliche Supabase-Konfiguration einmal laden.
     */
    const config =
      await api("public-config");

    if (
      !config?.supabase_url ||
      !config?.supabase_anon_key ||
      !config?.bucket
    ) {
      throw new Error(
        "Die öffentliche Supabase-Konfiguration ist unvollständig."
      );
    }

    const supabase =
      createClient(
        config.supabase_url,
        config.supabase_anon_key,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false
          }
        }
      );

    /*
     * Dateien bewusst nacheinander hochladen.
     * Dadurch werden Browser und Netzwerk nicht überlastet.
     */
    for (
      let index = 0;
      index < files.length;
      index += 1
    ) {
      const file =
        files[index];

      result.innerHTML = `
        <div class="notice">
          <strong>
            Datei ${index + 1}
            von ${files.length}
          </strong>

          <br>

          ${escapeHtml(file.name)}
          wird vorbereitet …
        </div>
      `;

      try {
        /*
         * 1. Signierte Upload-URL anfordern.
         */
        const signed =
          await api(
            "file-upload-url",
            {
              method: "POST",

              body: JSON.stringify({
                order_id:
                  order.id,

                file_name:
                  file.name,

                mime_type:
                  file.type ||
                  "application/octet-stream",

                size_bytes:
                  file.size
              })
            }
          );

        if (
          !signed?.storage_path ||
          !signed?.token
        ) {
          throw new Error(
            "Die Upload-Function hat keine gültigen Upload-Daten zurückgegeben."
          );
        }

        result.innerHTML = `
          <div class="notice">
            <strong>
              Datei ${index + 1}
              von ${files.length}
            </strong>

            <br>

            ${escapeHtml(file.name)}
            wird hochgeladen …
          </div>
        `;

        /*
         * 2. Datei direkt zu Supabase Storage hochladen.
         */
        const {
          error: uploadError
        } =
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
          throw new Error(
            uploadError.message
          );
        }

        result.innerHTML = `
          <div class="notice">
            <strong>
              Datei ${index + 1}
              von ${files.length}
            </strong>

            <br>

            ${escapeHtml(file.name)}
            wird dem Kundenkonto zugeordnet …
          </div>
        `;

        /*
         * 3. Datei in order_files speichern.
         */
        await api(
          "file-complete",
          {
            method: "POST",

            body: JSON.stringify({
              order_id:
                order.id,

              storage_path:
                signed.storage_path,

              original_name:
                file.name,

              mime_type:
                file.type ||
                "application/octet-stream",

              size_bytes:
                file.size
            })
          }
        );

        successfulUploads += 1;
      } catch (fileError) {
        console.error(
          `Upload von ${file.name} fehlgeschlagen:`,
          fileError
        );

        failedUploads.push({
          name:
            file.name,

          message:
            fileError?.message ||
            "Unbekannter Uploadfehler"
        });
      }
    }

    if (input) {
      input.value = "";
    }

    if (failedUploads.length === 0) {
      result.innerHTML = `
        <div class="notice notice-success">
          ${successfulUploads}
          ${
            successfulUploads === 1
              ? "Datei wurde"
              : "Dateien wurden"
          }
          erfolgreich hochgeladen und
          dem Kunden freigegeben.
        </div>
      `;
    } else {
      const failedList =
        failedUploads
          .map(
            (item) => `
              <li>
                <strong>
                  ${escapeHtml(item.name)}
                </strong>

                <br>

                ${escapeHtml(item.message)}
              </li>
            `
          )
          .join("");

      result.innerHTML = `
        <div class="notice notice-error">
          <p>
            Erfolgreich:
            ${successfulUploads}
          </p>

          <p>
            Fehlgeschlagen:
            ${failedUploads.length}
          </p>

          <ul>
            ${failedList}
          </ul>
        </div>
      `;
    }
  } catch (error) {
    console.error(
      "Upload konnte nicht gestartet werden:",
      error
    );

    result.innerHTML = `
      <div class="notice notice-error">
        ${escapeHtml(
          error?.message ||
          "Der Upload konnte nicht gestartet werden."
        )}
      </div>
    `;
  } finally {
    if (uploadButton) {
      uploadButton.disabled = false;
      uploadButton.textContent =
        "Dateien hochladen";
    }
  }
}

/* =========================================================
   STATUSOPTIONEN
========================================================= */

function statusOptions(selected) {
  const statuses = {
    received:
      "Anfrage eingegangen",

    planning:
      "Termin wird geplant",

    confirmed:
      "Termin bestätigt",

    recorded:
      "Aufnahmen erstellt",

    editing:
      "In Bearbeitung",

    ready:
      "Bereit zum Download",

    completed:
      "Abgeschlossen",

    cancelled:
      "Storniert"
  };

  return Object
    .entries(statuses)
    .map(
      ([value, label]) => `
        <option
          value="${value}"
          ${
            value === selected
              ? "selected"
              : ""
          }
        >
          ${label}
        </option>
      `
    )
    .join("");
}

/* =========================================================
   MELDUNGEN
========================================================= */

function showMessage(
  message,
  error = false
) {
  const element =
    document.querySelector(
      "#adminMessage"
    );

  if (!element) {
    return;
  }

  element.innerHTML = `
    <div
      class="notice ${
        error
          ? "notice-error"
          : "notice-success"
      }"
    >
      ${escapeHtml(message)}
    </div>
  `;
}
