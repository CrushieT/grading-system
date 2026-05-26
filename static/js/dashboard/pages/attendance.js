(() => {
  const REFRESH_STORAGE_KEY = "gd_refresh";
  const events = window.EduTrackEvents || null;

  let accessToken = null;
  let refreshPromise = null;
  let isRedirectingToLogin = false;

  const state = {
    schedules: [],
    enrollments: [],
    attendance: [],
    selectedSchedule: "",
    selectedDate: "",
    pendingStatuses: new Map(),
    isLoading: false,
  };

  const STATUS_CODES = ["PRESENT", "ABSENT", "LATE", "EXCUSE"];
  const STATUS_SHORT = {
    PRESENT: "P",
    ABSENT: "A",
    LATE: "L",
    EXCUSE: "E",
  };
  const STATUS_ACTIVE_CLASS = {
    PRESENT: "active-p",
    ABSENT: "active-a",
    LATE: "active-l",
    EXCUSE: "active-e",
  };
  const STATUS_BTN_CLASS = {
    PRESENT: "p",
    ABSENT: "a",
    LATE: "l",
    EXCUSE: "e",
  };
  const STATUS_BADGE_CLASS = {
    PRESENT: "badge-green",
    ABSENT: "badge-red",
    LATE: "badge-amber",
    EXCUSE: "badge-blue",
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
    if (payload && Array.isArray(payload.records)) return payload.records;
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
    const feedbackEl = getEl("attendance-feedback");
    if (!feedbackEl) return;
    feedbackEl.textContent = message;
    feedbackEl.hidden = false;
    feedbackEl.classList.toggle("error", isError);

    window.clearTimeout(showFeedback._timeoutId);
    showFeedback._timeoutId = window.setTimeout(() => {
      feedbackEl.hidden = true;
    }, 3200);
  }

  function todayIsoDate() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 10);
  }

  function parseIsoDate(isoDate) {
    const parts = String(isoDate || "").split("-");
    if (parts.length !== 3) return null;
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }

  function formatDateLabel(isoDate) {
    const parsed = parseIsoDate(isoDate);
    if (!parsed) return "Selected Date";
    return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function normalizeStatus(value) {
    const key = String(value || "").trim().toUpperCase();
    if (!key) return "";
    if (key === "EXCUSED") return "EXCUSE";
    if (key === "E") return "EXCUSE";
    if (key === "P") return "PRESENT";
    if (key === "A") return "ABSENT";
    if (key === "L") return "LATE";
    if (STATUS_CODES.includes(key)) return key;
    return "";
  }

  function updateDateHeader() {
    const header = getEl("attendance-date-header");
    if (!header) return;
    header.textContent = state.selectedDate
      ? `${formatDateLabel(state.selectedDate)}`
      : "Selected Date";
  }

  function setSaveButtonState(isSaving = false) {
    const saveButton = getEl("attendance-save-btn");
    if (!saveButton) return;
    const hasPending = state.pendingStatuses.size > 0;
    const canSave = !!state.selectedSchedule && !!state.selectedDate && hasPending;

    saveButton.disabled = !canSave || isSaving;
    if (isSaving) {
      saveButton.textContent = "Saving...";
      return;
    }
    saveButton.textContent = hasPending ? `Save (${state.pendingStatuses.size})` : "Save";
  }

  function renderEmptyState(message) {
    const tableBody = getEl("attendance-table-body");
    const mobileList = getEl("attendance-mobile-list");
    if (tableBody) {
      tableBody.innerHTML = `
        <tr><td colspan="4" class="setup-sub">${message}</td></tr>
      `;
    }
    if (mobileList) {
      mobileList.innerHTML = `
        <article class="m-card"><div class="setup-sub">${message}</div></article>
      `;
    }
  }

  function renderLoadingState() {
    renderEmptyState("Loading attendance...");
  }

  function getActiveEnrollments() {
    return state.enrollments.filter(item => item.is_active !== false);
  }

  function getAttendanceForStudent(studentId) {
    const numericStudentId = Number(studentId);
    return state.attendance.filter(item => Number(item.student) === numericStudentId);
  }

  function getOriginalStatus(studentId) {
    const records = getAttendanceForStudent(studentId)
      .filter(item => item.date === state.selectedDate)
      .sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
    if (!records.length) return "";
    return normalizeStatus(records[0].status);
  }

  function getCurrentStatus(studentId) {
    const key = String(studentId);
    if (state.pendingStatuses.has(key)) {
      return state.pendingStatuses.get(key) || "";
    }
    return getOriginalStatus(studentId);
  }

  function getPreviousRecords(studentId, limit = 2) {
    const seenDates = new Set();
    const sorted = getAttendanceForStudent(studentId)
      .filter(item => item.date && item.date !== state.selectedDate)
      .sort((a, b) => {
        if (a.date === b.date) return Number(b.id || 0) - Number(a.id || 0);
        return a.date < b.date ? 1 : -1;
      });

    const records = [];
    sorted.forEach(item => {
      if (records.length >= limit) return;
      if (seenDates.has(item.date)) return;
      seenDates.add(item.date);
      records.push(item);
    });
    return records;
  }

  function getAttendanceRate(studentId) {
    const records = getAttendanceForStudent(studentId);
    if (!records.length) {
      return {
        text: "--",
        className: "badge-gray",
      };
    }

    const presentCount = records.filter(item => normalizeStatus(item.status) === "PRESENT").length;
    const percent = Math.round((presentCount / records.length) * 100);
    let className = "badge-red";
    if (percent >= 90) className = "badge-green";
    else if (percent >= 75) className = "badge-amber";

    return {
      text: `${percent}%`,
      className,
    };
  }

  function renderStatusButtons(studentId, currentStatus) {
    return `
      <div class="att-status">
        ${STATUS_CODES.map(statusCode => `
          <button
            type="button"
            class="att-btn ${STATUS_BTN_CLASS[statusCode]} ${currentStatus === statusCode ? STATUS_ACTIVE_CLASS[statusCode] : ""}"
            data-action="at-set-status"
            data-student-id="${studentId}"
            data-status="${statusCode}"
          >
            ${STATUS_SHORT[statusCode]}
          </button>
        `).join("")}
      </div>
    `;
  }

  function renderPreviousBadges(studentId) {
    const previous = getPreviousRecords(studentId);
    if (!previous.length) return `<span class="muted">-</span>`;

    return `
      <div class="past-att">
        ${previous.map(item => {
          const status = normalizeStatus(item.status);
          const short = STATUS_SHORT[status] || "?";
          const badgeClass = STATUS_BADGE_CLASS[status] || "badge-gray";
          return `<span class="badge ${badgeClass}" title="${formatDateLabel(item.date)}">${short}</span>`;
        }).join("")}
      </div>
    `;
  }

  function renderAttendanceTable() {
    updateDateHeader();

    if (!state.selectedSchedule) {
      renderEmptyState("Please select a schedule.");
      return;
    }
    if (!state.selectedDate) {
      renderEmptyState("Please select a date.");
      return;
    }

    const enrollments = getActiveEnrollments();
    if (!enrollments.length) {
      renderEmptyState("No students found for this schedule.");
      return;
    }

    const tableBody = getEl("attendance-table-body");
    if (!tableBody) return;

    tableBody.innerHTML = enrollments
      .map(item => {
        const currentStatus = getCurrentStatus(item.student);
        const rate = getAttendanceRate(item.student);
        return `
          <tr>
            <td>${item.student_name || "Student"}</td>
            <td>${renderPreviousBadges(item.student)}</td>
            <td>${renderStatusButtons(item.student, currentStatus)}</td>
            <td><span class="badge ${rate.className}">${rate.text}</span></td>
          </tr>
        `;
      })
      .join("");
  }

  function renderAttendanceMobile() {
    if (!state.selectedSchedule) {
      renderEmptyState("Please select a schedule.");
      return;
    }
    if (!state.selectedDate) {
      renderEmptyState("Please select a date.");
      return;
    }

    const enrollments = getActiveEnrollments();
    if (!enrollments.length) {
      renderEmptyState("No students found for this schedule.");
      return;
    }

    const mobileList = getEl("attendance-mobile-list");
    if (!mobileList) return;

    const selectedDateLabel = formatDateLabel(state.selectedDate);
    mobileList.innerHTML = enrollments
      .map(item => {
        const currentStatus = getCurrentStatus(item.student);
        const rate = getAttendanceRate(item.student);
        return `
          <article class="m-card">
            <div class="m-card-row">
              <div>
                <div class="m-card-title">${item.student_name || "Student"}</div>
                ${renderPreviousBadges(item.student)}
              </div>
              <span class="badge ${rate.className}">${rate.text}</span>
            </div>
            <div class="today-att">
              <div class="today-label">${selectedDateLabel}</div>
              ${renderStatusButtons(item.student, currentStatus)}
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderAttendance() {
    renderAttendanceTable();
    renderAttendanceMobile();
    setSaveButtonState();
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

  function renderScheduleOptions() {
    const scheduleSelect = getEl("attendance-schedule-filter");
    if (!scheduleSelect) return;

    if (!state.schedules.length) {
      scheduleSelect.innerHTML = `<option value="">No schedules yet</option>`;
      state.selectedSchedule = "";
      return;
    }

    scheduleSelect.innerHTML = `
      <option value="">Select schedule</option>
      ${state.schedules.map(item => `
        <option value="${item.id}">
          ${item.subject_name} - ${item.section_name} (${item.day || "-"})
        </option>
      `).join("")}
    `;

    if (state.selectedSchedule && state.schedules.some(item => String(item.id) === String(state.selectedSchedule))) {
      scheduleSelect.value = String(state.selectedSchedule);
      return;
    }

    state.selectedSchedule = String(state.schedules[0].id);
    scheduleSelect.value = state.selectedSchedule;
  }

  async function loadSchedules() {
    state.schedules = await fetchList("/api/schedules/", "Failed to load schedules.");
    renderScheduleOptions();
  }

  async function refreshAttendancePageData() {
    if (state.isLoading) return;
    state.isLoading = true;
    try {
      await loadSchedules();
      await loadAttendanceData();
    } finally {
      state.isLoading = false;
    }
  }

  async function loadAttendanceData() {
    state.pendingStatuses.clear();
    setSaveButtonState();

    if (!state.selectedSchedule) {
      state.enrollments = [];
      state.attendance = [];
      renderAttendance();
      return;
    }
    if (!state.selectedDate) {
      state.enrollments = [];
      state.attendance = [];
      renderAttendance();
      return;
    }

    renderLoadingState();

    try {
      const [enrollments, attendance] = await Promise.all([
        fetchList(
          `/api/student-enrollments/?schedule=${encodeURIComponent(state.selectedSchedule)}`,
          "Failed to load students."
        ),
        fetchList(
          `/api/attendance/?schedule=${encodeURIComponent(state.selectedSchedule)}`,
          "Failed to load attendance."
        ),
      ]);
      state.enrollments = enrollments;
      state.attendance = attendance.map(item => ({
        ...item,
        status: normalizeStatus(item.status),
      }));
      renderAttendance();
    } catch (err) {
      state.enrollments = [];
      state.attendance = [];
      renderEmptyState(err.message || "Failed to load attendance.");
      showFeedback(err.message || "Failed to load attendance.", true);
    }
  }

  async function saveAttendance() {
    if (!state.selectedSchedule) {
      showFeedback("Please select a schedule.", true);
      return;
    }
    if (!state.selectedDate) {
      showFeedback("Please select a date.", true);
      return;
    }
    if (!state.pendingStatuses.size) {
      return;
    }

    const items = Array.from(state.pendingStatuses.entries()).map(([studentId, status]) => ({
      student: Number(studentId),
      schedule: Number(state.selectedSchedule),
      date: state.selectedDate,
      status,
    }));

    setSaveButtonState(true);
    try {
      await sendJson(
        "/api/attendance/bulk-save/",
        "POST",
        { items },
        "Failed to save attendance."
      );
      showFeedback("Attendance saved.");
      await loadAttendanceData();
      if (events) {
        events.invalidate("attendance");
        events.emit("attendance:changed");
      }
    } catch (err) {
      showFeedback(err.message || "Failed to save attendance.", true);
      setSaveButtonState(false);
    }
  }

  function applyStudentStatus(studentId, status) {
    const key = String(studentId);
    const normalizedStatus = normalizeStatus(status);
    if (!normalizedStatus) {
      showFeedback("Invalid attendance status.", true);
      return;
    }

    const originalStatus = getOriginalStatus(studentId);
    if (normalizedStatus === originalStatus) {
      state.pendingStatuses.delete(key);
    } else {
      state.pendingStatuses.set(key, normalizedStatus);
    }

    renderAttendance();
  }

  function handleAction(actionEl) {
    const action = actionEl.dataset.action;
    if (action === "at-save-attendance") {
      saveAttendance();
      return;
    }

    if (action === "at-set-status") {
      if (!state.selectedSchedule) {
        showFeedback("Please select a schedule.", true);
        return;
      }
      if (!state.selectedDate) {
        showFeedback("Please select a date.", true);
        return;
      }
      const studentId = Number(actionEl.dataset.studentId || "0");
      const status = actionEl.dataset.status;
      if (!studentId) return;
      applyStudentStatus(studentId, status);
    }
  }

  function setupFilterHandlers() {
    const scheduleSelect = getEl("attendance-schedule-filter");
    const dateInput = getEl("attendance-date-filter");

    if (scheduleSelect) {
      scheduleSelect.addEventListener("change", () => {
        state.selectedSchedule = String(scheduleSelect.value || "");
        loadAttendanceData();
      });
    }

    if (dateInput) {
      dateInput.addEventListener("change", () => {
        state.selectedDate = String(dateInput.value || "");
        loadAttendanceData();
      });
    }
  }

  async function initAttendancePage() {
    const page = getEl("page-attendance");
    if (!page) return;

    const dateInput = getEl("attendance-date-filter");
    state.selectedDate = todayIsoDate();
    if (dateInput) dateInput.value = state.selectedDate;
    updateDateHeader();
    setSaveButtonState();

    document.addEventListener("click", event => {
      const actionEl = event.target.closest("[data-action]");
      if (!actionEl) return;
      if (!String(actionEl.dataset.action || "").startsWith("at-")) return;
      handleAction(actionEl);
    });

    setupFilterHandlers();
    const refreshDebounced = events?.debounce?.(
      () => refreshAttendancePageData().catch(err => {
        renderEmptyState(err.message || "Failed to load attendance.");
        showFeedback(err.message || "Failed to load attendance.", true);
      }),
      220
    );
    if (events && refreshDebounced) {
      events.on("schedules:changed", refreshDebounced);
      events.on("enrollments:changed", refreshDebounced);
      events.on("students:changed", refreshDebounced);
      events.on("attendance:changed", refreshDebounced);
      events.on("dashboard:page-activated", event => {
        if (event.detail?.page !== "attendance") return;
        if (events.isInvalid("schedules") || events.isInvalid("enrollments") || events.isInvalid("students") || events.isInvalid("attendance")) {
          events.clearInvalid("schedules");
          events.clearInvalid("enrollments");
          events.clearInvalid("students");
          events.clearInvalid("attendance");
          refreshDebounced();
        }
      });
    }

    const attendanceNavButtons = document.querySelectorAll('[data-page-target="attendance"]');
    attendanceNavButtons.forEach(button => {
      button.addEventListener("click", () => {
        refreshAttendancePageData().catch(err => {
          renderEmptyState(err.message || "Failed to load attendance.");
          showFeedback(err.message || "Failed to load attendance.", true);
        });
      });
    });

    try {
      await refreshAttendancePageData();
      window.EduTrackModules = window.EduTrackModules || {};
      window.EduTrackModules.attendance = {
        refreshAll: refreshAttendancePageData,
      };
    } catch (err) {
      renderEmptyState(err.message || "Failed to load attendance.");
      showFeedback(err.message || "Failed to load attendance.", true);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initAttendancePage();
  });
})();
