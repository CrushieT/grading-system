(() => {
  const REFRESH_STORAGE_KEY = "gd_refresh";
  const CUSTOM_COMPONENT_VALUE = "__custom__";
  const COMPONENT_OPTIONS = [
    "Quiz",
    "Activity",
    "Exam",
    "Attendance",
    "Recitation",
    "Participation",
    "Assignment",
    "Project",
    "Laboratory",
    "Performance Task",
    "Seatwork",
    "Written Work",
    "Practical Exam",
    "Final Exam",
  ];

  let accessToken = null;
  let refreshPromise = null;
  let isRedirectingToLogin = false;

  const state = {
    templates: [],
    editingTemplateId: null,
    deleteTemplateId: null,
    rowCounter: 0,
  };

  function getEl(id) {
    return document.getElementById(id);
  }

  function getRefreshToken() {
    const sessionRefresh = sessionStorage.getItem(REFRESH_STORAGE_KEY);
    if (sessionRefresh) return sessionRefresh;

    const legacyRefresh = localStorage.getItem(REFRESH_STORAGE_KEY);
    if (legacyRefresh) {
      sessionStorage.setItem(REFRESH_STORAGE_KEY, legacyRefresh);
      localStorage.removeItem(REFRESH_STORAGE_KEY);
    }
    return legacyRefresh;
  }

  function hardRedirectLogin() {
    if (isRedirectingToLogin) return;
    isRedirectingToLogin = true;

    const refresh = getRefreshToken();
    fetch("/api/auth/logout/", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(refresh ? { refresh } : {}),
      keepalive: true,
    }).finally(() => {
      window.location.replace("/login.html");
    });
  }

  async function safeJson(response) {
    try {
      return await response.json();
    } catch (_err) {
      return {};
    }
  }

  async function refreshAccessToken() {
    const refresh = getRefreshToken();
    if (!refresh) return null;
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      try {
        const response = await fetch("/api/auth/refresh/", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ refresh }),
        });
        if (!response.ok) return null;
        const data = await safeJson(response);
        if (!data.access) return null;

        accessToken = data.access;
        if (data.refresh) {
          sessionStorage.setItem(REFRESH_STORAGE_KEY, data.refresh);
          localStorage.removeItem(REFRESH_STORAGE_KEY);
        }
        return accessToken;
      } catch (_err) {
        return null;
      }
    })();

    const token = await refreshPromise;
    refreshPromise = null;
    return token;
  }

  async function authFetch(url, options = {}, allowRetry = true) {
    const requestOptions = {
      ...options,
      credentials: "same-origin",
      headers: {
        ...(options.headers || {}),
      },
    };

    let token = accessToken || (await refreshAccessToken());
    if (token) requestOptions.headers.Authorization = `Bearer ${token}`;

    let response = await fetch(url, requestOptions);
    if (response.status === 401 && allowRetry) {
      token = await refreshAccessToken();
      if (token) {
        requestOptions.headers.Authorization = `Bearer ${token}`;
        response = await fetch(url, requestOptions);
      }
    }

    if (response.status === 401) {
      sessionStorage.removeItem(REFRESH_STORAGE_KEY);
      localStorage.removeItem(REFRESH_STORAGE_KEY);
      hardRedirectLogin();
    }

    return response;
  }

  function normalizeList(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.results)) return payload.results;
    if (payload && Array.isArray(payload.items)) return payload.items;
    return [];
  }

  function extractErrorMessage(payload, fallbackMessage) {
    if (!payload) return fallbackMessage;
    if (typeof payload === "string") return payload;
    if (payload.detail && typeof payload.detail === "string") return payload.detail;

    const entries = Object.entries(payload);
    for (const [, value] of entries) {
      if (Array.isArray(value) && value.length) return String(value[0]);
      if (typeof value === "string") return value;
    }
    return fallbackMessage;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function showFeedback(message, isError = false) {
    const feedbackEl = getEl("grading-setup-feedback");
    if (!feedbackEl) return;

    feedbackEl.textContent = message;
    feedbackEl.hidden = false;
    feedbackEl.classList.toggle("error", isError);

    window.clearTimeout(showFeedback._timeoutId);
    showFeedback._timeoutId = window.setTimeout(() => {
      feedbackEl.hidden = true;
    }, 3200);
  }

  function showModalError(id, message) {
    const errorEl = getEl(id);
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = !message;
  }

  function openModal(modalId) {
    const modal = getEl(modalId);
    if (modal) modal.hidden = false;
  }

  function closeModal(modalId) {
    const modal = getEl(modalId);
    if (modal) modal.hidden = true;
  }

  function formatWeight(weight) {
    const value = Number(weight);
    if (!Number.isFinite(value)) return "0";
    return value.toFixed(2).replace(/\.00$/, "");
  }

  function getTemplatesListEl() {
    return getEl("grading-templates-list");
  }

  function getTemplateById(id) {
    return state.templates.find(item => item.id === id);
  }

  function sortTemplates(templates) {
    return [...templates].sort((a, b) => {
      if (!!a.is_default !== !!b.is_default) return a.is_default ? -1 : 1;
      if (!!a.is_active !== !!b.is_active) return a.is_active ? -1 : 1;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }

  function buildComponentsSummary(template) {
    const components = Array.isArray(template.components) ? template.components : [];
    const sorted = [...components].sort((a, b) => {
      const ao = Number(a.order || 0);
      const bo = Number(b.order || 0);
      if (ao === bo) return Number(a.id || 0) - Number(b.id || 0);
      return ao - bo;
    });
    const parts = sorted
      .filter(item => item.is_active !== false)
      .map(item => `${item.name} ${formatWeight(item.weight)}%`);
    return parts.join(" | ");
  }

  function renderTemplates() {
    const listEl = getTemplatesListEl();
    if (!listEl) return;

    if (!state.templates.length) {
      listEl.innerHTML = `
        <div class="setup-item">
          <div><div class="setup-sub">No grading templates yet.</div></div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = state.templates
      .map(item => {
        const badges = [];
        if (item.is_default) badges.push('<span class="badge badge-green">Default</span>');
        badges.push(
          `<span class="badge ${item.is_active ? "badge-blue" : "badge-gray"}">${
            item.is_active ? "Active" : "Inactive"
          }</span>`
        );
        const summary = buildComponentsSummary(item) || "No active components.";
        return `
          <div class="setup-item">
            <div>
              <div class="setup-label">${escapeHtml(item.name)}</div>
              <div class="setup-sub">${escapeHtml(summary)}</div>
              <div class="gs-template-badges">${badges.join("")}</div>
            </div>
            <div class="setup-actions">
              <button type="button" class="icon-btn" data-action="gs-set-default" data-id="${
                item.id
              }" ${item.is_default ? "disabled" : ""}>Set Default</button>
              <button type="button" class="icon-btn" data-action="gs-edit-template" data-id="${item.id}">Edit</button>
              <button type="button" class="icon-btn danger" data-action="gs-delete-template" data-id="${item.id}">${
                item.is_active ? "Delete" : "Remove"
              }</button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderLoadingState() {
    const listEl = getTemplatesListEl();
    if (!listEl) return;
    listEl.innerHTML = `
      <div class="setup-item">
        <div><div class="setup-sub">Loading grading templates...</div></div>
      </div>
    `;
  }

  async function fetchList(url, fallbackMessage) {
    const response = await authFetch(url, { method: "GET" });
    const payload = await safeJson(response);
    if (!response.ok) {
      throw new Error(extractErrorMessage(payload, fallbackMessage));
    }
    return normalizeList(payload);
  }

  async function sendJson(url, method, payload, fallbackMessage) {
    const response = await authFetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await safeJson(response);
    if (!response.ok) {
      throw new Error(extractErrorMessage(data, fallbackMessage));
    }
    return data;
  }

  async function loadTemplates() {
    renderLoadingState();
    const templates = await fetchList("/api/grading-templates/", "Failed to load grading templates.");
    state.templates = sortTemplates(templates);
    renderTemplates();
  }

  function getComponentsRowsContainer() {
    return getEl("grading-template-components-list");
  }

  function buildTypeOptions(selectedValue) {
    const options = COMPONENT_OPTIONS.map(option => {
      const selected = option === selectedValue ? "selected" : "";
      return `<option value="${escapeHtml(option)}" ${selected}>${escapeHtml(option)}</option>`;
    });
    options.push(
      `<option value="${CUSTOM_COMPONENT_VALUE}" ${
        selectedValue === CUSTOM_COMPONENT_VALUE ? "selected" : ""
      }>Other / Custom</option>`
    );
    return options.join("");
  }

  function syncCustomFieldVisibility(row) {
    const select = row.querySelector(".gs-component-type");
    const custom = row.querySelector(".gs-component-custom");
    if (!select || !custom) return;
    custom.hidden = select.value !== CUSTOM_COMPONENT_VALUE;
    if (!custom.hidden) custom.focus();
  }

  function addComponentRow(component = {}) {
    const rowsEl = getComponentsRowsContainer();
    if (!rowsEl) return;

    const rawName = String(component.name || component.type || "").trim();
    const matched = COMPONENT_OPTIONS.find(item => item.toLowerCase() === rawName.toLowerCase());
    const selected = matched || CUSTOM_COMPONENT_VALUE;
    const customValue = matched ? "" : rawName;
    const weightValue = component.weight != null ? String(component.weight) : "";

    state.rowCounter += 1;
    const row = document.createElement("div");
    row.className = "gs-component-row";
    row.dataset.rowId = String(state.rowCounter);
    row.innerHTML = `
      <select class="gs-component-type">${buildTypeOptions(selected)}</select>
      <input type="text" class="gs-component-custom" placeholder="Custom component name" value="${escapeHtml(
        customValue
      )}" ${selected === CUSTOM_COMPONENT_VALUE ? "" : "hidden"}>
      <div class="weight-input">
        <input type="number" class="gs-component-weight mono" min="0.01" max="100" step="0.01" value="${escapeHtml(
          weightValue
        )}">
        <span>%</span>
      </div>
      <button type="button" class="icon-btn danger" data-action="gs-remove-component-row">Remove</button>
    `;

    rowsEl.appendChild(row);
    updateTotalAndSaveState();
  }

  function clearComponentRows() {
    const rowsEl = getComponentsRowsContainer();
    if (!rowsEl) return;
    rowsEl.innerHTML = "";
  }

  function updateTotalAndSaveState() {
    const totalEl = getEl("grading-template-total");
    const saveBtn = getEl("grading-template-save-btn");
    const rows = [...document.querySelectorAll("#grading-template-components-list .gs-component-row")];
    let total = 0;
    rows.forEach(row => {
      const input = row.querySelector(".gs-component-weight");
      const value = Number(String(input ? input.value : "").trim());
      if (Number.isFinite(value)) total += value;
    });

    if (totalEl) {
      totalEl.textContent = `${total.toFixed(2)}%`;
      const isExact = Math.abs(total - 100) < 0.0001;
      totalEl.classList.toggle("value-green", isExact);
      totalEl.classList.toggle("value-red", !isExact);
    }
    if (saveBtn) {
      saveBtn.disabled = rows.length === 0 || Math.abs(total - 100) >= 0.0001;
    }
  }

  function getComponentNameFromRow(row) {
    const select = row.querySelector(".gs-component-type");
    const custom = row.querySelector(".gs-component-custom");
    if (!select) return "";
    if (select.value === CUSTOM_COMPONENT_VALUE) {
      return String(custom ? custom.value : "").trim();
    }
    return String(select.value || "").trim();
  }

  function collectTemplatePayload() {
    const name = String((getEl("grading-template-name-input") || {}).value || "").trim();
    const description = String((getEl("grading-template-description-input") || {}).value || "").trim();
    const rows = [...document.querySelectorAll("#grading-template-components-list .gs-component-row")];

    if (!name) {
      throw new Error("Template name is required.");
    }
    if (!rows.length) {
      throw new Error("Please add at least one component.");
    }

    const seen = new Set();
    let total = 0;
    const components = rows.map((row, index) => {
      const componentName = getComponentNameFromRow(row);
      if (!componentName) {
        throw new Error("Component name is required.");
      }

      const key = componentName.toLowerCase();
      if (seen.has(key)) {
        throw new Error("Duplicate component names are not allowed.");
      }
      seen.add(key);

      const weightInput = row.querySelector(".gs-component-weight");
      const weight = Number(String(weightInput ? weightInput.value : "").trim());
      if (!Number.isFinite(weight) || weight <= 0) {
        throw new Error("Component weight must be greater than 0.");
      }
      if (weight > 100) {
        throw new Error("Component weight must not exceed 100.");
      }

      total += weight;
      return {
        name: componentName,
        weight: Number(weight.toFixed(2)),
        order: index + 1,
        is_active: true,
      };
    });

    if (Math.abs(total - 100) >= 0.0001) {
      throw new Error("Total weight must equal 100%.");
    }

    return {
      name,
      description: description || null,
      components,
    };
  }

  function resetTemplateModal() {
    state.editingTemplateId = null;
    getEl("grading-template-modal-title").textContent = "Add Grading Template";
    getEl("grading-template-name-input").value = "";
    getEl("grading-template-description-input").value = "";
    showModalError("grading-template-modal-error", "");
    clearComponentRows();
    addComponentRow({ name: "Quiz", weight: 30 });
    addComponentRow({ name: "Activity", weight: 40 });
    addComponentRow({ name: "Exam", weight: 30 });
    updateTotalAndSaveState();
  }

  function openTemplateCreateModal() {
    resetTemplateModal();
    openModal("modal-grading-template-manage");
  }

  function openTemplateEditModal(id) {
    const template = getTemplateById(id);
    if (!template) return;

    state.editingTemplateId = id;
    getEl("grading-template-modal-title").textContent = "Edit Grading Template";
    getEl("grading-template-name-input").value = template.name || "";
    getEl("grading-template-description-input").value = template.description || "";
    showModalError("grading-template-modal-error", "");
    clearComponentRows();

    const components = Array.isArray(template.components) ? template.components : [];
    const sorted = [...components].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    if (!sorted.length) {
      addComponentRow({ name: "Quiz", weight: 30 });
      addComponentRow({ name: "Activity", weight: 40 });
      addComponentRow({ name: "Exam", weight: 30 });
    } else {
      sorted.forEach(component => addComponentRow(component));
    }

    updateTotalAndSaveState();
    openModal("modal-grading-template-manage");
  }

  function closeTemplateModal() {
    closeModal("modal-grading-template-manage");
    showModalError("grading-template-modal-error", "");
  }

  function openDeleteModal(id) {
    const template = getTemplateById(id);
    if (!template) return;
    state.deleteTemplateId = id;
    getEl("grading-template-delete-message").textContent = `Delete "${template.name}"?`;
    showModalError("grading-template-delete-error", "");
    openModal("modal-grading-template-delete");
  }

  function closeDeleteModal() {
    state.deleteTemplateId = null;
    showModalError("grading-template-delete-error", "");
    closeModal("modal-grading-template-delete");
  }

  async function saveTemplate() {
    try {
      const payload = collectTemplatePayload();
      const isEditing = !!state.editingTemplateId;
      const url = isEditing
        ? `/api/grading-templates/${state.editingTemplateId}/`
        : "/api/grading-templates/";
      const method = isEditing ? "PATCH" : "POST";

      await sendJson(url, method, payload, "Failed to save grading template.");
      closeTemplateModal();
      await loadTemplates();
      showFeedback("Grading template saved.");
    } catch (err) {
      showModalError("grading-template-modal-error", err.message || "Failed to save grading template.");
    }
  }

  async function setTemplateDefault(id) {
    try {
      await sendJson(
        `/api/grading-templates/${id}/set-default/`,
        "POST",
        {},
        "Failed to set default template."
      );
      await loadTemplates();
      showFeedback("Default grading template updated.");
    } catch (err) {
      showFeedback(err.message || "Failed to set default template.", true);
    }
  }

  async function confirmDeleteTemplate() {
    const id = state.deleteTemplateId;
    if (!id) return;

    const response = await authFetch(`/api/grading-templates/${id}/`, { method: "DELETE" });
    if (response.status === 204) {
      closeDeleteModal();
      await loadTemplates();
      showFeedback("Grading template deleted.");
      return;
    }

    const payload = await safeJson(response);
    if (response.ok) {
      closeDeleteModal();
      await loadTemplates();
      showFeedback(payload.message || "Grading template updated.");
      return;
    }

    showModalError(
      "grading-template-delete-error",
      extractErrorMessage(payload, "Failed to delete grading template.")
    );
  }

  function handleAction(actionEl) {
    const action = actionEl.dataset.action;
    const id = Number(actionEl.dataset.id || "0");

    if (action === "gs-open-template-create") openTemplateCreateModal();
    if (action === "gs-close-template-modal") closeTemplateModal();
    if (action === "gs-add-component-row") addComponentRow();
    if (action === "gs-save-template") saveTemplate();
    if (action === "gs-edit-template") openTemplateEditModal(id);
    if (action === "gs-delete-template") openDeleteModal(id);
    if (action === "gs-close-delete-modal") closeDeleteModal();
    if (action === "gs-confirm-delete-template") confirmDeleteTemplate();
    if (action === "gs-set-default") setTemplateDefault(id);

    if (action === "gs-remove-component-row") {
      const row = actionEl.closest(".gs-component-row");
      if (!row) return;
      row.remove();
      if (!document.querySelector("#grading-template-components-list .gs-component-row")) {
        addComponentRow();
      } else {
        updateTotalAndSaveState();
      }
    }
  }

  function setupRealtimeEvents() {
    document.addEventListener("change", event => {
      const row = event.target.closest(".gs-component-row");
      if (!row) return;
      if (event.target.classList.contains("gs-component-type")) {
        syncCustomFieldVisibility(row);
        updateTotalAndSaveState();
      }
    });

    document.addEventListener("input", event => {
      if (
        event.target.classList.contains("gs-component-weight")
        || event.target.classList.contains("gs-component-custom")
      ) {
        updateTotalAndSaveState();
      }
    });
  }

  async function initGradingSetup() {
    const page = getEl("page-settings");
    if (!page) return;

    document.addEventListener("click", event => {
      const actionEl = event.target.closest("[data-action]");
      if (!actionEl) return;
      if (!String(actionEl.dataset.action || "").startsWith("gs-")) return;
      handleAction(actionEl);
    });

    setupRealtimeEvents();

    try {
      await loadTemplates();
    } catch (err) {
      showFeedback(err.message || "Failed to load grading templates.", true);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initGradingSetup();
  });
})();
