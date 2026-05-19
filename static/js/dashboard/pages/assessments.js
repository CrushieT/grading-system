(() => {
  const REFRESH_STORAGE_KEY = "gd_refresh";

  let accessToken = null;
  let refreshPromise = null;
  let isRedirectingToLogin = false;

  const state = {
    schedules: [],
    gradePeriods: [],
    assessments: [],
    componentsBySchedule: {},
    scoreAssessmentId: null,
    editingAssessmentId: null,
    deleteAssessmentId: null,
    filters: {
      schedule: "",
      gradePeriod: "",
      search: "",
    },
  };
  const SCORE_AVATAR_COLORS = [
    "avatar-blue",
    "avatar-green",
    "avatar-amber",
    "avatar-red",
    "avatar-gray",
  ];

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

    for (const [, value] of Object.entries(payload)) {
      if (Array.isArray(value) && value.length) return String(value[0]);
      if (typeof value === "string") return value;
    }
    return fallbackMessage;
  }

  function showFeedback(message, isError = false) {
    const feedbackEl = getEl("assessments-feedback");
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

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function formatWeight(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "-";
    return `${num.toFixed(2).replace(/\.00$/, "")}%`;
  }

  function formatNumber(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "--";
    return num.toFixed(2).replace(/\.00$/, "");
  }

  function scheduleLabel(item) {
    const subject = item.subject_code ? `${item.subject_code} - ${item.subject_name}` : item.subject_name;
    const section = item.section_name || "-";
    const day = item.day || "-";
    return `${subject} | ${section} | ${day}`;
  }

  function gradePeriodLabel(item) {
    return item.name || "Grade Period";
  }

  function getComponentBadgeClass(name) {
    const lowered = String(name || "").toLowerCase();
    if (lowered.includes("quiz")) return "badge-blue";
    if (lowered.includes("exam")) return "badge-red";
    if (lowered.includes("activity")) return "badge-green";
    if (lowered.includes("attendance")) return "badge-amber";
    return "badge-gray";
  }

  function renderFiltersAndModalOptions() {
    const scheduleFilter = getEl("assessment-schedule-filter");
    const gradePeriodFilter = getEl("assessment-grade-period-filter");
    const scheduleInput = getEl("assessment-schedule-input");
    const gradePeriodInput = getEl("assessment-grade-period-input");

    const scheduleOptions = state.schedules
      .map(item => `<option value="${item.id}">${escapeHtml(scheduleLabel(item))}</option>`)
      .join("");
    const gradePeriodOptions = state.gradePeriods
      .map(item => `<option value="${item.id}">${escapeHtml(gradePeriodLabel(item))}</option>`)
      .join("");

    if (scheduleFilter) {
      scheduleFilter.innerHTML = `<option value="">All Schedules</option>${scheduleOptions}`;
      scheduleFilter.value = state.filters.schedule || "";
    }

    if (gradePeriodFilter) {
      gradePeriodFilter.innerHTML = `<option value="">All Grade Periods</option>${gradePeriodOptions}`;
      gradePeriodFilter.value = state.filters.gradePeriod || "";
    }

    if (scheduleInput) {
      scheduleInput.innerHTML = `<option value="">Select schedule</option>${scheduleOptions}`;
    }

    if (gradePeriodInput) {
      gradePeriodInput.innerHTML = `<option value="">Select grade period</option>${gradePeriodOptions}`;
    }
  }

  function renderAssessmentsTable() {
    const tbody = getEl("assessments-table-body");
    if (!tbody) return;

    if (!state.assessments.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="setup-sub">No assessments found.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = state.assessments
      .map(item => {
        const componentName = item.component_name || "-";
        const componentClass = getComponentBadgeClass(componentName);
        const avg = item.average_score == null ? "--" : formatNumber(item.average_score);
        const submittedCount = Number(item.submitted_count || 0);
        return `
          <tr>
            <td><strong>${escapeHtml(item.title)}</strong></td>
            <td><span class="badge ${componentClass}">${escapeHtml(componentName)}</span></td>
            <td class="mono">${escapeHtml(formatWeight(item.component_weight))}</td>
            <td class="mono">${escapeHtml(formatNumber(item.max_score))}</td>
            <td>${escapeHtml(item.date_given || "-")}</td>
            <td><span class="badge badge-gray">${submittedCount}</span></td>
            <td class="mono">${escapeHtml(avg)}</td>
            <td class="table-actions">
              <button type="button" class="btn btn-ghost btn-xs" data-action="as-open-scores" data-id="${item.id}">Scores</button>
              <button type="button" class="btn btn-ghost btn-xs" data-action="as-edit" data-id="${item.id}">Edit</button>
              <button type="button" class="btn btn-danger btn-xs" data-action="as-delete" data-id="${item.id}">Delete</button>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function renderAssessmentsMobile() {
    const listEl = getEl("assessments-mobile-list");
    if (!listEl) return;

    if (!state.assessments.length) {
      listEl.innerHTML = `
        <article class="m-card">
          <div class="setup-sub">No assessments found.</div>
        </article>
      `;
      return;
    }

    listEl.innerHTML = state.assessments
      .map(item => {
        const componentName = item.component_name || "-";
        const componentClass = getComponentBadgeClass(componentName);
        const avg = item.average_score == null ? "--" : formatNumber(item.average_score);
        const submittedCount = Number(item.submitted_count || 0);
        const scheduleText = `${item.subject_code ? `${item.subject_code} - ` : ""}${item.subject_name} | ${item.section_name}`;
        return `
          <article class="m-card">
            <div class="m-card-row">
              <div>
                <div class="m-card-title">${escapeHtml(item.title)}</div>
                <div class="m-card-sub">${escapeHtml(scheduleText)}</div>
              </div>
              <span class="badge ${componentClass}">${escapeHtml(componentName)}</span>
            </div>
            <div class="m-card-meta">
              <div class="m-meta-item"><span class="m-meta-label">Weight</span><span class="m-meta-value mono">${escapeHtml(formatWeight(item.component_weight))}</span></div>
              <div class="m-meta-item"><span class="m-meta-label">Max</span><span class="m-meta-value mono">${escapeHtml(formatNumber(item.max_score))}</span></div>
              <div class="m-meta-item"><span class="m-meta-label">Date</span><span class="m-meta-value">${escapeHtml(item.date_given || "-")}</span></div>
              <div class="m-meta-item"><span class="m-meta-label">Submitted</span><span class="m-meta-value mono">${submittedCount}</span></div>
              <div class="m-meta-item"><span class="m-meta-label">Average</span><span class="m-meta-value mono">${escapeHtml(avg)}</span></div>
              <div class="m-meta-item"><span class="m-meta-label">Period</span><span class="m-meta-value">${escapeHtml(item.grade_period_name || "-")}</span></div>
            </div>
            <div class="m-card-actions">
              <button type="button" class="btn btn-ghost" data-action="as-open-scores" data-id="${item.id}">Scores</button>
              <button type="button" class="btn btn-ghost" data-action="as-edit" data-id="${item.id}">Edit</button>
              <button type="button" class="btn btn-danger" data-action="as-delete" data-id="${item.id}">Delete</button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderLoadingState() {
    const tbody = getEl("assessments-table-body");
    const mobile = getEl("assessments-mobile-list");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" class="setup-sub">Loading assessments...</td></tr>`;
    }
    if (mobile) {
      mobile.innerHTML = `<article class="m-card"><div class="setup-sub">Loading assessments...</div></article>`;
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

  function buildAssessmentsUrl() {
    const params = new URLSearchParams();
    if (state.filters.schedule) params.set("schedule", state.filters.schedule);
    if (state.filters.gradePeriod) params.set("grade_period", state.filters.gradePeriod);
    if (state.filters.search) params.set("search", state.filters.search);
    const query = params.toString();
    return query ? `/api/assessments/?${query}` : "/api/assessments/";
  }

  async function loadReferenceData() {
    const [schedules, gradePeriods] = await Promise.all([
      fetchList("/api/schedules/", "Failed to load schedules."),
      fetchList("/api/grade-periods/", "Failed to load grade periods."),
    ]);
    state.schedules = schedules;
    state.gradePeriods = gradePeriods;
    renderFiltersAndModalOptions();
  }

  async function loadAssessments() {
    renderLoadingState();
    state.assessments = await fetchList(buildAssessmentsUrl(), "Failed to load assessments.");
    renderAssessmentsTable();
    renderAssessmentsMobile();
  }

  async function loadComponentsForSchedule(scheduleId) {
    const componentSelect = getEl("assessment-component-input");
    if (!componentSelect) return [];

    if (!scheduleId) {
      componentSelect.innerHTML = `<option value="">Select a schedule first</option>`;
      componentSelect.disabled = true;
      return [];
    }

    componentSelect.innerHTML = `<option value="">Loading components...</option>`;
    componentSelect.disabled = true;

    const cached = state.componentsBySchedule[scheduleId];
    if (cached) {
      return cached;
    }

    const response = await authFetch(`/api/schedules/${scheduleId}/grading-components/`, {
      method: "GET",
    });
    const payload = await safeJson(response);
    if (!response.ok) {
      throw new Error(
        extractErrorMessage(
          payload,
          "Please assign a grading template to this schedule first."
        )
      );
    }
    const components = normalizeList(payload.components || payload);
    state.componentsBySchedule[scheduleId] = components;
    return components;
  }

  function renderComponentOptions(components, selectedValue = "") {
    const componentSelect = getEl("assessment-component-input");
    if (!componentSelect) return;

    if (!components.length) {
      componentSelect.innerHTML = `<option value="">No grading components available</option>`;
      componentSelect.disabled = true;
      return;
    }

    componentSelect.innerHTML = `
      <option value="">Select grading component</option>
      ${components
        .map(
          item =>
            `<option value="${item.id}">${escapeHtml(item.name)} - ${escapeHtml(
              formatWeight(item.weight)
            )}</option>`
        )
        .join("")}
    `;
    componentSelect.disabled = false;
    componentSelect.value = selectedValue ? String(selectedValue) : "";
    if (selectedValue && componentSelect.value !== String(selectedValue)) {
      componentSelect.value = "";
    }
  }

  function getAssessmentById(id) {
    return state.assessments.find(item => item.id === id);
  }

  function resetAssessmentModal() {
    state.editingAssessmentId = null;
    getEl("assessment-modal-title").textContent = "Add Assessment";
    getEl("assessment-title-input").value = "";
    getEl("assessment-schedule-input").value = "";
    getEl("assessment-grade-period-input").value = "";
    getEl("assessment-max-score-input").value = "";
    getEl("assessment-date-given-input").value = "";
    getEl("assessment-description-input").value = "";
    renderComponentOptions([]);
    showModalError("assessment-modal-error", "");
  }

  async function openCreateModal() {
    resetAssessmentModal();
    renderFiltersAndModalOptions();

    if (state.filters.schedule) {
      getEl("assessment-schedule-input").value = String(state.filters.schedule);
      try {
        const components = await loadComponentsForSchedule(Number(state.filters.schedule));
        renderComponentOptions(components);
      } catch (err) {
        renderComponentOptions([]);
        showModalError("assessment-modal-error", err.message);
      }
    }

    if (state.filters.gradePeriod) {
      getEl("assessment-grade-period-input").value = String(state.filters.gradePeriod);
    }

    openModal("modal-assessment");
  }

  async function openEditModal(id) {
    const item = getAssessmentById(id);
    if (!item) return;

    resetAssessmentModal();
    state.editingAssessmentId = id;
    getEl("assessment-modal-title").textContent = "Edit Assessment";

    getEl("assessment-title-input").value = item.title || "";
    getEl("assessment-schedule-input").value = item.schedule || "";
    getEl("assessment-grade-period-input").value = item.grade_period || "";
    getEl("assessment-max-score-input").value = item.max_score || "";
    getEl("assessment-date-given-input").value = item.date_given || "";
    getEl("assessment-description-input").value = item.description || "";

    try {
      const components = await loadComponentsForSchedule(Number(item.schedule));
      renderComponentOptions(components, item.component);
    } catch (err) {
      renderComponentOptions([]);
      showModalError("assessment-modal-error", err.message);
    }

    openModal("modal-assessment");
  }

  function closeAssessmentModal() {
    closeModal("modal-assessment");
    showModalError("assessment-modal-error", "");
  }

  async function onScheduleChangeInModal() {
    const scheduleId = Number(getEl("assessment-schedule-input").value || "0");
    showModalError("assessment-modal-error", "");
    if (!scheduleId) {
      renderComponentOptions([]);
      return;
    }

    try {
      const components = await loadComponentsForSchedule(scheduleId);
      renderComponentOptions(components);
    } catch (err) {
      renderComponentOptions([]);
      showModalError("assessment-modal-error", err.message);
    }
  }

  async function saveAssessment() {
    const schedule = Number(getEl("assessment-schedule-input").value || "0");
    const gradePeriod = Number(getEl("assessment-grade-period-input").value || "0");
    const component = Number(getEl("assessment-component-input").value || "0");
    const title = String(getEl("assessment-title-input").value || "").trim();
    const maxScore = Number(getEl("assessment-max-score-input").value || "0");
    const dateGiven = String(getEl("assessment-date-given-input").value || "").trim();
    const description = String(getEl("assessment-description-input").value || "").trim();

    if (!schedule) {
      showModalError("assessment-modal-error", "Please select a schedule.");
      return;
    }
    if (!gradePeriod) {
      showModalError("assessment-modal-error", "Please select a grade period.");
      return;
    }
    if (!component) {
      showModalError("assessment-modal-error", "Please select a grading component.");
      return;
    }
    if (!title) {
      showModalError("assessment-modal-error", "Assessment title is required.");
      return;
    }
    if (!Number.isFinite(maxScore) || maxScore <= 0) {
      showModalError("assessment-modal-error", "Total score must be greater than 0.");
      return;
    }
    if (!dateGiven) {
      showModalError("assessment-modal-error", "Date given is required.");
      return;
    }

    const payload = {
      title,
      schedule,
      grade_period: gradePeriod,
      component,
      max_score: Number(maxScore.toFixed(2)),
      date_given: dateGiven,
      description: description || null,
    };

    const isEditing = !!state.editingAssessmentId;
    const url = isEditing ? `/api/assessments/${state.editingAssessmentId}/` : "/api/assessments/";
    const method = isEditing ? "PATCH" : "POST";

    try {
      await sendJson(url, method, payload, "Failed to save assessment.");
      closeAssessmentModal();
      await loadAssessments();
      showFeedback("Assessment saved.");
    } catch (err) {
      showModalError("assessment-modal-error", err.message || "Failed to save assessment.");
    }
  }

  function openDeleteModal(id) {
    const item = getAssessmentById(id);
    if (!item) return;
    state.deleteAssessmentId = id;
    getEl("assessment-delete-message").textContent = `Delete "${item.title}"?`;
    showModalError("assessment-delete-error", "");
    openModal("modal-assessment-delete");
  }

  function closeDeleteModal() {
    state.deleteAssessmentId = null;
    showModalError("assessment-delete-error", "");
    closeModal("modal-assessment-delete");
  }

  async function confirmDelete() {
    if (!state.deleteAssessmentId) return;

    const response = await authFetch(`/api/assessments/${state.deleteAssessmentId}/`, {
      method: "DELETE",
    });
    if (response.status === 204) {
      closeDeleteModal();
      await loadAssessments();
      showFeedback("Assessment deleted.");
      return;
    }

    const payload = await safeJson(response);
    if (response.ok) {
      closeDeleteModal();
      await loadAssessments();
      showFeedback(payload.message || "Assessment updated.");
      return;
    }

    showModalError(
      "assessment-delete-error",
      extractErrorMessage(payload, "Failed to delete assessment.")
    );
  }

  function scoreInitials(name) {
    const text = String(name || "").trim();
    if (!text) return "ST";
    const parts = text.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] || "S";
    const last = parts.length > 1 ? parts[parts.length - 1][0] : "T";
    return `${first}${last}`.toUpperCase();
  }

  function scoreAvatarClass(row, index) {
    const key = Number(row.student || row.record || index || 0);
    return SCORE_AVATAR_COLORS[Math.abs(key) % SCORE_AVATAR_COLORS.length];
  }

  function parseScoreValue(rawValue) {
    const text = String(rawValue ?? "").trim();
    if (!text) return null;
    const numberValue = Number(text);
    if (!Number.isFinite(numberValue)) return Number.NaN;
    return numberValue;
  }

  function updateScoresSummary() {
    const modal = getEl("modal-scores");
    if (!modal || modal.hidden) return;

    const inputs = Array.from(modal.querySelectorAll(".score-input"));
    const studentCount = inputs.length;
    let enteredCount = 0;
    inputs.forEach(input => {
      const value = parseScoreValue(input.value);
      if (value != null && Number.isFinite(value)) enteredCount += 1;
    });

    const studentCountEl = getEl("scores-student-count");
    const summaryEl = getEl("scores-summary-text");
    if (studentCountEl) {
      studentCountEl.textContent = `${studentCount} student${studentCount === 1 ? "" : "s"}`;
    }
    if (summaryEl) {
      summaryEl.textContent = `${enteredCount} of ${studentCount} scores entered`;
    }
  }

  function renderScoresRows(rows, maxScore) {
    const tbody = getEl("scores-table-body");
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="3" class="setup-sub">No students enrolled in this schedule.</td>
        </tr>
      `;
      updateScoresSummary();
      return;
    }

    tbody.innerHTML = rows
      .map((row, index) => {
        const entered = row.score !== null && row.score !== undefined && String(row.score).trim() !== "";
        const valueText = entered ? formatNumber(row.score) : "";
        const badgeClass = entered ? "badge-green" : "badge-gray";
        const badgeLabel = entered ? "Entered" : "Pending";
        return `
          <tr data-record="${row.record}">
            <td>
              <div class="avatar-name">
                <span class="avatar-badge ${scoreAvatarClass(row, index)} sm">${scoreInitials(
                  row.student_name
                )}</span>
                ${escapeHtml(row.student_name)}
              </div>
            </td>
            <td>
              <div class="score-entry">
                <input type="number" class="score-input" data-record="${row.record}" min="0" max="${escapeHtml(
                  formatNumber(maxScore)
                )}" step="0.01" value="${escapeHtml(valueText)}">
                <span class="score-max-col">/${escapeHtml(formatNumber(maxScore))}</span>
              </div>
            </td>
            <td><span class="badge ${badgeClass}">${badgeLabel}</span></td>
          </tr>
        `;
      })
      .join("");

    updateScoresSummary();
  }

  function closeScoresModal() {
    const tbody = getEl("scores-table-body");
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="3" class="setup-sub">Select an assessment to load scores.</td>
        </tr>
      `;
    }
    state.scoreAssessmentId = null;
    showModalError("scores-modal-error", "");
    closeModal("modal-scores");
  }

  async function openScoresModal(assessmentId) {
    const id = Number(assessmentId || "0");
    const item = getAssessmentById(id);
    if (!id || !item) return;

    state.scoreAssessmentId = id;
    const title = getEl("scores-modal-title");
    const meta = getEl("scores-modal-meta");
    const maxLabel = getEl("scores-max-label");
    if (title) title.textContent = `Scores - ${item.title || "Assessment"}`;
    if (meta) meta.textContent = item.schedule_display || `${item.subject_name || "-"} - ${item.section_name || "-"}`;
    if (maxLabel) maxLabel.textContent = `Max Score: ${formatNumber(item.max_score)}`;
    showModalError("scores-modal-error", "");

    const tbody = getEl("scores-table-body");
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="3" class="setup-sub">Loading scores...</td>
        </tr>
      `;
    }
    openModal("modal-scores");

    try {
      const response = await authFetch(`/api/assessments/${id}/scores/`, { method: "GET" });
      const payload = await safeJson(response);
      if (!response.ok) {
        throw new Error(extractErrorMessage(payload, "Failed to load scores."));
      }

      renderScoresRows(normalizeList(payload.rows), payload.max_score ?? item.max_score);
    } catch (err) {
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="3" class="setup-sub">Failed to load scores.</td>
          </tr>
        `;
      }
      showModalError("scores-modal-error", err.message || "Failed to load scores.");
      updateScoresSummary();
    }
  }

  async function saveScores() {
    if (!state.scoreAssessmentId) return;
    const tbody = getEl("scores-table-body");
    if (!tbody) return;

    const maxText = (getEl("scores-max-label")?.textContent || "").replace("Max Score:", "").trim();
    const maxScore = Number(maxText || "0");
    const inputs = Array.from(tbody.querySelectorAll(".score-input"));
    const items = [];

    for (const input of inputs) {
      input.classList.remove("is-invalid");
      const recordId = Number(input.dataset.record || "0");
      const scoreValue = parseScoreValue(input.value);
      if (!recordId) continue;

      if (scoreValue != null && !Number.isFinite(scoreValue)) {
        input.classList.add("is-invalid");
        showModalError("scores-modal-error", "Score must be a valid number.");
        return;
      }
      if (scoreValue != null && scoreValue < 0) {
        input.classList.add("is-invalid");
        showModalError("scores-modal-error", "Score cannot be less than 0.");
        return;
      }
      if (scoreValue != null && Number.isFinite(maxScore) && maxScore > 0 && scoreValue > maxScore) {
        input.classList.add("is-invalid");
        showModalError(
          "scores-modal-error",
          `Score cannot be greater than ${formatNumber(maxScore)}.`
        );
        return;
      }

      items.push({
        record: recordId,
        score: scoreValue == null ? null : Number(scoreValue.toFixed(2)),
      });
    }

    try {
      showModalError("scores-modal-error", "");
      const payload = await sendJson(
        `/api/assessments/${state.scoreAssessmentId}/scores/`,
        "POST",
        { items },
        "Failed to save scores."
      );
      renderScoresRows(normalizeList(payload.rows), maxScore);
      await loadAssessments();
      showFeedback("Scores saved.");
    } catch (err) {
      showModalError("scores-modal-error", err.message || "Failed to save scores.");
    }
  }

  function setupFilters() {
    const scheduleFilter = getEl("assessment-schedule-filter");
    const gradePeriodFilter = getEl("assessment-grade-period-filter");
    const searchInput = getEl("assessment-search-input");

    if (scheduleFilter) {
      scheduleFilter.addEventListener("change", () => {
        state.filters.schedule = String(scheduleFilter.value || "");
        loadAssessments().catch(err => showFeedback(err.message, true));
      });
    }

    if (gradePeriodFilter) {
      gradePeriodFilter.addEventListener("change", () => {
        state.filters.gradePeriod = String(gradePeriodFilter.value || "");
        loadAssessments().catch(err => showFeedback(err.message, true));
      });
    }

    if (searchInput) {
      searchInput.addEventListener("input", () => {
        state.filters.search = String(searchInput.value || "").trim();
        window.clearTimeout(setupFilters._searchTimeout);
        setupFilters._searchTimeout = window.setTimeout(() => {
          loadAssessments().catch(err => showFeedback(err.message, true));
        }, 220);
      });
    }
  }

  function handleAction(actionEl) {
    const action = actionEl.dataset.action;
    const id = Number(actionEl.dataset.id || "0");

    if (action === "as-open-create") openCreateModal();
    if (action === "as-open-scores") openScoresModal(id);
    if (action === "as-edit") openEditModal(id);
    if (action === "as-delete") openDeleteModal(id);
    if (action === "as-close-modal") closeAssessmentModal();
    if (action === "as-save") saveAssessment();
    if (action === "as-close-scores") closeScoresModal();
    if (action === "as-save-scores") saveScores();
    if (action === "as-close-delete-modal") closeDeleteModal();
    if (action === "as-confirm-delete") confirmDelete();
  }

  async function initAssessments() {
    const page = getEl("page-assessments");
    if (!page) return;

    document.addEventListener("click", event => {
      const actionEl = event.target.closest("[data-action]");
      if (!actionEl) return;
      if (!String(actionEl.dataset.action || "").startsWith("as-")) return;
      handleAction(actionEl);
    });

    const scheduleInput = getEl("assessment-schedule-input");
    if (scheduleInput) {
      scheduleInput.addEventListener("change", () => {
        onScheduleChangeInModal().catch(err => {
          showModalError("assessment-modal-error", err.message || "Failed to load components.");
        });
      });
    }

    const scoresTableBody = getEl("scores-table-body");
    if (scoresTableBody) {
      scoresTableBody.addEventListener("input", event => {
        const input = event.target.closest(".score-input");
        if (!input) return;
        input.classList.remove("is-invalid");
        const row = input.closest("tr");
        const badge = row ? row.querySelector(".badge") : null;
        const parsed = parseScoreValue(input.value);
        const entered = parsed != null && Number.isFinite(parsed);
        if (badge) {
          badge.className = `badge ${entered ? "badge-green" : "badge-gray"}`;
          badge.textContent = entered ? "Entered" : "Pending";
        }
        showModalError("scores-modal-error", "");
        updateScoresSummary();
      });
    }

    setupFilters();

    try {
      await loadReferenceData();
      await loadAssessments();
    } catch (err) {
      showFeedback(err.message || "Failed to load assessments.", true);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initAssessments();
  });
})();
