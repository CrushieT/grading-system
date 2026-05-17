const REFRESH_STORAGE_KEY = "gd_refresh";

let accessToken = null;
let refreshPromise = null;

const viewLogin = document.getElementById("view-login");
const viewRegister = document.getElementById("view-register");
const regFooter = document.getElementById("reg-footer");

const regStep1 = document.getElementById("reg-step-1");
const regStep2 = document.getElementById("reg-step-2");
const regStep3 = document.getElementById("reg-step-3");

const loginSubmit = document.getElementById("login-submit");
const regNext2 = document.getElementById("reg-next-2");

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

async function safeJson(response) {
  try {
    return await response.json();
  } catch (_err) {
    return {};
  }
}

function readApiError(payload, fallback) {
  if (!payload || typeof payload !== "object") return fallback;

  if (typeof payload.detail === "string" && payload.detail.trim()) {
    return payload.detail;
  }
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message;
  }

  const firstError = Object.values(payload).find(value => {
    if (typeof value === "string") return value.trim();
    if (Array.isArray(value) && value.length) return true;
    return false;
  });

  if (typeof firstError === "string" && firstError.trim()) return firstError;
  if (Array.isArray(firstError) && firstError.length) return String(firstError[0]);

  return fallback;
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

  const token = await refreshPromise;
  refreshPromise = null;
  return token;
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
    } else {
      clearTokens();
    }
  }

  return response;
}

function showLogin() {
  viewLogin.hidden = false;
  viewRegister.hidden = true;
  document.title = "GradeDesk - Sign In";
}

function showRegister() {
  viewLogin.hidden = true;
  viewRegister.hidden = false;
  document.title = "GradeDesk - Create Account";
  goToStep(1);
}

function goToStep(n) {
  regStep1.hidden = n !== 1;
  regStep2.hidden = n !== 2;
  regStep3.hidden = n !== 3;
  regFooter.hidden = n === 3;
  updateStepDots(n);
}

function updateStepDots(n) {
  const dots = [
    document.getElementById("step-dot-1"),
    document.getElementById("step-dot-2"),
    document.getElementById("step-dot-3"),
  ];
  const lines = document.querySelectorAll(".step-line");

  dots.forEach((dot, i) => {
    dot.classList.remove("active", "done");
    if (i + 1 < n) dot.classList.add("done");
    if (i + 1 === n) dot.classList.add("active");
  });

  lines.forEach((line, i) => {
    line.classList.toggle("done", i + 1 < n);
  });
}

function setError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;

  const input = el.closest(".form-group")?.querySelector("input, select");
  if (input) input.classList.toggle("error", !!msg);
}

function clearError(id) {
  setError(id, "");
}

function hideBanner(id) {
  const el = document.getElementById(id);
  if (el) el.hidden = true;
}

function showBanner(id, msgId, msg) {
  const banner = document.getElementById(id);
  const text = document.getElementById(msgId);
  if (!banner || !text) return;
  text.textContent = msg;
  banner.hidden = false;
}

function setButtonLoading(btn, loading) {
  const label = btn.querySelector(".btn-label");
  const spinner = btn.querySelector(".btn-spinner");
  btn.disabled = loading;
  if (label) label.hidden = loading;
  if (spinner) spinner.hidden = !loading;
}

function isEmpty(value) {
  return value.trim() === "";
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function attachLiveClear(inputId, errorId) {
  const el = document.getElementById(inputId);
  if (!el) return;
  el.addEventListener("input", () => clearError(errorId));
  el.addEventListener("change", () => clearError(errorId));
}

function attachEyeToggleHandlers() {
  document.querySelectorAll(".eye-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      btn.classList.toggle("is-visible", isPassword);
      btn.setAttribute("aria-pressed", isPassword ? "true" : "false");
    });
  });
}

function setupAuthViewHandlers() {
  document.getElementById("goto-register").addEventListener("click", showRegister);
  document.getElementById("goto-login").addEventListener("click", showLogin);
  document.getElementById("goto-login-final").addEventListener("click", showLogin);

  const forgotBtn = document.getElementById("forgot-btn");
  if (forgotBtn) {
    forgotBtn.addEventListener("click", () => {
      showBanner(
        "login-banner",
        "login-banner-msg",
        "Password reset is not connected yet. Please contact your administrator."
      );
    });
  }
}

function setupStepOneValidation() {
  document.getElementById("reg-next-1").addEventListener("click", () => {
    const fname = document.getElementById("reg-fname").value;
    const lname = document.getElementById("reg-lname").value;
    const email = document.getElementById("reg-email").value;
    const password = document.getElementById("reg-password").value;
    const confirm = document.getElementById("reg-confirm").value;

    let valid = true;

    if (isEmpty(fname)) {
      setError("err-reg-fname", "Required.");
      valid = false;
    } else {
      clearError("err-reg-fname");
    }

    if (isEmpty(lname)) {
      setError("err-reg-lname", "Required.");
      valid = false;
    } else {
      clearError("err-reg-lname");
    }

    if (isEmpty(email)) {
      setError("err-reg-email", "Email is required.");
      valid = false;
    } else if (!isValidEmail(email)) {
      setError("err-reg-email", "Enter a valid email address.");
      valid = false;
    } else {
      clearError("err-reg-email");
    }

    if (password.length < 8) {
      setError("err-reg-password", "Must be at least 8 characters.");
      valid = false;
    } else {
      clearError("err-reg-password");
    }

    if (isEmpty(confirm)) {
      setError("err-reg-confirm", "Please confirm your password.");
      valid = false;
    } else if (confirm !== password) {
      setError("err-reg-confirm", "Passwords do not match.");
      valid = false;
    } else {
      clearError("err-reg-confirm");
    }

    if (valid) goToStep(2);
  });

  document.getElementById("reg-back-1").addEventListener("click", () => {
    goToStep(1);
  });
}

function setupLoginSubmission() {
  loginSubmit.addEventListener("click", async () => {
    hideBanner("login-banner");

    const loginId = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value.trim();
    let valid = true;

    if (isEmpty(loginId)) {
      setError("err-login-email", "Username or email is required.");
      valid = false;
    } else {
      clearError("err-login-email");
    }

    if (isEmpty(password)) {
      setError("err-login-password", "Password is required.");
      valid = false;
    } else {
      clearError("err-login-password");
    }

    if (!valid) return;

    setButtonLoading(loginSubmit, true);

    try {
      const response = await fetch("/api/auth/login/", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: loginId,
          password,
        }),
      });

      const data = await safeJson(response);
      if (!response.ok) {
        showBanner(
          "login-banner",
          "login-banner-msg",
          readApiError(data, "Invalid username/email or password.")
        );
        return;
      }

      setAccessToken(data.access);
      setRefreshToken(data.refresh);
      window.location.replace("/dashboard.html");
    } catch (_err) {
      showBanner("login-banner", "login-banner-msg", "Could not connect. Try again.");
    } finally {
      setButtonLoading(loginSubmit, false);
    }
  });

  document.getElementById("login-password").addEventListener("keydown", event => {
    if (event.key === "Enter") loginSubmit.click();
  });
}

function setupRegistrationSubmission() {
  regNext2.addEventListener("click", async () => {
    hideBanner("reg-banner");

    const firstName = document.getElementById("reg-fname").value.trim();
    const lastName = document.getElementById("reg-lname").value.trim();
    const email = document.getElementById("reg-email").value.trim();
    const password = document.getElementById("reg-password").value;
    const confirmPassword = document.getElementById("reg-confirm").value;
    const school = document.getElementById("reg-school-name").value.trim();
    const yearStart = parseInt(document.getElementById("reg-year-start").value, 10);
    const yearEnd = parseInt(document.getElementById("reg-year-end").value, 10);
    const semester = document.getElementById("reg-semester").value;
    const grading = document.getElementById("reg-grading").value;

    let valid = true;

    if (isEmpty(school)) {
      setError("err-reg-school", "School name is required.");
      valid = false;
    } else {
      clearError("err-reg-school");
    }

    if (!yearStart || yearStart < 2000) {
      setError("err-reg-year-start", "Enter a valid year.");
      valid = false;
    } else {
      clearError("err-reg-year-start");
    }

    if (!yearEnd || yearEnd <= yearStart) {
      setError("err-reg-year-end", "Must be after start year.");
      valid = false;
    } else {
      clearError("err-reg-year-end");
    }

    if (!semester) {
      setError("err-reg-sem", "Select a semester.");
      valid = false;
    } else {
      clearError("err-reg-sem");
    }

    if (!valid) return;

    setButtonLoading(regNext2, true);

    try {
      const response = await fetch("/api/auth/register/", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          password,
          confirm_password: confirmPassword,
          school_name: school,
          year_start: yearStart,
          year_end: yearEnd,
          semester,
          grading,
        }),
      });

      const data = await safeJson(response);
      if (!response.ok) {
        showBanner(
          "reg-banner",
          "reg-banner-msg",
          readApiError(data, "Registration failed. Please try again.")
        );
        return;
      }

      setAccessToken(data.access);
      setRefreshToken(data.refresh);
      goToStep(3);
      setTimeout(() => {
        window.location.replace("/dashboard.html");
      }, 700);
    } catch (_err) {
      showBanner("reg-banner", "reg-banner-msg", "Could not connect. Try again.");
    } finally {
      setButtonLoading(regNext2, false);
    }
  });
}

async function redirectIfAuthenticated() {
  const hasRefresh = !!getRefreshToken();
  const hasAccess = !!accessToken;
  if (!hasAccess && !hasRefresh) return false;

  const response = await authFetch("/api/auth/me/", { method: "GET" });
  if (!response.ok) {
    clearTokens();
    return false;
  }

  window.location.replace("/dashboard.html");
  return true;
}

function setupBackForwardProtection() {
  history.replaceState({ page: "login" }, "", "/login.html");

  window.addEventListener("pageshow", async () => {
    const redirected = await redirectIfAuthenticated();
    if (!redirected) showLogin();
  });
}

async function init() {
  attachEyeToggleHandlers();
  setupAuthViewHandlers();
  setupStepOneValidation();
  setupLoginSubmission();
  setupRegistrationSubmission();

  attachLiveClear("login-email", "err-login-email");
  attachLiveClear("login-password", "err-login-password");
  attachLiveClear("reg-fname", "err-reg-fname");
  attachLiveClear("reg-lname", "err-reg-lname");
  attachLiveClear("reg-email", "err-reg-email");
  attachLiveClear("reg-password", "err-reg-password");
  attachLiveClear("reg-confirm", "err-reg-confirm");
  attachLiveClear("reg-school-name", "err-reg-school");
  attachLiveClear("reg-year-start", "err-reg-year-start");
  attachLiveClear("reg-year-end", "err-reg-year-end");
  attachLiveClear("reg-semester", "err-reg-sem");

  setupBackForwardProtection();

  const alreadyAuthenticated = await redirectIfAuthenticated();
  if (alreadyAuthenticated) return;

  if (window.location.hash === "#register") {
    showRegister();
  } else {
    showLogin();
  }
}

document.addEventListener("DOMContentLoaded", init);
