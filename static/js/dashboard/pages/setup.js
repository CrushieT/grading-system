(() => {
  const REFRESH_STORAGE_KEY = "gd_refresh";
  const events = window.EduTrackEvents || null;

  let accessToken = null;
  let refreshPromise = null;
  let isRedirectingToLogin = false;

  const state = {
    schoolYears: [],
    gradePeriods: [],
    editingSchoolYearId: null,
    editingGradePeriodId: null,
    deleteContext: null,
  };
  const GRADE_PERIOD_NAME_MAX_LENGTH = 25;

  function getEl(id) {
    return document.getElementById(id);
  }

  function emitSchoolSetupChanged() {
    if (!events) return;
    events.invalidate("schoolYearSemesters");
    events.invalidate("gradePeriods");
    events.emit("school-setup:changed");
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
    if (token) {
      requestOptions.headers.Authorization = `Bearer ${token}`;
    }

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

  function showSetupFeedback(message, isError = false) {
    const feedbackEl = getEl("setup-feedback");
    if (!feedbackEl) return;
    feedbackEl.textContent = message;
    feedbackEl.hidden = false;
    feedbackEl.classList.toggle("error", isError);

    window.clearTimeout(showSetupFeedback._timeoutId);
    showSetupFeedback._timeoutId = window.setTimeout(() => {
      feedbackEl.hidden = true;
    }, 3200);
  }

  function showModalError(id, message) {
    const errorEl = getEl(id);
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = !message;
  }

  function closeModal(modalId) {
    const modal = getEl(modalId);
    if (modal) modal.hidden = true;
  }

  function openModal(modalId) {
    const modal = getEl(modalId);
    if (modal) modal.hidden = false;
  }

  function parseSchoolYearRange(name) {
    const match = String(name || "").match(/^\s*(\d{4})\s*-\s*(\d{4})\s*$/);
    if (!match) return null;
    return {
      year_start: Number(match[1]),
      year_end: Number(match[2]),
    };
  }

  function normalizeSchoolYearInput(value) {
    return String(value || "")
      .replace(/\D/g, "")
      .slice(0, 4);
  }

  function normalizeGradePeriodNameInput(value) {
    return String(value || "").slice(0, GRADE_PERIOD_NAME_MAX_LENGTH);
  }

  function normalizeWeightInput(value) {
    let next = String(value || "").replace(/[^\d.]/g, "");
    const parts = next.split(".");
    const whole = (parts.shift() || "").slice(0, 2);
    const decimal = parts.join("").slice(0, 2);
    if (!next.includes(".")) return whole;
    return `${whole || "0"}.${decimal}`;
  }

  function formatWeightInputValue(value) {
    const normalized = normalizeWeightInput(value);
    if (!normalized) return "";
    const numeric = Number(normalized);
    if (!Number.isFinite(numeric)) return "";
    return numeric.toFixed(2);
  }

  function renderSchoolYears() {
    const listEl = getEl("setup-school-years-list");
    if (!listEl) return;

    if (!state.schoolYears.length) {
      listEl.innerHTML = `
        <div class="setup-item">
          <div><div class="setup-sub">No school years yet.</div></div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = state.schoolYears
      .map(item => {
        const statusClass = item.is_active ? "badge-green" : "badge-gray";
        const statusText = item.is_active ? "Active" : "Inactive";
        const subText = item.is_active ? "Current" : "Not active";
        return `
          <div class="setup-item">
            <div>
              <div class="setup-label">${item.name}</div>
              <div class="setup-sub">${subText}</div>
            </div>
            <div class="setup-actions">
              <span class="badge ${statusClass} setup-status">${statusText}</span>
              <button type="button" class="icon-btn" data-action="setup-set-year-active" data-id="${item.id}">Set Active</button>
              <button type="button" class="icon-btn" data-action="setup-edit-year" data-id="${item.id}">Edit</button>
              <button type="button" class="icon-btn danger" data-action="setup-delete-year" data-id="${item.id}">Delete</button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderGradePeriods() {
    const listEl = getEl("setup-grade-periods-list");
    const totalEl = getEl("setup-period-weight-total");
    if (!listEl || !totalEl) return;

    const periods = [...state.gradePeriods].sort((a, b) => {
      if (a.position === b.position) return a.id - b.id;
      return a.position - b.position;
    });

    if (!periods.length) {
      listEl.innerHTML = `
        <div class="period-row no-border">
          <div><div class="setup-sub">No grade periods yet.</div></div>
        </div>
      `;
      totalEl.textContent = "0%";
      totalEl.classList.remove("value-red");
      totalEl.classList.add("value-green");
      return;
    }

    let runningTotal = 0;
    listEl.innerHTML = periods
      .map((item, index) => {
        const rowClass = index === periods.length - 1 ? "period-row no-border" : "period-row";
        const weight = Number(item.weight || 0);
        runningTotal += weight;
        const statusClass = item.is_active ? "badge-green" : "badge-gray";
        const statusText = item.is_active ? "Current" : "Inactive";
        return `
          <div class="${rowClass}">
            <div>
              <div class="setup-label">${item.name}</div>
              <div class="setup-sub">Order ${item.position}</div>
            </div>
            <div class="setup-actions">
              <span class="badge ${statusClass} setup-status">${statusText}</span>
              <span class="weight-chip">${weight.toFixed(2)}%</span>
              <button type="button" class="icon-btn" data-action="setup-set-period-active" data-id="${item.id}">Set Active</button>
              <button type="button" class="icon-btn" data-action="setup-edit-period" data-id="${item.id}">Edit</button>
              <button type="button" class="icon-btn danger" data-action="setup-delete-period" data-id="${item.id}">Delete</button>
            </div>
          </div>
        `;
      })
      .join("");

    totalEl.textContent = `${runningTotal.toFixed(2)}%`;
    totalEl.classList.toggle("value-red", runningTotal > 100);
    totalEl.classList.toggle("value-green", runningTotal <= 100);
  }

  async function fetchSetupList(url, failureMessage) {
    const response = await authFetch(url, { method: "GET" });
    const payload = await safeJson(response);
    if (!response.ok) {
      throw new Error(extractErrorMessage(payload, failureMessage));
    }
    return normalizeList(payload);
  }

  async function reloadSetupLists() {
    const [schoolYears, gradePeriods] = await Promise.all([
      fetchSetupList("/api/school-years/", "Failed to load school years."),
      fetchSetupList("/api/grade-periods/", "Failed to load grade periods."),
    ]);

    state.schoolYears = schoolYears;
    state.gradePeriods = gradePeriods;

    renderSchoolYears();
    renderGradePeriods();
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

  function resetYearModal() {
    state.editingSchoolYearId = null;
    showModalError("setup-year-error", "");
    getEl("setup-school-year-modal-title").textContent = "Add School Year";
    getEl("setup-year-start").value = "";
    getEl("setup-year-end").value = "";
    getEl("setup-year-set-active").checked = false;
  }

  function resetGradePeriodModal() {
    state.editingGradePeriodId = null;
    showModalError("setup-grade-period-error", "");
    getEl("setup-grade-period-modal-title").textContent = "Add Grade Period";
    getEl("setup-period-name").value = "";
    getEl("setup-period-position").value = "";
    getEl("setup-period-weight").value = "";
    getEl("setup-period-active").checked = true;
  }

  function openSchoolYearCreate() {
    resetYearModal();
    openModal("modal-setup-school-year");
  }

  function openSchoolYearEdit(id) {
    resetYearModal();
    const item = state.schoolYears.find(year => year.id === id);
    if (!item) return;

    state.editingSchoolYearId = id;
    getEl("setup-school-year-modal-title").textContent = "Edit School Year";
    const parsed = parseSchoolYearRange(item.name);
    if (parsed) {
      getEl("setup-year-start").value = parsed.year_start;
      getEl("setup-year-end").value = parsed.year_end;
    } else {
      getEl("setup-year-start").value = item.year_start || "";
      getEl("setup-year-end").value = item.year_end || "";
    }
    getEl("setup-year-set-active").checked = !!item.is_active;
    openModal("modal-setup-school-year");
  }

  function openGradePeriodCreate() {
    resetGradePeriodModal();
    openModal("modal-setup-grade-period");
  }

  function openGradePeriodEdit(id) {
    resetGradePeriodModal();
    const item = state.gradePeriods.find(period => period.id === id);
    if (!item) return;

    state.editingGradePeriodId = id;
    getEl("setup-grade-period-modal-title").textContent = "Edit Grade Period";
    getEl("setup-period-name").value = item.name || "";
    getEl("setup-period-position").value = item.position || "";
    getEl("setup-period-weight").value = item.weight != null ? Number(item.weight).toFixed(2) : "";
    getEl("setup-period-active").checked = !!item.is_active;
    openModal("modal-setup-grade-period");
  }

  function openDeleteConfirm(message, context) {
    state.deleteContext = context;
    getEl("setup-delete-message").textContent = message;
    showModalError("setup-delete-error", "");
    openModal("modal-setup-confirm-delete");
  }

  async function saveSchoolYear() {
    const yearStartRaw = String(getEl("setup-year-start").value || "").trim();
    const yearEndRaw = String(getEl("setup-year-end").value || "").trim();
    const yearStart = Number(yearStartRaw);
    const yearEnd = Number(yearEndRaw);
    const setActive = getEl("setup-year-set-active").checked;

    if (!/^\d{4}$/.test(yearStartRaw) || !/^\d{4}$/.test(yearEndRaw)) {
      showModalError("setup-year-error", "Year start and year end must be 4-digit values.");
      return;
    }
    if (yearEnd <= yearStart) {
      showModalError("setup-year-error", "Year end must be greater than year start.");
      return;
    }

    const payload = {
      year_start: yearStart,
      year_end: yearEnd,
      set_active: setActive,
    };

    const isEditing = !!state.editingSchoolYearId;
    const url = isEditing
      ? `/api/school-years/${state.editingSchoolYearId}/`
      : "/api/school-years/";
    const method = isEditing ? "PATCH" : "POST";

    try {
      await sendJson(url, method, payload, "Failed to save school year.");
      closeModal("modal-setup-school-year");
      await reloadSetupLists();
      emitSchoolSetupChanged();
      showSetupFeedback("School year saved.");
    } catch (err) {
      showModalError("setup-year-error", err.message || "Failed to save school year.");
    }
  }

  async function saveGradePeriod() {
    const nameInput = getEl("setup-period-name");
    const name = normalizeGradePeriodNameInput(String(nameInput?.value || "").trim());
    if (nameInput) nameInput.value = name;
    const position = Number(getEl("setup-period-position").value);
    const weightRaw = String(getEl("setup-period-weight").value || "").trim();
    const weight = Number(weightRaw);
    const isActive = getEl("setup-period-active").checked;

    if (!name) {
      showModalError("setup-grade-period-error", "Grade period name is required.");
      return;
    }
    if (name.length > GRADE_PERIOD_NAME_MAX_LENGTH) {
      showModalError("setup-grade-period-error", "Grade period name must be at most 25 characters.");
      return;
    }
    if (!position || position < 1 || position > 4) {
      showModalError("setup-grade-period-error", "Order must be between 1 and 4.");
      return;
    }
    if (!/^\d{1,2}(\.\d{1,2})?$/.test(weightRaw)) {
      showModalError("setup-grade-period-error", "Weight must be in 00.00 format.");
      return;
    }

    const payload = {
      name,
      position,
      weight: Number(weight.toFixed(2)),
      is_active: isActive,
    };

    const isEditing = !!state.editingGradePeriodId;
    const url = isEditing
      ? `/api/grade-periods/${state.editingGradePeriodId}/`
      : "/api/grade-periods/";
    const method = isEditing ? "PATCH" : "POST";

    try {
      await sendJson(url, method, payload, "Failed to save grade period.");
      closeModal("modal-setup-grade-period");
      await reloadSetupLists();
      emitSchoolSetupChanged();
      showSetupFeedback("Grade period saved.");
    } catch (err) {
      showModalError("setup-grade-period-error", err.message || "Failed to save grade period.");
    }
  }

  async function quickSetSchoolYearActive(id) {
    try {
      await sendJson(
        `/api/school-years/${id}/`,
        "PATCH",
        { set_active: true },
        "Failed to activate school year."
      );
      await reloadSetupLists();
      emitSchoolSetupChanged();
      showSetupFeedback("School year activated.");
    } catch (err) {
      showSetupFeedback(err.message || "Failed to activate school year.", true);
    }
  }

  async function quickSetGradePeriodActive(id) {
    try {
      await sendJson(
        `/api/grade-periods/${id}/`,
        "PATCH",
        { is_active: true },
        "Failed to activate grade period."
      );
      await reloadSetupLists();
      emitSchoolSetupChanged();
      showSetupFeedback("Grade period activated.");
    } catch (err) {
      showSetupFeedback(err.message || "Failed to activate grade period.", true);
    }
  }

  async function confirmDelete() {
    if (!state.deleteContext) return;

    const { url, successMessage } = state.deleteContext;
    const response = await authFetch(url, { method: "DELETE" });
    if (response.status === 204) {
      closeModal("modal-setup-confirm-delete");
      state.deleteContext = null;
      await reloadSetupLists();
      emitSchoolSetupChanged();
      showSetupFeedback(successMessage);
      return;
    }

    const payload = await safeJson(response);
    showModalError(
      "setup-delete-error",
      extractErrorMessage(payload, "Failed to delete item.")
    );
  }

  function handleSetupAction(actionEl) {
    const action = actionEl.dataset.action;
    const id = Number(actionEl.dataset.id || "0");

    if (action === "setup-open-year-create") openSchoolYearCreate();
    if (action === "setup-open-period-create") openGradePeriodCreate();

    if (action === "setup-edit-year") openSchoolYearEdit(id);
    if (action === "setup-edit-period") openGradePeriodEdit(id);

    if (action === "setup-set-year-active") quickSetSchoolYearActive(id);
    if (action === "setup-set-period-active") quickSetGradePeriodActive(id);

    if (action === "setup-delete-year") {
      openDeleteConfirm("Delete this school year?", {
        url: `/api/school-years/${id}/`,
        successMessage: "School year deleted.",
      });
    }
    if (action === "setup-delete-period") {
      openDeleteConfirm("Delete this grade period?", {
        url: `/api/grade-periods/${id}/`,
        successMessage: "Grade period deleted.",
      });
    }

    if (action === "setup-save-school-year") saveSchoolYear();
    if (action === "setup-save-grade-period") saveGradePeriod();
    if (action === "setup-confirm-delete") confirmDelete();
  }

  async function initSetupPage() {
    const page = getEl("page-setup");
    if (!page) return;

    ["setup-year-start", "setup-year-end"].forEach(inputId => {
      const el = getEl(inputId);
      if (!el) return;
      el.addEventListener("input", () => {
        const next = normalizeSchoolYearInput(el.value);
        if (el.value !== next) el.value = next;
      });
    });

    const weightInput = getEl("setup-period-weight");
    if (weightInput) {
      weightInput.addEventListener("input", () => {
        const next = normalizeWeightInput(weightInput.value);
        if (weightInput.value !== next) weightInput.value = next;
      });
      weightInput.addEventListener("blur", () => {
        const next = formatWeightInputValue(weightInput.value);
        if (weightInput.value !== next) weightInput.value = next;
      });
    }

    const periodNameInput = getEl("setup-period-name");
    if (periodNameInput) {
      periodNameInput.addEventListener("input", () => {
        const next = normalizeGradePeriodNameInput(periodNameInput.value);
        if (periodNameInput.value !== next) periodNameInput.value = next;
      });
    }

    document.addEventListener("click", event => {
      const actionEl = event.target.closest("[data-action]");
      if (!actionEl) return;
      if (!String(actionEl.dataset.action || "").startsWith("setup-")) return;
      handleSetupAction(actionEl);
    });

    try {
      await reloadSetupLists();
      window.EduTrackModules = window.EduTrackModules || {};
      window.EduTrackModules.setup = {
        refreshAll: reloadSetupLists,
      };
    } catch (err) {
      showSetupFeedback(err.message || "Failed to load setup data.", true);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initSetupPage();
  });
})();
