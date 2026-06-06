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
const REG_NAME_MAX_LENGTH = 25;
const REG_EMAIL_MAX_LENGTH = 50;
const REG_SCHOOL_MAX_LENGTH = 50;

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
  resetAuthBanners();
}

function showRegister() {
  viewLogin.hidden = true;
  viewRegister.hidden = false;
  document.title = "GradeDesk - Create Account";
  resetAuthBanners();
  goToStep(1);
}

function goToStep(n) {
  regStep1.hidden = n !== 1;
  regStep2.hidden = n !== 2;
  regStep3.hidden = n !== 3;
  regFooter.hidden = n === 3;
  if (n === 1) hideBanner("reg-banner");
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

function resetAuthBanners() {
  hideBanner("login-banner");
  hideBanner("reg-banner");
}

function setButtonLoading(btn, loading) {
  const label = btn.querySelector(".btn-label");
  const spinner = btn.querySelector(".btn-spinner");
  btn.disabled = loading;
  if (spinner) {
    if (label) label.hidden = loading;
    spinner.hidden = !loading;
  } else if (label) {
    label.hidden = false;
  }
}

function isEmpty(value) {
  return value.trim() === "";
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidName(value) {
  return /^[A-Za-z][A-Za-z\s'.-]*$/.test(String(value || "").trim());
}

function trimToLength(value, maxLength) {
  return String(value || "").slice(0, maxLength);
}

function normalizeSchoolYearInput(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .slice(0, 4);
}

function clearRegisterErrors() {
  [
    "err-reg-fname",
    "err-reg-lname",
    "err-reg-email",
    "err-reg-password",
    "err-reg-confirm",
    "err-reg-school",
    "err-reg-year-start",
    "err-reg-year-end",
  ].forEach(clearError);
}

function mapRegisterApiErrors(payload) {
  if (!payload || typeof payload !== "object") return;
  const map = {
    first_name: "err-reg-fname",
    last_name: "err-reg-lname",
    email: "err-reg-email",
    password: "err-reg-password",
    confirm_password: "err-reg-confirm",
    school_name: "err-reg-school",
    year_start: "err-reg-year-start",
    year_end: "err-reg-year-end",
  };
  Object.entries(map).forEach(([key, errId]) => {
    const value = payload[key];
    if (!value) return;
    const msg = Array.isArray(value) ? String(value[0] || "") : String(value);
    if (msg) setError(errId, msg);
  });
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
  const forgotModal = document.getElementById("forgot-modal");
  const forgotModalEmail = document.getElementById("forgot-modal-email");
  const forgotModalSendBtn = document.getElementById("forgot-modal-send");
  const forgotModalCancelBtn = document.getElementById("forgot-modal-cancel");
  const forgotModalCloseBtn = document.getElementById("forgot-modal-close");

  const closeForgotModal = () => {
    if (!forgotModal) return;
    forgotModal.hidden = true;
    setError("err-forgot-modal-email", "");
  };

  const openForgotModal = () => {
    if (!forgotModal || !forgotModalEmail) return;
    hideBanner("login-banner");
    const loginEmailInput = document.getElementById("login-email");
    forgotModalEmail.value = String(loginEmailInput?.value || "").trim();
    setError("err-forgot-modal-email", "");
    forgotModal.hidden = false;
    window.setTimeout(() => forgotModalEmail.focus(), 0);
  };

  const requestPasswordReset = async () => {
    if (!forgotBtn || !forgotModalEmail || !forgotModalSendBtn) return;
    const email = forgotModalEmail.value.trim();
    setError("err-forgot-modal-email", "");

    if (isEmpty(email)) {
      setError("err-forgot-modal-email", "Email is required.");
      return;
    }
    if (!isValidEmail(email)) {
      setError("err-forgot-modal-email", "Enter a valid email address.");
      return;
    }

    forgotBtn.disabled = true;
    forgotModalSendBtn.disabled = true;
    try {
      const response = await fetch("/api/auth/password-reset/request/", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });
      const payload = await safeJson(response);
      if (!response.ok) {
        setError("err-forgot-modal-email", readApiError(payload, "Unable to request password reset."));
        return;
      }

      closeForgotModal();
      showBanner(
        "login-banner",
        "login-banner-msg",
        payload.message
          || "If an account exists for this email, a password reset link has been sent."
      );
    } catch (_err) {
      showBanner("login-banner", "login-banner-msg", "Could not connect. Try again.");
    } finally {
      forgotBtn.disabled = false;
      forgotModalSendBtn.disabled = false;
    }
  };

  if (forgotModalCancelBtn) forgotModalCancelBtn.addEventListener("click", closeForgotModal);
  if (forgotModalCloseBtn) forgotModalCloseBtn.addEventListener("click", closeForgotModal);
  if (forgotModal) {
    forgotModal.addEventListener("click", event => {
      if (event.target === forgotModal) closeForgotModal();
    });
  }
  if (forgotModalEmail) {
    forgotModalEmail.addEventListener("input", () => setError("err-forgot-modal-email", ""));
    forgotModalEmail.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        requestPasswordReset();
      }
    });
  }
  if (forgotModalSendBtn) forgotModalSendBtn.addEventListener("click", requestPasswordReset);

  if (forgotBtn) {
    forgotBtn.addEventListener("click", openForgotModal);
  }
}

function setupStepOneValidation() {
  document.getElementById("reg-next-1").addEventListener("click", () => {
    const fnameInput = document.getElementById("reg-fname");
    const lnameInput = document.getElementById("reg-lname");
    const emailInput = document.getElementById("reg-email");
    const fname = trimToLength(fnameInput.value, REG_NAME_MAX_LENGTH);
    const lname = trimToLength(lnameInput.value, REG_NAME_MAX_LENGTH);
    const email = trimToLength(emailInput.value, REG_EMAIL_MAX_LENGTH).trim();
    fnameInput.value = fname;
    lnameInput.value = lname;
    emailInput.value = email;
    const password = document.getElementById("reg-password").value;
    const confirm = document.getElementById("reg-confirm").value;

    let valid = true;

    if (isEmpty(fname)) {
      setError("err-reg-fname", "Required.");
      valid = false;
    } else if (fname.length > REG_NAME_MAX_LENGTH) {
      setError("err-reg-fname", "Must not exceed 25 characters.");
      valid = false;
    } else if (!isValidName(fname)) {
      setError("err-reg-fname", "Use letters and basic name symbols only.");
      valid = false;
    } else {
      clearError("err-reg-fname");
    }

    if (isEmpty(lname)) {
      setError("err-reg-lname", "Required.");
      valid = false;
    } else if (lname.length > REG_NAME_MAX_LENGTH) {
      setError("err-reg-lname", "Must not exceed 25 characters.");
      valid = false;
    } else if (!isValidName(lname)) {
      setError("err-reg-lname", "Use letters and basic name symbols only.");
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
    } else if (email.length > REG_EMAIL_MAX_LENGTH) {
      setError("err-reg-email", "Email is too long.");
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
      setError("err-login-email", "Email is required.");
      valid = false;
    } else if (!isValidEmail(loginId)) {
      setError("err-login-email", "Enter a valid email address.");
      valid = false;
    } else if (loginId.length > 254) {
      setError("err-login-email", "Email is too long.");
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
          email: loginId,
          password,
        }),
      });

      const data = await safeJson(response);
      if (!response.ok) {
        showBanner(
          "login-banner",
          "login-banner-msg",
          readApiError(data, "Invalid email or password.")
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

    const firstNameInput = document.getElementById("reg-fname");
    const lastNameInput = document.getElementById("reg-lname");
    const emailInput = document.getElementById("reg-email");
    const schoolInput = document.getElementById("reg-school-name");
    const firstName = trimToLength(firstNameInput.value, REG_NAME_MAX_LENGTH).trim();
    const lastName = trimToLength(lastNameInput.value, REG_NAME_MAX_LENGTH).trim();
    const email = trimToLength(emailInput.value, REG_EMAIL_MAX_LENGTH).trim();
    const password = document.getElementById("reg-password").value;
    const confirmPassword = document.getElementById("reg-confirm").value;
    const school = trimToLength(schoolInput.value, REG_SCHOOL_MAX_LENGTH).trim();
    firstNameInput.value = firstName;
    lastNameInput.value = lastName;
    emailInput.value = email;
    schoolInput.value = school;
    const yearStartRaw = document.getElementById("reg-year-start").value.trim();
    const yearEndRaw = document.getElementById("reg-year-end").value.trim();
    const yearStart = parseInt(yearStartRaw, 10);
    const yearEnd = parseInt(yearEndRaw, 10);
    const grading = document.getElementById("reg-grading").value;

    let valid = true;

    clearRegisterErrors();

    if (isEmpty(school)) {
      setError("err-reg-school", "School name is required.");
      valid = false;
    } else if (school.length > REG_SCHOOL_MAX_LENGTH) {
      setError("err-reg-school", "Must not exceed 50 characters.");
      valid = false;
    } else {
      clearError("err-reg-school");
    }

    if (isEmpty(firstName)) {
      setError("err-reg-fname", "First name is required.");
      valid = false;
    } else if (firstName.length > REG_NAME_MAX_LENGTH) {
      setError("err-reg-fname", "Must not exceed 25 characters.");
      valid = false;
    } else if (!isValidName(firstName)) {
      setError("err-reg-fname", "Use letters and basic name symbols only.");
      valid = false;
    }

    if (isEmpty(lastName)) {
      setError("err-reg-lname", "Last name is required.");
      valid = false;
    } else if (lastName.length > REG_NAME_MAX_LENGTH) {
      setError("err-reg-lname", "Must not exceed 25 characters.");
      valid = false;
    } else if (!isValidName(lastName)) {
      setError("err-reg-lname", "Use letters and basic name symbols only.");
      valid = false;
    }

    if (isEmpty(email)) {
      setError("err-reg-email", "Email is required.");
      valid = false;
    } else if (!isValidEmail(email)) {
      setError("err-reg-email", "Enter a valid email address.");
      valid = false;
    } else if (email.length > REG_EMAIL_MAX_LENGTH) {
      setError("err-reg-email", "Email is too long.");
      valid = false;
    }

    if (password.length < 8) {
      setError("err-reg-password", "Must be at least 8 characters.");
      valid = false;
    } else if (password.length > 128) {
      setError("err-reg-password", "Must not exceed 128 characters.");
      valid = false;
    }

    if (confirmPassword !== password) {
      setError("err-reg-confirm", "Passwords do not match.");
      valid = false;
    }

    if (!/^\d{4}$/.test(yearStartRaw)) {
      setError("err-reg-year-start", "Enter a 4-digit year.");
      valid = false;
    } else {
      clearError("err-reg-year-start");
    }

    if (!/^\d{4}$/.test(yearEndRaw)) {
      setError("err-reg-year-end", "Enter a 4-digit year.");
      valid = false;
    } else if (yearEnd <= yearStart) {
      setError("err-reg-year-end", "Must be after start year.");
      valid = false;
    } else {
      clearError("err-reg-year-end");
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
          grading,
        }),
      });

      const data = await safeJson(response);
      if (!response.ok) {
        mapRegisterApiErrors(data);
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
  ["reg-year-start", "reg-year-end"].forEach(inputId => {
    const el = document.getElementById(inputId);
    if (!el) return;
    el.addEventListener("input", () => {
      const next = normalizeSchoolYearInput(el.value);
      if (el.value !== next) el.value = next;
    });
  });
  [
    { id: "reg-fname", max: REG_NAME_MAX_LENGTH },
    { id: "reg-lname", max: REG_NAME_MAX_LENGTH },
    { id: "reg-email", max: REG_EMAIL_MAX_LENGTH },
    { id: "reg-school-name", max: REG_SCHOOL_MAX_LENGTH },
  ].forEach(({ id, max }) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => {
      const next = trimToLength(el.value, max);
      if (el.value !== next) el.value = next;
    });
  });

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
