const REFRESH_STORAGE_KEY = "gd_refresh";

let accessToken = null;
let refreshPromise = null;

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
    localStorage.setItem(REFRESH_STORAGE_KEY, refresh);
  } else {
    localStorage.removeItem(REFRESH_STORAGE_KEY);
  }
}

function clearTokens() {
  setAccessToken(null);
  localStorage.removeItem(REFRESH_STORAGE_KEY);
}

function getRefreshToken() {
  return localStorage.getItem(REFRESH_STORAGE_KEY);
}

function hardRedirectLogin() {
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
});
