const REFRESH_STORAGE_KEY = "gd_refresh";

let accessToken = null;
let refreshPromise = null;
let isRedirectingToLogin = false;

const pageTitles = {
  dashboard: "Dashboard",
  schedules: "Schedules",
  students: "Students",
  assessments: "Assessments",
  attendance: "Attendance",
  grades: "Grades",
  setup: "School Setup",
  settings: "Settings",
};

window.dashboardPageHandlers = window.dashboardPageHandlers || {};

function getPageHandler(name) {
  const handler = window.dashboardPageHandlers[name];
  return typeof handler === "function" ? handler : null;
}

function setAccessToken(access) {
  accessToken = access || null;
}

function setRefreshToken(refresh) {
  if (refresh) {
    sessionStorage.setItem(REFRESH_STORAGE_KEY, refresh);
    localStorage.removeItem(REFRESH_STORAGE_KEY);
  } else {
    sessionStorage.removeItem(REFRESH_STORAGE_KEY);
    localStorage.removeItem(REFRESH_STORAGE_KEY);
  }
}

function clearTokens() {
  setAccessToken(null);
  sessionStorage.removeItem(REFRESH_STORAGE_KEY);
  localStorage.removeItem(REFRESH_STORAGE_KEY);
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

      if (!response.ok) {
        clearTokens();
        return null;
      }

      const data = await safeJson(response);
      if (!data.access) {
        clearTokens();
        return null;
      }

      setAccessToken(data.access);
      setRefreshToken(data.refresh || refresh);
      return accessToken;
    } catch (_err) {
      clearTokens();
      return null;
    }
  })();

  const newAccess = await refreshPromise;
  refreshPromise = null;
  return newAccess;
}

async function ensureAccessToken() {
  if (accessToken) return accessToken;
  return refreshAccessToken();
}

async function authFetch(url, options = {}, allowRetry = true) {
  const requestOptions = { ...options };
  requestOptions.credentials = "same-origin";

  requestOptions.headers = {
    ...(options.headers || {}),
  };

  const token = await ensureAccessToken();
  if (token) {
    requestOptions.headers.Authorization = `Bearer ${token}`;
  }

  let response = await fetch(url, requestOptions);

  if (response.status === 401 && allowRetry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      requestOptions.headers.Authorization = `Bearer ${refreshed}`;
      response = await fetch(url, requestOptions);
    }
    if (!refreshed || response.status === 401) {
      clearTokens();
      hardRedirectLogin();
    }
  }

  return response;
}

function setLoadingState(isLoading) {
  const body = document.body;
  const overlay = document.getElementById("auth-overlay");

  body.classList.toggle("is-loading-auth", isLoading);
  if (overlay) overlay.hidden = !isLoading;
}

function updateUserUI(user) {
  const safeFirstName = (user.first_name || "").trim();
  const safeLastName = (user.last_name || "").trim();
  const displayName = `${safeFirstName} ${safeLastName}`.trim() || user.username || "Teacher";
  const initials = `${(safeFirstName[0] || user.username?.[0] || "T").toUpperCase()}${(safeLastName[0] || "A").toUpperCase()}`;

  const greeting = document.getElementById("dashboard-greeting");
  const chipName = document.getElementById("teacher-chip-name");
  const chipSub = document.getElementById("teacher-chip-sub");
  const chipAvatar = document.getElementById("teacher-chip-avatar");
  const topbarAvatar = document.getElementById("topbar-avatar");

  if (greeting) greeting.textContent = `Welcome back, ${safeFirstName || "Teacher"}`;
  if (chipName) chipName.textContent = displayName;
  if (chipSub) chipSub.textContent = user.email || "Signed in";
  if (chipAvatar) chipAvatar.textContent = initials;
  if (topbarAvatar) topbarAvatar.textContent = initials;
}

function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.results)) return payload.results;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

async function fetchListOrEmpty(url) {
  try {
    const response = await authFetch(url, { method: "GET" });
    const data = await safeJson(response);
    if (!response.ok) return [];
    return asArray(data);
  } catch (_err) {
    return [];
  }
}

function renderDashboardStats({ schedules, students, assessments, templates }) {
  const schedulesEl = document.getElementById("db-stat-schedules");
  const studentsEl = document.getElementById("db-stat-students");
  const assessmentsEl = document.getElementById("db-stat-assessments");
  const templatesEl = document.getElementById("db-stat-templates");

  if (schedulesEl) schedulesEl.textContent = String(schedules.length);
  if (studentsEl) studentsEl.textContent = String(students.length);
  if (assessmentsEl) assessmentsEl.textContent = String(assessments.length);
  if (templatesEl) templatesEl.textContent = String(templates.filter(item => item.is_active).length);
}

function renderScheduleList(schedules) {
  const listEl = document.getElementById("db-schedules-list");
  const badgeEl = document.getElementById("db-schedules-badge");
  if (!listEl) return;

  if (badgeEl) badgeEl.textContent = `${schedules.length} total`;

  if (!schedules.length) {
    listEl.innerHTML = '<div class="setup-sub">No schedules yet.</div>';
    return;
  }

  const dayLabels = {
    mon: "Monday",
    tue: "Tuesday",
    wed: "Wednesday",
    thu: "Thursday",
    fri: "Friday",
    sat: "Saturday",
    sun: "Sunday",
  };

  const rows = schedules.slice(0, 6).map(item => {
    const periodDisplay = item.period_display || item.period_name || "-";
    const dayDisplay = dayLabels[String(item.day || "").toLowerCase()] || String(item.day || "-").toUpperCase();
    const scheduleName = `${item.subject_name || "Subject"} - ${item.section_name || "Section"}`;
    const scheduleMeta = `${dayDisplay} • ${periodDisplay}`;
    return `
      <div class="schedule-row-accent">
        <span class="schedule-dot dot-blue"></span>
        <div class="schedule-text">
          <div class="schedule-name">${scheduleName}</div>
          <div class="schedule-meta">${scheduleMeta}</div>
        </div>
        <span class="badge badge-blue">${item.grading_template_name || "No template"}</span>
      </div>
    `;
  });

  listEl.innerHTML = rows.join("");
}

function renderAcademicSnapshot({ gradePeriods, templates, schedules, students, assessments }) {
  const wrap = document.getElementById("db-academic-snapshot");
  if (!wrap) return;

  const activePeriod = gradePeriods.find(item => item.is_active) || null;
  const defaultTemplate = templates.find(item => item.is_default && item.is_active) || null;
  const withTemplate = schedules.filter(item => !!item.grading_template).length;
  const templateCoverage = schedules.length ? `${Math.round((withTemplate / schedules.length) * 100)}%` : "0%";

  wrap.innerHTML = `
    <div class="activity-item">
      <span class="activity-dot dot-green"></span>
      <div>
        <div class="activity-text">Current grade period: <strong>${activePeriod?.name || "Not set"}</strong></div>
        <div class="activity-time">${gradePeriods.filter(item => item.is_active).length} active period(s)</div>
      </div>
    </div>
    <div class="activity-item">
      <span class="activity-dot dot-blue"></span>
      <div>
        <div class="activity-text">Default grading template: <strong>${defaultTemplate?.name || "None"}</strong></div>
        <div class="activity-time">${templates.filter(item => item.is_active).length} active template(s)</div>
      </div>
    </div>
    <div class="activity-item">
      <span class="activity-dot dot-amber"></span>
      <div>
        <div class="activity-text">Schedule template coverage: <strong>${templateCoverage}</strong></div>
        <div class="activity-time">${withTemplate} of ${schedules.length} schedules assigned</div>
      </div>
    </div>
    <div class="activity-item">
      <span class="activity-dot dot-gray"></span>
      <div>
        <div class="activity-text">Data totals: <strong>${students.length} students</strong> and <strong>${assessments.length} assessments</strong></div>
        <div class="activity-time">Live counts from your account</div>
      </div>
    </div>
  `;
}

function renderNeedsAttention({ records, schedules, templates, activeGradePeriod }) {
  const wrap = document.getElementById("db-needs-attention");
  if (!wrap) return;

  const periodId = activeGradePeriod ? Number(activeGradePeriod.id) : 0;
  const currentRecords = records.filter(item => Number(item.grade_period) === periodId);
  const incompleteCount = currentRecords.filter(
    item => String(item.remarks || "").toLowerCase() === "incomplete"
  ).length;
  const failedCount = currentRecords.filter(item => Number(item.final_grade || 0) < 75).length;
  const noTemplateCount = schedules.filter(item => !item.grading_template).length;
  const inactiveTemplateCount = schedules.filter(item => item.grading_template && !item.grading_template_name).length;

  wrap.innerHTML = `
    <div class="activity-item">
      <span class="activity-dot dot-amber"></span>
      <div>
        <div class="activity-text">Incomplete records: <strong>${incompleteCount}</strong></div>
        <div class="activity-time">${activeGradePeriod?.name || "Current"} period</div>
      </div>
    </div>
    <div class="activity-item">
      <span class="activity-dot dot-red"></span>
      <div>
        <div class="activity-text">Failed records: <strong>${failedCount}</strong></div>
        <div class="activity-time">Final grade below 75</div>
      </div>
    </div>
    <div class="activity-item">
      <span class="activity-dot dot-gray"></span>
      <div>
        <div class="activity-text">Schedules without template: <strong>${noTemplateCount}</strong></div>
        <div class="activity-time">${templates.filter(item => item.is_active).length} active template(s) available</div>
      </div>
    </div>
    <div class="activity-item">
      <span class="activity-dot dot-blue"></span>
      <div>
        <div class="activity-text">Template display mismatch: <strong>${inactiveTemplateCount}</strong></div>
        <div class="activity-time">Check schedule-template assignments</div>
      </div>
    </div>
  `;
}

function getWeekdayCodeToday() {
  const jsDay = new Date().getDay();
  const map = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return map[jsDay] || "mon";
}

function renderTodayClasses(schedules) {
  const wrap = document.getElementById("db-today-classes");
  if (!wrap) return;

  const todayCode = getWeekdayCodeToday();
  const todayList = schedules
    .filter(item => String(item.day || "").toLowerCase() === todayCode)
    .sort((a, b) => String(a.period_time || "").localeCompare(String(b.period_time || "")));

  if (!todayList.length) {
    wrap.innerHTML = '<div class="setup-sub">No classes scheduled for today.</div>';
    return;
  }

  wrap.innerHTML = todayList
    .slice(0, 8)
    .map(item => {
      const label = `${item.subject_name || "Subject"} - ${item.section_name || "Section"}`;
      return `
      <div class="schedule-row-accent">
        <span class="schedule-dot dot-green"></span>
        <div class="schedule-text">
          <div class="schedule-name">${label}</div>
          <div class="schedule-meta">${item.period_display || item.period_name || "-"}</div>
        </div>
        <span class="badge badge-gray">${item.day || "-"}</span>
      </div>`;
    })
    .join("");
}

function renderAssessmentProgress({ schedules, assessments, records, activeGradePeriod }) {
  const wrap = document.getElementById("db-assessment-progress");
  if (!wrap) return;

  const periodId = activeGradePeriod ? Number(activeGradePeriod.id) : 0;
  const activeAssessments = assessments.filter(item => Number(item.grade_period) === periodId);
  if (!activeAssessments.length) {
    wrap.innerHTML = '<div class="setup-sub">No assessments yet for the current grade period.</div>';
    return;
  }

  const enrollmentBySchedule = {};
  records.forEach(item => {
    if (!item.grade_period) {
      const sid = Number(item.schedule);
      enrollmentBySchedule[sid] = (enrollmentBySchedule[sid] || 0) + 1;
    }
  });

  const grouped = {};
  activeAssessments.forEach(item => {
    const sid = Number(item.schedule);
    if (!grouped[sid]) grouped[sid] = [];
    grouped[sid].push(item);
  });

  const rows = Object.keys(grouped)
    .map(key => {
      const sid = Number(key);
      const schedule = schedules.find(item => Number(item.id) === sid);
      const items = grouped[sid];
      const total = items.length;
      const entered = items.reduce((acc, cur) => acc + Number(cur.submitted_count || 0), 0);
      const enrolled = enrollmentBySchedule[sid] || 0;
      const denominator = enrolled > 0 ? enrolled * total : 0;
      const percent = denominator > 0 ? Math.round((entered / denominator) * 100) : 0;
      return {
        sid,
        label: schedule
          ? `${schedule.subject_name || "Subject"} - ${schedule.section_name || "Section"}`
          : `Schedule #${sid}`,
        total,
        enrolled,
        entered,
        percent,
      };
    })
    .sort((a, b) => a.percent - b.percent)
    .slice(0, 8);

  wrap.innerHTML = rows
    .map(row => {
      return `
      <div class="activity-item">
        <span class="activity-dot dot-blue"></span>
        <div>
          <div class="activity-text">${row.label}</div>
          <div class="activity-time">${row.total} assessment(s), ${row.entered} score entries, ${row.percent}% completion</div>
        </div>
      </div>`;
    })
    .join("");
}

async function loadDashboardOverview() {
  const [schedules, students, assessments, templates, gradePeriods, records] = await Promise.all([
    fetchListOrEmpty("/api/schedules/"),
    fetchListOrEmpty("/api/students/"),
    fetchListOrEmpty("/api/assessments/"),
    fetchListOrEmpty("/api/grading-templates/"),
    fetchListOrEmpty("/api/grade-periods/"),
    fetchListOrEmpty("/api/records/"),
  ]);
  const activeGradePeriod = gradePeriods.find(item => item.is_active) || null;

  renderDashboardStats({ schedules, students, assessments, templates });
  renderScheduleList(schedules);
  renderAcademicSnapshot({ gradePeriods, templates, schedules, students, assessments });
  renderNeedsAttention({ records, schedules, templates, activeGradePeriod });
  renderTodayClasses(schedules);
  renderAssessmentProgress({ schedules, assessments, records, activeGradePeriod });
}

function setActivePage(pageId) {
  document.querySelectorAll(".page").forEach(page => {
    page.classList.toggle("active", page.id === `page-${pageId}`);
  });

  document.querySelectorAll(".nav-item[data-page-target]").forEach(button => {
    button.classList.toggle("active", button.dataset.pageTarget === pageId);
  });

  document.querySelectorAll(".bnav-item[data-page-target]").forEach(button => {
    button.classList.toggle("active", button.dataset.pageTarget === pageId);
  });

  const title = document.getElementById("topbar-title");
  if (title) title.textContent = pageTitles[pageId] || "Dashboard";

  if (window.EduTrackEvents?.emit) {
    window.EduTrackEvents.emit("dashboard:page-activated", { page: pageId });
  }
}

function closeSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  if (sidebar) sidebar.classList.remove("open");
  if (overlay) overlay.classList.remove("open");
}

function openSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  if (sidebar) sidebar.classList.add("open");
  if (overlay) overlay.classList.add("open");
}

function openLogoutModal() {
  const modal = document.getElementById("logout-modal");
  if (modal) modal.hidden = false;
}

function closeLogoutModal() {
  const modal = document.getElementById("logout-modal");
  if (modal) modal.hidden = true;
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.hidden = false;
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.hidden = true;
}

function showSuccessModal(message, title = "Success") {
  const titleEl = document.getElementById("success-modal-title");
  const messageEl = document.getElementById("success-modal-message");
  if (titleEl) titleEl.textContent = title;
  if (messageEl) messageEl.textContent = message || "Action completed successfully.";
  openModal("success-modal");
}

function updateWeightTotal() {
  const inputs = document.querySelectorAll("#modal-template input[data-action='update-weight-total']");
  const totalEl = document.getElementById("weight-total-val");
  const total = Array.from(inputs).reduce((sum, input) => sum + (parseInt(input.value || "0", 10) || 0), 0);

  if (!totalEl) return;
  totalEl.textContent = `${total}%`;
  totalEl.classList.toggle("value-red", total !== 100);
  totalEl.classList.toggle("value-green", total === 100);
}

async function performLogout() {
  const confirmButton = document.getElementById("confirm-logout-btn");
  if (confirmButton) confirmButton.disabled = true;

  try {
    await fetch("/api/auth/logout/", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ refresh: getRefreshToken() }),
    });
  } catch (_err) {
    // Ignore network failure and continue local logout.
  }

  clearTokens();
  hardRedirectLogin();
}

function setupUIEvents() {
  document.querySelectorAll("[data-page-target]").forEach(button => {
    button.addEventListener("click", () => {
      setActivePage(button.dataset.pageTarget);
      closeSidebar();
    });
  });

  document.querySelectorAll("[data-action='open-sidebar']").forEach(button => {
    button.addEventListener("click", openSidebar);
  });

  document.querySelectorAll("[data-action='close-sidebar']").forEach(button => {
    button.addEventListener("click", closeSidebar);
  });

  document.querySelectorAll("[data-action='open-logout']").forEach(button => {
    button.addEventListener("click", openLogoutModal);
  });

  document.querySelectorAll("[data-action='cancel-logout']").forEach(button => {
    button.addEventListener("click", closeLogoutModal);
  });

  const confirmLogout = document.getElementById("confirm-logout-btn");
  if (confirmLogout) {
    confirmLogout.addEventListener("click", performLogout);
  }

  document.addEventListener("click", event => {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) return;

    const { action } = actionEl.dataset;
    if (action === "open-modal") {
      openModal(actionEl.dataset.modalTarget);
    }
    if (action === "close-modal") {
      closeModal(actionEl.dataset.modalTarget);
    }
    if (action === "open-scores") {
      const openScores = getPageHandler("openScoresModal");
      if (openScores) openScores(actionEl.dataset.assessment, parseInt(actionEl.dataset.maxScore || "50", 10));
    }
    if (action === "open-student-view") {
      const openStudent = getPageHandler("openStudentView");
      if (openStudent) {
        openStudent(
          actionEl.dataset.name,
          actionEl.dataset.initials,
          actionEl.dataset.color,
          actionEl.dataset.avg,
          actionEl.dataset.attendance,
          actionEl.dataset.schedules
        );
      }
    }
    if (action === "set-att") {
      const setAttendance = getPageHandler("setAttendanceState");
      if (setAttendance) setAttendance(actionEl, actionEl.dataset.attState);
    }
    if (action === "switch-tab") {
      const switchGradeTab = getPageHandler("switchGradeTab");
      if (switchGradeTab) switchGradeTab(actionEl.dataset.tabTarget, actionEl);
    }
  });

  document.querySelectorAll(".modal-overlay").forEach(modal => {
    modal.addEventListener("click", event => {
      if (event.target !== modal) return;
      if (modal.id === "logout-modal") return;
      modal.hidden = true;
    });
  });

  document.querySelectorAll("#modal-template input[data-action='update-weight-total']").forEach(input => {
    input.addEventListener("input", updateWeightTotal);
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeLogoutModal();
      closeSidebar();
      document.querySelectorAll(".modal-overlay").forEach(modal => {
        if (modal.id !== "logout-modal") modal.hidden = true;
      });
    }
  });
}

async function guardDashboard() {
  const hasRefresh = !!getRefreshToken();
  const hasAccess = !!accessToken;

  if (!hasAccess && !hasRefresh) {
    hardRedirectLogin();
    return;
  }

  const response = await authFetch("/api/auth/me/", { method: "GET" });
  if (!response.ok) {
    clearTokens();
    hardRedirectLogin();
    return;
  }

  const data = await safeJson(response);
  updateUserUI(data.user || {});
  setLoadingState(false);
}

window.authFetch = authFetch;
window.safeJson = safeJson;
window.updateUserUI = updateUserUI;
window.showSuccessModal = showSuccessModal;

function setupBackForwardProtection() {
  history.replaceState({ page: "dashboard" }, "", "/dashboard.html");

  window.addEventListener("pageshow", () => {
    const hasAnyToken = !!accessToken || !!getRefreshToken();
    if (!hasAnyToken) {
      hardRedirectLogin();
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  setupUIEvents();
  updateWeightTotal();
  setupBackForwardProtection();
  await guardDashboard();
  await loadDashboardOverview();

  if (window.EduTrackEvents?.on) {
    const reload = () => {
      loadDashboardOverview();
    };
    window.EduTrackEvents.on("schedules:changed", reload);
    window.EduTrackEvents.on("students:changed", reload);
    window.EduTrackEvents.on("assessments:changed", reload);
    window.EduTrackEvents.on("grading-templates:changed", reload);
    window.EduTrackEvents.on("school-setup:changed", reload);
    window.EduTrackEvents.on("dashboard:page-activated", event => {
      if (event?.detail?.page !== "dashboard") return;
      loadDashboardOverview();
    });
  }
});
