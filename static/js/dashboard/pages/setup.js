(() => {
  const REFRESH_STORAGE_KEY = "gd_refresh";

  let accessToken = null;
  let refreshPromise = null;

  const state = {
    schoolYears: [],
    semesters: [],
    schoolYearSemesters: [],
    gradePeriods: [],
    editingSchoolYearId: null,
    editingSemesterId: null,
    editingGradePeriodId: null,
    deleteContext: null,
  };

  function getEl(id) {
    return document.getElementById(id);
  }

  function hardRedirectLogin() {
    window.location.replace("/login.html");
  }

  function getRefreshToken() {
    return localStorage.getItem(REFRESH_STORAGE_KEY);
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
          localStorage.setItem(REFRESH_STORAGE_KEY, data.refresh);
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

  function getActiveSchoolYearId() {
    const active = state.schoolYears.find(item => item.is_active);
    if (active) return active.id;
    return state.schoolYears[0] ? state.schoolYears[0].id : null;
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

  function renderSemesters() {
    const listEl = getEl("setup-semesters-list");
    if (!listEl) return;

    if (!state.semesters.length) {
      listEl.innerHTML = `
        <div class="setup-item">
          <div><div class="setup-sub">No semesters yet.</div></div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = state.semesters
      .map(item => {
        const statusClass = item.is_active ? "badge-green" : "badge-gray";
        const statusText = item.is_active ? "Active" : "Inactive";
        const subText = item.active_school_year_name
          ? `Linked to ${item.active_school_year_name}`
          : "Not active";
        return `
          <div class="setup-item">
            <div>
              <div class="setup-label">${item.name}</div>
              <div class="setup-sub">${subText}</div>
            </div>
            <div class="setup-actions">
              <span class="badge ${statusClass} setup-status">${statusText}</span>
              <button type="button" class="icon-btn" data-action="setup-set-semester-active" data-id="${item.id}">Set Active</button>
              <button type="button" class="icon-btn" data-action="setup-edit-semester" data-id="${item.id}">Edit</button>
              <button type="button" class="icon-btn danger" data-action="setup-delete-semester" data-id="${item.id}">Delete</button>
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
        return `
          <div class="${rowClass}">
            <div>
              <div class="setup-label">${item.name}</div>
              <div class="setup-sub">Order ${item.position}</div>
            </div>
            <div class="setup-actions">
              <span class="weight-chip">${weight.toFixed(2)}%</span>
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

  function populateSetupSelects() {
    const yearActiveSemesterSelect = getEl("setup-year-active-semester");
    const semesterYearSelect = getEl("setup-semester-school-year");

    if (yearActiveSemesterSelect) {
      yearActiveSemesterSelect.innerHTML = `
        <option value="">Auto-select first semester</option>
        ${state.semesters
          .map(sem => `<option value="${sem.id}">${sem.name}</option>`)
          .join("")}
      `;
    }

    if (semesterYearSelect) {
      semesterYearSelect.innerHTML = `
        <option value="">Use active/default school year</option>
        ${state.schoolYears
          .map(year => `<option value="${year.id}">${year.name}</option>`)
          .join("")}
      `;
    }
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
    const [schoolYears, semesters, schoolYearSemesters, gradePeriods] = await Promise.all([
      fetchSetupList("/api/school-years/", "Failed to load school years."),
      fetchSetupList("/api/semesters/", "Failed to load semesters."),
      fetchSetupList("/api/school-year-semesters/", "Failed to load school year semesters."),
      fetchSetupList("/api/grade-periods/", "Failed to load grade periods."),
    ]);

    state.schoolYears = schoolYears;
    state.semesters = semesters;
    state.schoolYearSemesters = schoolYearSemesters;
    state.gradePeriods = gradePeriods;

    renderSchoolYears();
    renderSemesters();
    renderGradePeriods();
    populateSetupSelects();
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
    if (getEl("setup-year-active-semester")) getEl("setup-year-active-semester").value = "";
  }

  function resetSemesterModal() {
    state.editingSemesterId = null;
    showModalError("setup-semester-error", "");
    getEl("setup-semester-modal-title").textContent = "Add Semester";
    getEl("setup-semester-name").value = "";
    getEl("setup-semester-set-active").checked = false;
    if (getEl("setup-semester-school-year")) getEl("setup-semester-school-year").value = "";
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

  function openSemesterCreate() {
    resetSemesterModal();
    openModal("modal-setup-semester");
  }

  function openSemesterEdit(id) {
    resetSemesterModal();
    const item = state.semesters.find(semester => semester.id === id);
    if (!item) return;

    state.editingSemesterId = id;
    getEl("setup-semester-modal-title").textContent = "Edit Semester";
    getEl("setup-semester-name").value = item.name || "";
    getEl("setup-semester-set-active").checked = !!item.is_active;
    if (item.active_school_year_id) {
      getEl("setup-semester-school-year").value = String(item.active_school_year_id);
    }
    openModal("modal-setup-semester");
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
    getEl("setup-period-weight").value = item.weight || "";
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
    const yearStart = Number(getEl("setup-year-start").value);
    const yearEnd = Number(getEl("setup-year-end").value);
    const setActive = getEl("setup-year-set-active").checked;
    const activeSemesterIdValue = getEl("setup-year-active-semester").value;

    if (!yearStart || !yearEnd) {
      showModalError("setup-year-error", "Year start and year end are required.");
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
    if (activeSemesterIdValue) {
      payload.active_semester_id = Number(activeSemesterIdValue);
    }

    const isEditing = !!state.editingSchoolYearId;
    const url = isEditing
      ? `/api/school-years/${state.editingSchoolYearId}/`
      : "/api/school-years/";
    const method = isEditing ? "PATCH" : "POST";

    try {
      await sendJson(url, method, payload, "Failed to save school year.");
      closeModal("modal-setup-school-year");
      await reloadSetupLists();
      showSetupFeedback("School year saved.");
    } catch (err) {
      showModalError("setup-year-error", err.message || "Failed to save school year.");
    }
  }

  async function saveSemester() {
    const name = String(getEl("setup-semester-name").value || "").trim();
    const setActive = getEl("setup-semester-set-active").checked;
    const schoolYearId = getEl("setup-semester-school-year").value;

    if (!name) {
      showModalError("setup-semester-error", "Semester name is required.");
      return;
    }

    const payload = {
      name,
      set_active: setActive,
    };
    if (schoolYearId) {
      payload.school_year_id = Number(schoolYearId);
    }

    const isEditing = !!state.editingSemesterId;
    const url = isEditing
      ? `/api/semesters/${state.editingSemesterId}/`
      : "/api/semesters/";
    const method = isEditing ? "PATCH" : "POST";

    try {
      await sendJson(url, method, payload, "Failed to save semester.");
      closeModal("modal-setup-semester");
      await reloadSetupLists();
      showSetupFeedback("Semester saved.");
    } catch (err) {
      showModalError("setup-semester-error", err.message || "Failed to save semester.");
    }
  }

  async function saveGradePeriod() {
    const name = String(getEl("setup-period-name").value || "").trim();
    const position = Number(getEl("setup-period-position").value);
    const weight = Number(getEl("setup-period-weight").value);
    const isActive = getEl("setup-period-active").checked;

    if (!name) {
      showModalError("setup-grade-period-error", "Grade period name is required.");
      return;
    }
    if (!position || position < 1 || position > 4) {
      showModalError("setup-grade-period-error", "Order must be between 1 and 4.");
      return;
    }
    if (Number.isNaN(weight) || weight < 0) {
      showModalError("setup-grade-period-error", "Weight must be 0 or higher.");
      return;
    }

    const payload = {
      name,
      position,
      weight,
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
      showSetupFeedback("School year activated.");
    } catch (err) {
      showSetupFeedback(err.message || "Failed to activate school year.", true);
    }
  }

  async function quickSetSemesterActive(id) {
    const activeSchoolYearId = getActiveSchoolYearId();
    const payload = { set_active: true };
    if (activeSchoolYearId) payload.school_year_id = activeSchoolYearId;

    try {
      await sendJson(
        `/api/semesters/${id}/`,
        "PATCH",
        payload,
        "Failed to activate semester."
      );
      await reloadSetupLists();
      showSetupFeedback("Semester activated.");
    } catch (err) {
      showSetupFeedback(err.message || "Failed to activate semester.", true);
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
    if (action === "setup-open-semester-create") openSemesterCreate();
    if (action === "setup-open-period-create") openGradePeriodCreate();

    if (action === "setup-edit-year") openSchoolYearEdit(id);
    if (action === "setup-edit-semester") openSemesterEdit(id);
    if (action === "setup-edit-period") openGradePeriodEdit(id);

    if (action === "setup-set-year-active") quickSetSchoolYearActive(id);
    if (action === "setup-set-semester-active") quickSetSemesterActive(id);

    if (action === "setup-delete-year") {
      openDeleteConfirm("Delete this school year?", {
        url: `/api/school-years/${id}/`,
        successMessage: "School year deleted.",
      });
    }
    if (action === "setup-delete-semester") {
      openDeleteConfirm("Delete this semester?", {
        url: `/api/semesters/${id}/`,
        successMessage: "Semester deleted.",
      });
    }
    if (action === "setup-delete-period") {
      openDeleteConfirm("Delete this grade period?", {
        url: `/api/grade-periods/${id}/`,
        successMessage: "Grade period deleted.",
      });
    }

    if (action === "setup-save-school-year") saveSchoolYear();
    if (action === "setup-save-semester") saveSemester();
    if (action === "setup-save-grade-period") saveGradePeriod();
    if (action === "setup-confirm-delete") confirmDelete();
  }

  async function initSetupPage() {
    const page = getEl("page-setup");
    if (!page) return;

    document.addEventListener("click", event => {
      const actionEl = event.target.closest("[data-action]");
      if (!actionEl) return;
      if (!String(actionEl.dataset.action || "").startsWith("setup-")) return;
      handleSetupAction(actionEl);
    });

    try {
      await reloadSetupLists();
    } catch (err) {
      showSetupFeedback(err.message || "Failed to load setup data.", true);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initSetupPage();
  });
})();
