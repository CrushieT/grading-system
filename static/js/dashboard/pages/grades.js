(() => {
  const REFRESH_STORAGE_KEY = "gd_refresh";
  const events = window.EduTrackEvents || null;
  const handlers = window.dashboardPageHandlers || (window.dashboardPageHandlers = {});
  let accessToken = null;
  let refreshPromise = null;
  let isRedirectingToLogin = false;

  const state = {
    schedules: [],
    gradePeriods: [],
    records: [],
    selectedSchedule: "",
    selectedGradePeriod: "",
    selectedRemarks: "",
    isLoading: false,
    isComputing: false,
    isStale: false,
    isWeightedMode: false,
  };

  function getEl(id) {
    return document.getElementById(id);
  }

  handlers.switchGradeTab = (tabId, tabButton) => {
    document.querySelectorAll(".tab-panel").forEach(panel => {
      panel.classList.toggle("active", panel.id === tabId);
    });
    document.querySelectorAll(".tab").forEach(tab => {
      tab.classList.toggle("active", tab === tabButton);
    });
  };

  function getRefreshToken() {
    return sessionStorage.getItem(REFRESH_STORAGE_KEY) || localStorage.getItem(REFRESH_STORAGE_KEY);
  }

  function hardRedirectLogin() {
    if (isRedirectingToLogin) return;
    isRedirectingToLogin = true;
    window.location.replace("/login.html");
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
      const response = await fetch("/api/auth/refresh/", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });
      if (!response.ok) return null;
      const data = await safeJson(response);
      accessToken = data.access || null;
      return accessToken;
    })();
    const token = await refreshPromise;
    refreshPromise = null;
    return token;
  }

  async function authFetch(url, options = {}, allowRetry = true) {
    const requestOptions = {
      ...options,
      credentials: "same-origin",
      headers: { ...(options.headers || {}) },
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
    if (response.status === 401) hardRedirectLogin();
    return response;
  }

  function normalizeList(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.results)) return payload.results;
    if (payload && Array.isArray(payload.items)) return payload.items;
    return [];
  }

  function extractErrorMessage(payload, fallback) {
    if (!payload) return fallback;
    if (typeof payload === "string") return payload;
    if (payload.detail && typeof payload.detail === "string") return payload.detail;
    for (const [, value] of Object.entries(payload)) {
      if (Array.isArray(value) && value.length) return String(value[0]);
      if (typeof value === "string") return value;
    }
    return fallback;
  }

  function showFeedback(message, isError = false) {
    const el = getEl("grades-feedback");
    if (!el) return;
    el.textContent = message;
    el.hidden = !message;
    el.classList.toggle("error", isError);
  }

  function markStale(message) {
    state.isStale = true;
    showFeedback(message || "Some data changed. Recompute grades.");
  }

  function formatNumber(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "--";
    return num.toFixed(2).replace(/\.00$/, "");
  }

  function remarkBadgeClass(remarks) {
    if (remarks === "Passed") return "badge-green";
    if (remarks === "Failed") return "badge-red";
    return "badge-amber";
  }

  function gradeClass(grade) {
    const num = Number(grade);
    if (!Number.isFinite(num)) return "value-amber";
    if (num >= 75) return "value-green";
    if (num >= 60) return "value-amber";
    return "value-red";
  }

  function renderScheduleOptions() {
    const select = getEl("grades-schedule-filter");
    if (!select) return;
    const options = state.schedules
      .map(item => `<option value="${item.id}">${item.subject_name} - ${item.section_name} (${item.day || "-"})</option>`)
      .join("");
    select.innerHTML = `<option value="">Select schedule</option>${options}`;
    select.value = state.selectedSchedule || "";
  }

  function renderPeriodOptions() {
    const select = getEl("grades-period-filter");
    if (!select) return;
    const options = state.gradePeriods
      .map(item => `<option value="${item.id}">${item.name}</option>`)
      .join("");
    select.innerHTML = `<option value="">Select grade period</option>${options}<option value="__weighted__">Weighted Average</option>`;
    select.value = state.selectedGradePeriod || "";
  }

  function renderLoadingState() {
    const tbody = getEl("grades-table-body");
    const mobile = getEl("grades-mobile-list");
    const countEl = getEl("grades-record-count");
    if (countEl) countEl.textContent = "Loading...";
    if (tbody) tbody.innerHTML = `<tr><td colspan="12" class="setup-sub">Loading grades...</td></tr>`;
    if (mobile) mobile.innerHTML = `<article class="m-card"><div class="setup-sub">Loading grades...</div></article>`;
  }

  function renderEmptyState(message) {
    const tbody = getEl("grades-table-body");
    const mobile = getEl("grades-mobile-list");
    const countEl = getEl("grades-record-count");
    const avgEl = getEl("rr-class-average");
    const hlEl = getEl("rr-high-low");
    if (countEl) countEl.textContent = "0 students";
    if (avgEl) avgEl.textContent = "--";
    if (hlEl) hlEl.textContent = "--";
    if (tbody) tbody.innerHTML = `<tr><td colspan="12" class="setup-sub">${message}</td></tr>`;
    if (mobile) mobile.innerHTML = `<article class="m-card"><div class="setup-sub">${message}</div></article>`;
  }

  function componentHeaders() {
    if (!state.records.length) return [];
    if (state.isWeightedMode) return [];
    const first = state.records[0];
    const parts = Array.isArray(first.component_breakdown) ? first.component_breakdown : [];
    return parts.map(part => ({
      key: part.component,
      label: `${part.component} ${formatNumber(part.weight)}%`,
    }));
  }

  function renderGrades() {
    const headers = componentHeaders();
    const head = getEl("grades-table-head-row");
    const tbody = getEl("grades-table-body");
    const mobile = getEl("grades-mobile-list");
    const countEl = getEl("grades-record-count");
    if (!head || !tbody || !mobile) return;

    if (state.isWeightedMode) {
      head.innerHTML = `
        <th>Student</th>
        <th>Student ID</th>
        <th>Prelim</th>
        <th>Midterm</th>
        <th>Prefinal</th>
        <th>Final</th>
        <th>Overall Avg</th>
        <th>Overall Remarks</th>
      `;
    } else {
      head.innerHTML = `
        <th>Student</th>
        <th>Student ID</th>
        ${headers.map(h => `<th>${h.label}</th>`).join("")}
        <th>Final Grade</th>
        <th>Overall Avg</th>
        <th>Remarks</th>
      `;
    }

    if (!state.records.length) {
      renderEmptyState("No computed grades yet. Click Recompute Grades.");
      return;
    }
    if (countEl) {
      const total = state.records.length;
      countEl.textContent = `${total} student${total === 1 ? "" : "s"}`;
    }

    tbody.innerHTML = state.records.map(row => {
      if (state.isWeightedMode) {
        return `
          <tr>
            <td>${row.student_name || "-"}</td>
            <td class="mono">${row.student_id || "-"}</td>
            <td class="mono">${formatNumber(row.prelim_grade)}</td>
            <td class="mono">${formatNumber(row.midterm_grade)}</td>
            <td class="mono">${formatNumber(row.prefinal_grade)}</td>
            <td class="mono">${formatNumber(row.final_grade)}</td>
            <td class="mono ${gradeClass(row.overall_average_grade)}">${formatNumber(row.overall_average_grade)}</td>
            <td><span class="badge ${remarkBadgeClass(row.overall_remarks || row.remarks)}">${row.overall_remarks || row.remarks || "-"}</span></td>
          </tr>
        `;
      }
      const cells = headers.map(h => {
        const part = (row.component_breakdown || []).find(item => item.component === h.key);
        return `<td class="mono">${formatNumber(part ? part.raw_percentage : null)}</td>`;
      }).join("");
      return `
        <tr>
          <td>${row.student_name || "-"}</td>
          <td class="mono">${row.student_id || "-"}</td>
          ${cells}
          <td>
            <div class="grade-value-wrap">
              <span class="mono ${gradeClass(row.final_grade)}">${formatNumber(row.final_grade)}</span>
              <div class="grade-bar"><div class="grade-fill"></div></div>
            </div>
          </td>
          <td class="mono ${gradeClass(row.overall_average_grade)}">${formatNumber(row.overall_average_grade)}</td>
          <td><span class="badge ${remarkBadgeClass(row.remarks)}">${row.remarks || "-"}</span></td>
        </tr>
      `;
    }).join("");

    mobile.innerHTML = state.records.map(row => `
      <article class="m-card">
        <div class="m-card-row">
          <div class="m-card-title">${row.student_name || "-"}</div>
          <span class="badge ${remarkBadgeClass(row.overall_remarks || row.remarks)}">${row.overall_remarks || row.remarks || "-"}</span>
        </div>
        <div class="m-card-meta">
          <div class="m-meta-item"><span class="m-meta-label">Student ID</span><span class="m-meta-value mono">${row.student_id || "-"}</span></div>
          ${state.isWeightedMode
            ? `
              <div class="m-meta-item"><span class="m-meta-label">Prelim</span><span class="m-meta-value mono">${formatNumber(row.prelim_grade)}</span></div>
              <div class="m-meta-item"><span class="m-meta-label">Midterm</span><span class="m-meta-value mono">${formatNumber(row.midterm_grade)}</span></div>
              <div class="m-meta-item"><span class="m-meta-label">Prefinal</span><span class="m-meta-value mono">${formatNumber(row.prefinal_grade)}</span></div>
              <div class="m-meta-item"><span class="m-meta-label">Final</span><span class="m-meta-value mono">${formatNumber(row.final_grade)}</span></div>
            `
            : (row.component_breakdown || []).map(part => `<div class="m-meta-item"><span class="m-meta-label">${part.component} (${formatNumber(part.weight)}%)</span><span class="m-meta-value mono">${formatNumber(part.raw_percentage)}</span></div>`).join("")
          }
          ${state.isWeightedMode ? "" : `<div class="m-meta-item"><span class="m-meta-label">Final Grade</span><span class="m-meta-value mono ${gradeClass(row.final_grade)}">${formatNumber(row.final_grade)}</span></div>`}
          <div class="m-meta-item"><span class="m-meta-label">Overall Avg</span><span class="m-meta-value mono ${gradeClass(row.overall_average_grade)}">${formatNumber(row.overall_average_grade)}</span></div>
          <div class="m-meta-item"><span class="m-meta-label">Overall Remarks</span><span class="m-meta-value">${row.overall_remarks || "-"}</span></div>
        </div>
      </article>
    `).join("");
    updateStatCardsFromDisplayedRecords();
  }

  function updateStatCardsFromDisplayedRecords() {
    const avgEl = getEl("rr-class-average");
    const hlEl = getEl("rr-high-low");
    if (!avgEl || !hlEl) return;
    if (!state.records.length) {
      avgEl.textContent = "--";
      hlEl.textContent = "--";
      return;
    }

    const values = state.records
      .map(item => Number(state.isWeightedMode ? item.overall_average_grade : item.final_grade))
      .filter(Number.isFinite);

    if (!values.length) {
      avgEl.textContent = "--";
      hlEl.textContent = "--";
      return;
    }

    const avg = values.reduce((sum, n) => sum + n, 0) / values.length;
    const high = Math.max(...values);
    const low = Math.min(...values);
    avgEl.textContent = formatNumber(avg);
    hlEl.textContent = `${formatNumber(high)} / ${formatNumber(low)}`;
  }

  async function fetchList(url, fallback) {
    const response = await authFetch(url, { method: "GET" });
    const payload = await safeJson(response);
    if (!response.ok) throw new Error(extractErrorMessage(payload, fallback));
    return normalizeList(payload);
  }

  async function loadReferenceData() {
    const [schedules, gradePeriods] = await Promise.all([
      fetchList("/api/schedules/", "Failed to load schedules."),
      fetchList("/api/grade-periods/", "Failed to load grade periods."),
    ]);
    state.schedules = schedules;
    state.gradePeriods = gradePeriods;
    renderScheduleOptions();
    renderPeriodOptions();
  }

  async function loadRecords() {
    if (!state.selectedSchedule || !state.selectedGradePeriod) {
      state.records = [];
      renderEmptyState("Please select a schedule and grade period.");
      return;
    }

    state.isWeightedMode = state.selectedGradePeriod === "__weighted__";
    renderLoadingState();
    state.isLoading = true;
    try {
      if (state.isWeightedMode) {
        state.records = await fetchList(
          `/api/reports/weighted-average/?schedule=${encodeURIComponent(state.selectedSchedule)}&remarks=${encodeURIComponent(state.selectedRemarks || "")}`,
          "Failed to load records."
        );
      } else {
        state.records = await fetchList(
          `/api/records/?schedule=${encodeURIComponent(state.selectedSchedule)}&grade_period=${encodeURIComponent(state.selectedGradePeriod)}&remarks=${encodeURIComponent(state.selectedRemarks || "")}`,
          "Failed to load records."
        );
      }
      renderGrades();
    } catch (err) {
      state.records = [];
      renderEmptyState(err.message || "Failed to load records.");
      showFeedback(err.message || "Failed to load records.", true);
    } finally {
      state.isLoading = false;
    }
  }

  async function recomputeGrades() {
    if (!state.selectedSchedule) {
      showFeedback("Please select a schedule.", true);
      return;
    }
    if (!state.selectedGradePeriod) {
      showFeedback("Please select a grade period.", true);
      return;
    }
    if (state.selectedGradePeriod === "__weighted__") {
      showFeedback("Please select a specific grade period to recompute.", true);
      return;
    }

    const button = getEl("grades-recompute-btn");
    state.isComputing = true;
    if (button) {
      button.disabled = true;
      button.textContent = "Computing...";
    }
    showFeedback("");

    try {
      const response = await authFetch("/api/grades/recompute/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule: Number(state.selectedSchedule),
          grade_period: Number(state.selectedGradePeriod),
        }),
      });
      const payload = await safeJson(response);
      if (!response.ok) {
        throw new Error(extractErrorMessage(payload, "Failed to compute grades."));
      }
      await loadRecords();
      state.isStale = false;
      if (events) {
        events.invalidate("records");
        events.emit("grades:changed");
      }
      showFeedback(payload.message || "Grades computed.");
    } catch (err) {
      showFeedback(err.message || "Failed to compute grades.", true);
    } finally {
      state.isComputing = false;
      if (button) {
        button.disabled = false;
        button.textContent = "Recompute Grades";
      }
    }
  }

  function setupHandlers() {
    const schedule = getEl("grades-schedule-filter");
    const period = getEl("grades-period-filter");
    const remarks = getEl("grades-remarks-filter");
    if (schedule) {
      schedule.addEventListener("change", () => {
        state.selectedSchedule = String(schedule.value || "");
        loadRecords();
      });
    }
    if (period) {
      period.addEventListener("change", () => {
        state.selectedGradePeriod = String(period.value || "");
        loadRecords();
      });
    }
    if (remarks) {
      remarks.addEventListener("change", () => {
        state.selectedRemarks = String(remarks.value || "");
        loadRecords();
      });
    }

    document.addEventListener("click", event => {
      const actionEl = event.target.closest("[data-action]");
      if (!actionEl) return;
      if (actionEl.dataset.action === "gr-recompute") recomputeGrades();
    });
  }

  async function initGradesPage() {
    if (!getEl("page-grades")) return;
    setupHandlers();
    const refreshLookupsDebounced = events?.debounce?.(
      () => loadReferenceData().catch(err => showFeedback(err.message || "Some data could not be refreshed. Please try again.", true)),
      220
    );
    const refreshRecordsDebounced = events?.debounce?.(
      () => loadRecords().catch(err => showFeedback(err.message || "Some data could not be refreshed. Please try again.", true)),
      220
    );
    if (events && refreshLookupsDebounced && refreshRecordsDebounced) {
      events.on("schedules:changed", refreshLookupsDebounced);
      events.on("school-setup:changed", refreshLookupsDebounced);
      events.on("assessments:changed", () => markStale("Assessments changed. Recompute grades."));
      events.on("scores:changed", () => markStale("Scores changed. Recompute grades."));
      events.on("grading-templates:changed", () => markStale("Grading template changed. Recompute grades."));
      events.on("grades:changed", refreshRecordsDebounced);
      events.on("dashboard:page-activated", event => {
        if (event.detail?.page !== "grades") return;
        if (events.isInvalid("schedules") || events.isInvalid("gradePeriods")) {
          events.clearInvalid("schedules");
          events.clearInvalid("gradePeriods");
          refreshLookupsDebounced();
        }
        if (events.isInvalid("records")) {
          events.clearInvalid("records");
          refreshRecordsDebounced();
        }
      });
    }
    try {
      await loadReferenceData();
      await loadRecords();
      window.EduTrackModules = window.EduTrackModules || {};
      window.EduTrackModules.grades = {
        refreshLookups: loadReferenceData,
        refreshList: loadRecords,
        refreshAll: async () => {
          await loadReferenceData();
          await loadRecords();
        },
      };
    } catch (err) {
      showFeedback(err.message || "Failed to load grades page.", true);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initGradesPage();
  });
})();
