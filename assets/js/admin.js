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
let adminStarted = false;

/* =========================================================
   INITIALISIERUNG
========================================================= */

if (!identity) {
  showFatalAdminError(
    "Netlify Identity konnte nicht geladen werden. Bitte lade die Seite neu."
  );

  throw new Error(
    "Netlify Identity ist nicht verfügbar."
  );
}

identity.on("init", async (user) => {
  await handleUser(user);
});

identity.on("login", async (user) => {
  identity.close();
  await handleUser(user);
});

identity.on("logout", () => {
  window.location.href = "/";
});

identity.on("error", (error) => {
  console.error(
    "Netlify-Identity-Fehler:",
    error
  );

  showAdminLoginMessage(
    "Bei der Anmeldung ist ein Fehler aufgetreten. Bitte melde dich erneut an."
  );
});

identity.init();

document
  .querySelector("#logoutButton")
  ?.addEventListener(
    "click",
    async () => {
      await identity.logout();
    }
  );

document
  .querySelectorAll("[data-view]")
  .forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        switchView(
          button.dataset.view
        );
      }
    );
  });

document
  .querySelector("#refreshOrders")
  ?.addEventListener(
    "click",
    loadOrders
  );

document
  .querySelector("#newOrderForm")
  ?.addEventListener(
    "submit",
    createOrder
  );

/* =========================================================
   ADMIN PRÜFEN
========================================================= */

async function handleUser(user) {
  try {
    if (!user) {
      adminStarted = false;

      showAdminLoginMessage(
        "Bitte melde dich mit deinem Admin-Konto an."
      );

      identity.open("login");
      return;
    }

    let token = null;

    /*
     * Token erneuern, damit eine neu gesetzte Admin-Rolle
     * sicher im aktuellen JWT enthalten ist.
     */
    try {
      token = await user.jwt(true);
    } catch (refreshError) {
      console.warn(
        "JWT konnte nicht erzwungen erneuert werden:",
        refreshError
      );

      try {
        token = await user.jwt();
      } catch (tokenError) {
        console.error(
          "JWT konnte nicht geladen werden:",
          tokenError
        );
      }
    }

    const roles =
      collectUserRoles(
        user,
        token
      );

    console.log(
      "Angemeldeter Benutzer:",
      user.email
    );

    console.log(
      "Erkannte Rollen:",
      roles
    );

    if (!roles.includes("admin")) {
      adminStarted = false;

      showAdminLoginMessage(
        `Du bist als ${user.email || "Benutzer"} angemeldet, ` +
        "aber dein aktuelles Login-Token enthält keine Admin-Rolle. " +
        "Bitte melde dich vollständig ab und danach erneut an."
      );

      return;
    }

    const adminIdentity =
      document.querySelector(
        "#adminIdentity"
      );

    if (adminIdentity) {
      adminIdentity.textContent =
        `Admin: ${user.email}`;
    }

    hideAdminLoginMessage();

    /*
     * Verhindert doppeltes Laden durch init und login.
     */
    if (adminStarted) {
      return;
    }

    adminStarted = true;

    const results =
      await Promise.allSettled([
        loadUsers(),
        loadOrders()
      ]);

    results.forEach(
      (result, index) => {
        if (
          result.status === "rejected"
        ) {
          console.error(
            index === 0
              ? "Benutzer konnten nicht geladen werden:"
              : "Bestellungen konnten nicht geladen werden:",
            result.reason
          );
        }
      }
    );
  } catch (error) {
    adminStarted = false;

    console.error(
      "Fehler bei der Admin-Prüfung:",
      error
    );

    showAdminLoginMessage(
      error?.message ||
      "Die Admin-Berechtigung konnte nicht geprüft werden."
    );
  }
}

/* =========================================================
   ROLLEN AUS BENUTZER UND JWT LESEN
========================================================= */

function collectUserRoles(
  user,
  token
) {
  const roles = new Set();

  function addRoles(value) {
    if (Array.isArray(value)) {
      value.forEach((role) => {
        const normalizedRole =
          String(role || "")
            .trim()
            .toLowerCase();

        if (normalizedRole) {
          roles.add(
            normalizedRole
          );
        }
      });

      return;
    }

    if (
      typeof value === "string"
    ) {
      value
        .split(",")
        .map((role) =>
          role
            .trim()
            .toLowerCase()
        )
        .filter(Boolean)
        .forEach((role) => {
          roles.add(role);
        });
    }
  }

  /*
   * Rollen aus dem Netlify-Benutzerobjekt.
   */
  addRoles(
    user?.app_metadata?.roles
  );

  addRoles(
    user?.appMetadata?.roles
  );

  addRoles(
    user?.roles
  );

  addRoles(
    user?.user?.app_metadata?.roles
  );

  /*
   * Rollen zusätzlich direkt aus dem JWT lesen.
   */
  const claims =
    decodeJwtPayload(token);

  addRoles(
    claims?.app_metadata?.roles
  );

  addRoles(
    claims?.appMetadata?.roles
  );

  addRoles(
    claims?.roles
  );

  addRoles(
    claims?.user?.app_metadata?.roles
  );

  return Array.from(roles);
}

function decodeJwtPayload(token) {
  if (
    !token ||
    typeof token !== "string"
  ) {
    return {};
  }

  try {
    const parts =
      token.split(".");

    if (parts.length < 2) {
      return {};
    }

    const base64Url =
      parts[1];

    const base64 =
      base64Url
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    const padding =
      "=".repeat(
        (4 - base64.length % 4) % 4
      );

    const binary =
      window.atob(
        base64 + padding
      );

    const bytes =
      Uint8Array.from(
        binary,
        (character) =>
          character.charCodeAt(0)
      );

    const json =
      new TextDecoder()
        .decode(bytes);

    return JSON.parse(json);
  } catch (error) {
    console.warn(
      "JWT konnte nicht gelesen werden:",
      error
    );

    return {};
  }
}

/* =========================================================
   ADMIN-LOGIN-MELDUNG
========================================================= */

function showAdminLoginMessage(
  message
) {
  let box =
    document.querySelector(
      "#adminAccessMessage"
    );

  if (!box) {
    box =
      document.createElement(
        "div"
      );

    box.id =
      "adminAccessMessage";

    box.className =
      "notice notice-error";

    box.style.maxWidth =
      "850px";

    box.style.margin =
      "24px auto";

    box.style.padding =
      "18px";

    const main =
      document.querySelector(
        "main"
      );

    if (main) {
      main.prepend(box);
    } else {
      document.body
        .appendChild(box);
    }
  }

  box.innerHTML = `
    <strong>
      Admin-Anmeldung erforderlich
    </strong>

    <p style="margin-bottom:12px">
      ${escapeHtml(message)}
    </p>

    <div
      style="
        display:flex;
        gap:10px;
        flex-wrap:wrap;
      "
    >
      <button
        class="btn btn-primary"
        id="openAdminLogin"
        type="button"
      >
        Als Admin anmelden
      </button>

      <button
        class="btn btn-secondary"
        id="adminLogoutAndLogin"
        type="button"
      >
        Abmelden und neu anmelden
      </button>
    </div>
  `;

  document
    .querySelector(
      "#openAdminLogin"
    )
    ?.addEventListener(
      "click",
      () => {
        identity.open("login");
      }
    );

  document
    .querySelector(
      "#adminLogoutAndLogin"
    )
    ?.addEventListener(
      "click",
      async () => {
        try {
          await identity.logout();
        } finally {
          window.setTimeout(
            () => {
              identity.open(
                "login"
              );
            },
            500
          );
        }
      }
    );
}

function hideAdminLoginMessage() {
  document
    .querySelector(
      "#adminAccessMessage"
    )
    ?.remove();
}

function showFatalAdminError(
  message
) {
  document.body.innerHTML = `
    <main
      style="
        width:min(700px,calc(100% - 32px));
        margin:50px auto;
        font-family:Arial,sans-serif;
      "
    >
      <section
        style="
          padding:24px;
          border-radius:18px;
          background:white;
          box-shadow:0 12px 28px rgba(0,0,0,.14);
        "
      >
        <h1>
          Admin-Backend
        </h1>

        <p>
          ${escapeHtml(message)}
        </p>

        <a href="/">
          Zur Startseite
        </a>
      </section>
    </main>
  `;
}

/* =========================================================
   ANSICHTEN
========================================================= */

function switchView(name) {
  document
    .querySelectorAll(
      ".admin-view"
    )
    .forEach((view) => {
      view.classList.add(
        "hidden"
      );
    });

  const target =
    document.querySelector(
      `#view-${name}`
    );

  if (target) {
    target.classList.remove(
      "hidden"
    );
  }

  document
    .querySelectorAll(
      "[data-view]"
    )
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
      await api(
        "admin-users"
      );

    users =
      Array.isArray(
        result?.users
      )
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
                      ${escapeHtml(
                        user.email
                      )}
                    </td>

                    <td>
                      <code>
                        ${escapeHtml(
                          user.id
                        )}
                      </code>
                    </td>

                    <td>
                      ${escapeHtml(
                        (
                          user.roles ||
                          []
                        ).join(", ")
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
                value="${escapeHtml(
                  user.id
                )}"
                data-email="${escapeHtml(
                  user.email
                )}"
              >
                ${escapeHtml(
                  user.email
                )}
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

    throw error;
  }
}

/* =========================================================
   BESTELLUNGEN LADEN
========================================================= */

async function loadOrders() {
  try {
    const result =
      await api(
        "orders?scope=all"
      );

    orders =
      Array.isArray(
        result?.orders
      )
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
                      data-edit="${escapeHtml(
                        order.id
                      )}"
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
      .querySelectorAll(
        "[data-edit]"
      )
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

    throw error;
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
    select
      ?.selectedOptions
      ?.[0];

  if (!select?.value) {
    showMessage(
      "Bitte einen Kunden auswählen.",
      true
    );

    return;
  }

  try {
    await api(
      "orders",
      {
        method: "POST",

        body: JSON.stringify({
          customer_id:
            select.value,

          customer_email:
            option
              ?.dataset
              ?.email || "",

          package_name:
            document
              .querySelector(
                "#newPackage"
              )
              ?.value
              .trim() || "",

          status:
            document
              .querySelector(
                "#newStatus"
              )
              ?.value ||
            "received",

          desired_date:
            document
              .querySelector(
                "#newDesiredDate"
              )
              ?.value ||
            null,

          admin_message:
            document
              .querySelector(
                "#newAdminMessage"
              )
              ?.value
              .trim() || ""
        })
      }
    );

    event
      .currentTarget
      .reset();

    showMessage(
      "Bestellung wurde erstellt."
    );

    await loadOrders();

    switchView(
      "orders"
    );
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
      (item) =>
        item.id === id
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
            order.admin_message ||
            ""
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
    .querySelector(
      "#editOrderForm"
    )
    ?.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        try {
          await api(
            "orders",
            {
              method: "PATCH",

              body:
                JSON.stringify({
                  id,

                  status:
                    document
                      .querySelector(
                        "#editStatus"
                      )
                      ?.value,

                  admin_message:
                    document
                      .querySelector(
                        "#editAdminMessage"
                      )
                      ?.value
                      .trim() ||
                    ""
                })
            }
          );

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
    .querySelector(
      "#uploadFileButton"
    )
    ?.addEventListener(
      "click",
      () => {
        uploadFiles(order);
      }
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
      input?.files ||
      []
    );

  if (files.length === 0) {
    alert(
      "Bitte mindestens eine Datei auswählen."
    );

    return;
  }

  if (!order?.id) {
    if (result) {
      result.innerHTML = `
        <div class="notice notice-error">
          Die Bestell-ID fehlt.
        </div>
      `;
    }

    return;
  }

  if (uploadButton) {
    uploadButton.disabled =
      true;

    uploadButton.textContent =
      "Upload läuft …";
  }

  let successfulUploads = 0;

  const failedUploads = [];

  try {
    const config =
      await api(
        "public-config"
      );

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
            persistSession:
              false,

            autoRefreshToken:
              false
          }
        }
      );

    /*
     * Dateien bewusst nacheinander hochladen.
     */
    for (
      let index = 0;
      index < files.length;
      index += 1
    ) {
      const file =
        files[index];

      if (result) {
        result.innerHTML = `
          <div class="notice">
            <strong>
              Datei ${index + 1}
              von ${files.length}
            </strong>

            <br>

            ${escapeHtml(
              file.name
            )}
            wird vorbereitet …
          </div>
        `;
      }

      try {
        /*
         * 1. Signierte Upload-Daten von Netlify holen.
         */
        const signed =
          await api(
            "file-upload-url",
            {
              method: "POST",

              body:
                JSON.stringify({
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
          !signed
            ?.storage_path ||
          !signed
            ?.token
        ) {
          throw new Error(
            "Die Upload-Function hat keine gültigen Upload-Daten zurückgegeben."
          );
        }

        if (result) {
          result.innerHTML = `
            <div class="notice">
              <strong>
                Datei ${index + 1}
                von ${files.length}
              </strong>

              <br>

              ${escapeHtml(
                file.name
              )}
              wird hochgeladen …
            </div>
          `;
        }

        /*
         * 2. Datei direkt zu Supabase hochladen.
         */
        const {
          error: uploadError
        } =
          await supabase
            .storage
            .from(
              config.bucket
            )
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

        if (result) {
          result.innerHTML = `
            <div class="notice">
              <strong>
                Datei ${index + 1}
                von ${files.length}
              </strong>

              <br>

              ${escapeHtml(
                file.name
              )}
              wird dem Kundenkonto zugeordnet …
            </div>
          `;
        }

        /*
         * 3. Datenbankeintrag erstellen.
         */
        await api(
          "file-complete",
          {
            method: "POST",

            body:
              JSON.stringify({
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

    if (
      failedUploads.length === 0
    ) {
      if (result) {
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
      }
    } else {
      const failedList =
        failedUploads
          .map(
            (item) => `
              <li>
                <strong>
                  ${escapeHtml(
                    item.name
                  )}
                </strong>

                <br>

                ${escapeHtml(
                  item.message
                )}
              </li>
            `
          )
          .join("");

      if (result) {
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
    }
  } catch (error) {
    console.error(
      "Upload konnte nicht gestartet werden:",
      error
    );

    if (result) {
      result.innerHTML = `
        <div class="notice notice-error">
          ${escapeHtml(
            error?.message ||
            "Der Upload konnte nicht gestartet werden."
          )}
        </div>
      `;
    }
  } finally {
    if (uploadButton) {
      uploadButton.disabled =
        false;

      uploadButton.textContent =
        "Dateien hochladen";
    }
  }
}

/* =========================================================
   STATUSOPTIONEN
========================================================= */

function statusOptions(
  selected
) {
  const statuses = {
    received:
      "Anfrage eingegangen",

    planning:
      "Termin wird geplant",

    confirmed:
      "Termin bestätigt",

    recorded:
      "Aufnahmen erstellt",

    captured:
      "Aufnahmen erstellt",

    processing:
      "In Bearbeitung",

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
