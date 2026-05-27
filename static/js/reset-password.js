function getEl(id) {
  return document.getElementById(id);
}

function setError(id, message) {
  const el = getEl(id);
  if (!el) return;
  el.textContent = message || "";
  const input = el.closest(".form-group")?.querySelector("input");
  if (input) input.classList.toggle("error", !!message);
}

function clearErrors() {
  setError("err-reset-password", "");
  setError("err-reset-confirm-password", "");
}

function showBanner(message, isError = true) {
  const banner = getEl("reset-banner");
  const text = getEl("reset-banner-msg");
  if (!banner || !text) return;
  text.textContent = message || "";
  banner.hidden = !message;
  banner.style.color = isError ? "" : "#1f7a45";
}

function readApiError(payload, fallback) {
  if (!payload || typeof payload !== "object") return fallback;
  if (typeof payload.detail === "string" && payload.detail.trim()) return payload.detail;
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message;

  const firstError = Object.values(payload).find(value => {
    if (typeof value === "string") return value.trim();
    if (Array.isArray(value) && value.length) return true;
    return false;
  });
  if (typeof firstError === "string" && firstError.trim()) return firstError;
  if (Array.isArray(firstError) && firstError.length) return String(firstError[0]);

  return fallback;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch (_err) {
    return {};
  }
}

function getResetParams() {
  const search = new URLSearchParams(window.location.search);
  return {
    uid: String(search.get("uid") || "").trim(),
    token: String(search.get("token") || "").trim(),
  };
}

async function submitReset() {
  clearErrors();
  showBanner("");

  const params = getResetParams();
  const password = String(getEl("reset-password")?.value || "");
  const confirmPassword = String(getEl("reset-confirm-password")?.value || "");

  let valid = true;
  if (!params.uid || !params.token) {
    showBanner("Invalid or incomplete reset link.");
    return;
  }
  if (password.length < 8) {
    setError("err-reset-password", "Must be at least 8 characters.");
    valid = false;
  }
  if (confirmPassword !== password) {
    setError("err-reset-confirm-password", "Passwords do not match.");
    valid = false;
  }
  if (!valid) return;

  const submitBtn = getEl("reset-submit");
  if (submitBtn) submitBtn.disabled = true;

  try {
    const response = await fetch("/api/auth/password-reset/confirm/", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uid: params.uid,
        token: params.token,
        new_password: password,
        confirm_password: confirmPassword,
      }),
    });
    const payload = await safeJson(response);
    if (!response.ok) {
      showBanner(readApiError(payload, "Failed to reset password."));
      return;
    }

    showBanner(payload.message || "Password has been reset.", false);
    window.setTimeout(() => {
      window.location.replace("/login.html");
    }, 1200);
  } catch (_err) {
    showBanner("Could not connect. Try again.");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function init() {
  const submitBtn = getEl("reset-submit");
  if (submitBtn) submitBtn.addEventListener("click", submitReset);

  const passwordInput = getEl("reset-password");
  const confirmInput = getEl("reset-confirm-password");
  if (passwordInput) {
    passwordInput.addEventListener("input", () => setError("err-reset-password", ""));
  }
  if (confirmInput) {
    confirmInput.addEventListener("input", () => setError("err-reset-confirm-password", ""));
  }
}

document.addEventListener("DOMContentLoaded", init);
