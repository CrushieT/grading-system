(() => {
  const REFRESH_STORAGE_KEY = "gd_refresh";
  let accessToken = null;
  let refreshPromise = null;
  let isRedirectingToLogin = false;

  function getEl(id) {
    return document.getElementById(id);
  }

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

  function showFeedback(message, isError = false) {
    const el = getEl("grades-feedback");
    if (!el) return;
    el.textContent = message;
    el.hidden = !message;
    el.classList.toggle("error", isError);
  }

  function format(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "--";
    return num.toFixed(2).replace(/\.00$/, "");
  }

  function readFilters() {
    return {
      schedule: String(getEl("grades-schedule-filter")?.value || ""),
      gradePeriod: String(getEl("grades-period-filter")?.value || ""),
    };
  }

  function renderAttendanceSummary(data) {
    const attendanceEl = getEl("rr-class-attendance");
    if (attendanceEl) attendanceEl.textContent = `${format(data.class_attendance_percentage)}%`;
  }

  async function loadReports() {
    const { schedule } = readFilters();

    if (!schedule) {
      const attendanceEl = getEl("rr-class-attendance");
      if (attendanceEl) attendanceEl.textContent = "--";
      return;
    }

    try {
      const attRes = await authFetch(`/api/reports/attendance-summary/?schedule=${encodeURIComponent(schedule)}`, { method: "GET" });
      const attPayload = await safeJson(attRes);
      if (!attRes.ok) throw new Error(attPayload.detail || "Failed to load reports.");
      renderAttendanceSummary(attPayload);
    } catch (err) {
      const attendanceEl = getEl("rr-class-attendance");
      if (attendanceEl) attendanceEl.textContent = "--";
      showFeedback(err.message || "Failed to load reports.", true);
    }
  }

  function initRecordsReports() {
    if (!getEl("page-grades")) return;
    const schedule = getEl("grades-schedule-filter");
    const period = getEl("grades-period-filter");
    if (schedule) schedule.addEventListener("change", loadReports);
    if (period) period.addEventListener("change", loadReports);
  }

  document.addEventListener("DOMContentLoaded", initRecordsReports);
})();
