(() => {
  const REFRESH_STORAGE_KEY = "gd_refresh";

  let accessToken = null;
  let refreshPromise = null;
  let isRedirectingToLogin = false;

  const state = {
    periods: [],
    schedules: [],
    subjects: [],
    sections: [],
    schoolYearSemesters: [],
    gradingTemplates: [],
    editingPeriodId: null,
    editingScheduleId: null,
    deleteContext: null,
    scheduleSearch: "",
    scheduleSchoolYearSemFilter: "",
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

  function showFeedback(message, isError = false) {
    const feedbackEl = getEl("periods-schedules-feedback");
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

  function formatTime(value) {
    if (!value) return "";
    const raw = String(value);
    return raw.length >= 5 ? raw.slice(0, 5) : raw;
  }

  function periodLabel(period) {
    const start = formatTime(period.time_start);
    const end = formatTime(period.time_end);
    if (!start || !end) return period.name;
    return `${period.name} (${start}-${end})`;
  }

  function schoolTermLabel(item) {
    return `${item.school_year_name} - ${item.semester_name}`;
  }

  function renderPeriods() {
    const listEl = getEl("periods-list");
    if (!listEl) return;

    if (!state.periods.length) {
      listEl.innerHTML = `
        <div class="setup-item">
          <div><div class="setup-sub">No periods yet.</div></div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = state.periods
      .map(item => `
        <div class="setup-item">
          <div>
            <div class="setup-label">${item.name}</div>
            <div class="setup-sub">${formatTime(item.time_start)} - ${formatTime(item.time_end)}</div>
          </div>
          <div class="setup-actions">
            <button type="button" class="icon-btn" data-action="ps-edit-period" data-id="${item.id}">Edit</button>
            <button type="button" class="icon-btn danger" data-action="ps-delete-period" data-id="${item.id}">Delete</button>
          </div>
        </div>
      `)
      .join("");
  }

  function renderSchedulesTable() {
    const tbody = getEl("schedule-table-body");
    if (!tbody) return;

    if (!state.schedules.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="setup-sub">No schedules yet.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = state.schedules
      .map(item => `
        <tr>
          <td><strong>${item.subject_code ? `${item.subject_code} - ` : ""}${item.subject_name}</strong></td>
          <td>${item.section_name}</td>
          <td>${item.school_year_name}</td>
          <td><span class="badge badge-blue">${item.semester_name}</span></td>
          <td>${item.day}</td>
          <td><span class="schedule-period-chip">${item.period_name} (${item.period_time})</span></td>
          <td class="table-actions">
            <button type="button" class="btn btn-ghost btn-xs" data-action="ps-edit-schedule" data-id="${item.id}">Edit</button>
            <button type="button" class="btn btn-danger btn-xs" data-action="ps-delete-schedule" data-id="${item.id}">Delete</button>
          </td>
        </tr>
      `)
      .join("");
  }

  function renderSchedulesMobile() {
    const listEl = getEl("schedule-mobile-list");
    if (!listEl) return;

    if (!state.schedules.length) {
      listEl.innerHTML = `
        <article class="m-card">
          <div class="setup-sub">No schedules yet.</div>
        </article>
      `;
      return;
    }

    listEl.innerHTML = state.schedules
      .map(item => `
        <article class="m-card">
          <div class="m-card-row">
            <div>
              <div class="m-card-title">${item.subject_code ? `${item.subject_code} - ` : ""}${item.subject_name}</div>
              <div class="m-card-sub">${item.section_name}</div>
            </div>
            <span class="badge badge-green">${item.day}</span>
          </div>
          <div class="m-card-meta">
            <div class="m-meta-item"><span class="m-meta-label">Year</span><span class="m-meta-value">${item.school_year_name}</span></div>
            <div class="m-meta-item"><span class="m-meta-label">Sem</span><span class="m-meta-value">${item.semester_name}</span></div>
            <div class="m-meta-item"><span class="m-meta-label">Period</span><span class="m-meta-value">${item.period_name}</span></div>
            <div class="m-meta-item"><span class="m-meta-label">Time</span><span class="m-meta-value mono">${item.period_time}</span></div>
          </div>
          <div class="m-card-actions">
            <button type="button" class="btn btn-ghost" data-action="ps-edit-schedule" data-id="${item.id}">Edit</button>
            <button type="button" class="btn btn-danger" data-action="ps-delete-schedule" data-id="${item.id}">Delete</button>
          </div>
        </article>
      `)
      .join("");
  }

  function renderScheduleFilterOptions() {
    const filter = getEl("schedule-school-year-sem-filter");
    const input = getEl("schedule-school-year-sem-input");
    if (!filter || !input) return;

    const options = state.schoolYearSemesters
      .map(item => `<option value="${item.id}">${schoolTermLabel(item)}</option>`)
      .join("");

    filter.innerHTML = `<option value="">All School Terms</option>${options}`;
    input.innerHTML = `<option value="">Select school year / semester</option>${options}`;
  }

  function renderScheduleModalOptions() {
    const subjectSelect = getEl("schedule-subject-input");
    const sectionSelect = getEl("schedule-section-input");
    const periodSelect = getEl("schedule-period-input");
    const gradingTemplateSelect = getEl("schedule-grading-template-input");

    if (subjectSelect) {
      subjectSelect.innerHTML = `
        <option value="">Select subject</option>
        ${state.subjects.map(item => `<option value="${item.id}">${item.code} - ${item.name}</option>`).join("")}
      `;
    }

    if (sectionSelect) {
      sectionSelect.innerHTML = `
        <option value="">Select section</option>
        ${state.sections.map(item => `<option value="${item.id}">${item.name}</option>`).join("")}
      `;
    }

    if (periodSelect) {
      periodSelect.innerHTML = `
        <option value="">Select period</option>
        ${state.periods.map(item => `<option value="${item.id}">${periodLabel(item)}</option>`).join("")}
      `;
    }

    if (gradingTemplateSelect) {
      if (!state.gradingTemplates.length) {
        gradingTemplateSelect.innerHTML = `
          <option value="">No active grading templates available</option>
        `;
        gradingTemplateSelect.disabled = true;
      } else {
        gradingTemplateSelect.innerHTML = `
          <option value="">Select grading template</option>
          ${state.gradingTemplates.map(item => `<option value="${item.id}">${item.name}</option>`).join("")}
        `;
        gradingTemplateSelect.disabled = false;
      }
    }
  }

  async function fetchList(url, fallbackMessage) {
    const response = await authFetch(url, { method: "GET" });
    const payload = await safeJson(response);
    if (!response.ok) {
      throw new Error(extractErrorMessage(payload, fallbackMessage));
    }
    return normalizeList(payload);
  }

  function buildSchedulesUrl() {
    const params = new URLSearchParams();
    if (state.scheduleSearch) params.set("search", state.scheduleSearch);
    if (state.scheduleSchoolYearSemFilter) {
      params.set("school_year_sem", state.scheduleSchoolYearSemFilter);
    }
    const query = params.toString();
    return query ? `/api/schedules/?${query}` : "/api/schedules/";
  }

  async function loadReferenceLists() {
    const [subjects, sections, schoolYearSemesters, gradingTemplates] = await Promise.all([
      fetchList("/api/subjects/", "Failed to load subjects."),
      fetchList("/api/sections/", "Failed to load sections."),
      fetchList("/api/school-year-semesters/", "Failed to load school year semesters."),
      fetchList("/api/grading-templates/?is_active=true", "Failed to load grading templates."),
    ]);
    state.subjects = subjects;
    state.sections = sections;
    state.schoolYearSemesters = schoolYearSemesters;
    state.gradingTemplates = gradingTemplates;
    renderScheduleFilterOptions();
    renderScheduleModalOptions();
  }

  async function loadPeriodsList() {
    const listEl = getEl("periods-list");
    if (listEl) {
      listEl.innerHTML = `
        <div class="setup-item">
          <div><div class="setup-sub">Loading periods...</div></div>
        </div>
      `;
    }

    state.periods = await fetchList("/api/periods/", "Failed to load periods.");
    renderPeriods();
    renderScheduleModalOptions();
  }

  async function loadSchedulesList() {
    const table = getEl("schedule-table-body");
    const mobile = getEl("schedule-mobile-list");
    if (table) {
      table.innerHTML = `
        <tr><td colspan="7" class="setup-sub">Loading schedules...</td></tr>
      `;
    }
    if (mobile) {
      mobile.innerHTML = `
        <article class="m-card"><div class="setup-sub">Loading schedules...</div></article>
      `;
    }

    state.schedules = await fetchList(buildSchedulesUrl(), "Failed to load schedules.");
    renderSchedulesTable();
    renderSchedulesMobile();
  }

  async function reloadPeriodsAndSchedules() {
    await Promise.all([loadPeriodsList(), loadSchedulesList()]);
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

  function resetPeriodModal() {
    state.editingPeriodId = null;
    getEl("period-modal-title").textContent = "Add Period";
    getEl("period-slot-name-input").value = "";
    getEl("period-slot-start-input").value = "";
    getEl("period-slot-end-input").value = "";
    showModalError("period-slot-modal-error", "");
  }

  function resetScheduleModal() {
    state.editingScheduleId = null;
    getEl("schedule-modal-title").textContent = "Add Schedule";
    getEl("schedule-subject-input").value = "";
    getEl("schedule-section-input").value = "";
    getEl("schedule-school-year-sem-input").value = "";
    getEl("schedule-day-input").value = "";
    getEl("schedule-period-input").value = "";
    if (getEl("schedule-grading-template-input")) {
      getEl("schedule-grading-template-input").value = "";
    }
    showModalError("schedule-modal-error", "");
  }

  function closePeriodModal() {
    closeModal("modal-period-manage");
  }

  function closeScheduleModal() {
    closeModal("modal-schedule-manage");
  }

  function closeDeleteModal() {
    closeModal("modal-period-schedule-delete");
    state.deleteContext = null;
    showModalError("period-schedule-delete-error", "");
  }

  async function openPeriodCreate() {
    resetPeriodModal();
    openModal("modal-period-manage");
  }

  async function openPeriodEdit(id) {
    resetPeriodModal();
    const period = state.periods.find(item => item.id === id);
    if (!period) return;
    state.editingPeriodId = id;
    getEl("period-modal-title").textContent = "Edit Period";
    getEl("period-slot-name-input").value = period.name || "";
    getEl("period-slot-start-input").value = formatTime(period.time_start);
    getEl("period-slot-end-input").value = formatTime(period.time_end);
    openModal("modal-period-manage");
  }

  async function openScheduleCreate() {
    resetScheduleModal();
    await loadReferenceLists();
    await loadPeriodsList();
    const defaultTemplate = state.gradingTemplates.find(item => item.is_default && item.is_active);
    if (defaultTemplate && getEl("schedule-grading-template-input")) {
      getEl("schedule-grading-template-input").value = String(defaultTemplate.id);
    }
    if (!state.gradingTemplates.length) {
      showModalError(
        "schedule-modal-error",
        "No active grading templates available. Create one in Settings first."
      );
    }
    openModal("modal-schedule-manage");
  }

  async function openScheduleEdit(id) {
    resetScheduleModal();
    await loadReferenceLists();
    await loadPeriodsList();

    const schedule = state.schedules.find(item => item.id === id);
    if (!schedule) return;

    state.editingScheduleId = id;
    getEl("schedule-modal-title").textContent = "Edit Schedule";
    getEl("schedule-subject-input").value = schedule.subject || "";
    getEl("schedule-section-input").value = schedule.section || "";
    getEl("schedule-school-year-sem-input").value = schedule.school_year_sem || "";
    getEl("schedule-day-input").value = schedule.day || "";
    getEl("schedule-period-input").value = schedule.period || "";
    if (getEl("schedule-grading-template-input")) {
      getEl("schedule-grading-template-input").value = schedule.grading_template || "";
    }
    if (!state.gradingTemplates.length) {
      showModalError(
        "schedule-modal-error",
        "No active grading templates available. Create one in Settings first."
      );
    }
    openModal("modal-schedule-manage");
  }

  function openDeleteConfirm(context) {
    state.deleteContext = context;
    getEl("period-schedule-delete-message").textContent = context.message;
    showModalError("period-schedule-delete-error", "");
    openModal("modal-period-schedule-delete");
  }

  async function savePeriod() {
    const name = String(getEl("period-slot-name-input").value || "").trim();
    const timeStart = String(getEl("period-slot-start-input").value || "").trim();
    const timeEnd = String(getEl("period-slot-end-input").value || "").trim();

    if (!name) {
      showModalError("period-slot-modal-error", "Period name is required.");
      return;
    }
    if (!timeStart) {
      showModalError("period-slot-modal-error", "time_start is required.");
      return;
    }
    if (!timeEnd) {
      showModalError("period-slot-modal-error", "time_end is required.");
      return;
    }
    if (timeEnd <= timeStart) {
      showModalError("period-slot-modal-error", "End time must be after start time.");
      return;
    }

    const payload = {
      name,
      time_start: timeStart,
      time_end: timeEnd,
    };
    const isEditing = !!state.editingPeriodId;
    const url = isEditing ? `/api/periods/${state.editingPeriodId}/` : "/api/periods/";
    const method = isEditing ? "PATCH" : "POST";

    try {
      await sendJson(url, method, payload, "Failed to save period.");
      closePeriodModal();
      await reloadPeriodsAndSchedules();
      showFeedback("Period saved.");
    } catch (err) {
      showModalError("period-slot-modal-error", err.message || "Failed to save period.");
    }
  }

  async function saveSchedule() {
    const subject = Number(getEl("schedule-subject-input").value);
    const section = Number(getEl("schedule-section-input").value);
    const schoolYearSem = Number(getEl("schedule-school-year-sem-input").value);
    const day = String(getEl("schedule-day-input").value || "").trim();
    const period = Number(getEl("schedule-period-input").value);
    const gradingTemplateValue = String(
      (getEl("schedule-grading-template-input") || {}).value || ""
    ).trim();

    if (!subject) {
      showModalError("schedule-modal-error", "Please select a subject.");
      return;
    }
    if (!section) {
      showModalError("schedule-modal-error", "Please select a section.");
      return;
    }
    if (!schoolYearSem) {
      showModalError("schedule-modal-error", "Please select a school year semester.");
      return;
    }
    if (!day) {
      showModalError("schedule-modal-error", "Please select a day.");
      return;
    }
    if (!period) {
      showModalError("schedule-modal-error", "Please select a period.");
      return;
    }
    if (!gradingTemplateValue) {
      showModalError("schedule-modal-error", "Please select an active grading template.");
      return;
    }

    const payload = {
      subject,
      section,
      school_year_sem: schoolYearSem,
      day,
      period,
      grading_template: Number(gradingTemplateValue),
    };

    const isEditing = !!state.editingScheduleId;
    const url = isEditing ? `/api/schedules/${state.editingScheduleId}/` : "/api/schedules/";
    const method = isEditing ? "PATCH" : "POST";

    try {
      await sendJson(url, method, payload, "Failed to save schedule.");
      closeScheduleModal();
      await loadSchedulesList();
      showFeedback("Schedule saved.");
    } catch (err) {
      showModalError("schedule-modal-error", err.message || "Failed to save schedule.");
    }
  }

  async function confirmDelete() {
    if (!state.deleteContext) return;

    const response = await authFetch(state.deleteContext.url, { method: "DELETE" });
    if (response.status === 204) {
      closeDeleteModal();
      await reloadPeriodsAndSchedules();
      showFeedback(state.deleteContext.successMessage);
      return;
    }

    const payload = await safeJson(response);
    showModalError(
      "period-schedule-delete-error",
      extractErrorMessage(payload, "Failed to delete item.")
    );
  }

  function handleAction(actionEl) {
    const action = actionEl.dataset.action;
    const id = Number(actionEl.dataset.id || "0");

    if (action === "ps-open-period-create") openPeriodCreate();
    if (action === "ps-open-schedule-create") openScheduleCreate();
    if (action === "ps-close-period-modal") closePeriodModal();
    if (action === "ps-close-schedule-modal") closeScheduleModal();
    if (action === "ps-close-delete-modal") closeDeleteModal();
    if (action === "ps-edit-period") openPeriodEdit(id);
    if (action === "ps-edit-schedule") openScheduleEdit(id);
    if (action === "ps-save-period") savePeriod();
    if (action === "ps-save-schedule") saveSchedule();
    if (action === "ps-confirm-delete") confirmDelete();

    if (action === "ps-delete-period") {
      const period = state.periods.find(item => item.id === id);
      openDeleteConfirm({
        url: `/api/periods/${id}/`,
        message: `Delete ${period ? period.name : "this period"}?`,
        successMessage: "Period deleted.",
      });
    }

    if (action === "ps-delete-schedule") {
      const schedule = state.schedules.find(item => item.id === id);
      openDeleteConfirm({
        url: `/api/schedules/${id}/`,
        message: `Delete schedule for ${schedule ? schedule.subject_name : "this item"}?`,
        successMessage: "Schedule deleted.",
      });
    }
  }

  function setupFilters() {
    const searchInput = getEl("schedule-search-input");
    const schoolYearSemFilter = getEl("schedule-school-year-sem-filter");
    if (!searchInput || !schoolYearSemFilter) return;

    searchInput.addEventListener("input", () => {
      state.scheduleSearch = String(searchInput.value || "").trim();
      window.clearTimeout(setupFilters._searchTimeoutId);
      setupFilters._searchTimeoutId = window.setTimeout(() => {
        loadSchedulesList().catch(err => {
          showFeedback(err.message || "Failed to load schedules.", true);
        });
      }, 220);
    });

    schoolYearSemFilter.addEventListener("change", () => {
      state.scheduleSchoolYearSemFilter = String(schoolYearSemFilter.value || "");
      loadSchedulesList().catch(err => {
        showFeedback(err.message || "Failed to load schedules.", true);
      });
    });
  }

  async function initPeriodsSchedules() {
    const page = getEl("page-schedules");
    if (!page) return;

    document.addEventListener("click", event => {
      const actionEl = event.target.closest("[data-action]");
      if (!actionEl) return;
      if (!String(actionEl.dataset.action || "").startsWith("ps-")) return;
      handleAction(actionEl);
    });

    setupFilters();

    try {
      await loadReferenceLists();
      await reloadPeriodsAndSchedules();
    } catch (err) {
      showFeedback(err.message || "Failed to load periods and schedules.", true);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initPeriodsSchedules();
  });
})();
