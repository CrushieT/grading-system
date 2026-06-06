(() => {
  const handlers = window.dashboardPageHandlers || (window.dashboardPageHandlers = {});

  const state = {
    loaded: false,
    saving: false,
    user: null,
  };
  const SETTINGS_NAME_MAX_LENGTH = 25;
  const SETTINGS_EMAIL_MAX_LENGTH = 50;

  function getEl(id) {
    return document.getElementById(id);
  }

  function trimToLength(value, maxLength) {
    return String(value || "").slice(0, maxLength);
  }

  function normalizeAccountField(fieldId, value) {
    if (fieldId === "settings-first-name" || fieldId === "settings-last-name") {
      return trimToLength(value, SETTINGS_NAME_MAX_LENGTH);
    }
    if (fieldId === "settings-email") {
      return trimToLength(value, SETTINGS_EMAIL_MAX_LENGTH);
    }
    return String(value || "");
  }

  function readError(payload, fallback) {
    if (!payload || typeof payload !== "object") return fallback;
    if (typeof payload.detail === "string" && payload.detail.trim()) return payload.detail;
    if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
    return fallback;
  }

  function showFeedback(message, isError) {
    const feedback = getEl("settings-account-feedback");
    if (!feedback) return;
    if (!message) {
      feedback.hidden = true;
      feedback.textContent = "";
      feedback.classList.remove("error");
      return;
    }

    feedback.hidden = false;
    feedback.textContent = message;
    feedback.classList.toggle("error", !!isError);
  }

  function setFieldError(fieldKey, message) {
    const errorEl = getEl(`settings-${fieldKey}-error`);
    if (!errorEl) return;
    errorEl.hidden = !message;
    errorEl.textContent = message || "";
  }

  function clearFieldErrors() {
    [
      "first-name",
      "last-name",
      "email",
      "current-password",
      "new-password",
      "confirm-password",
    ].forEach(key => setFieldError(key, ""));
  }

  function mapApiErrors(payload) {
    if (!payload || typeof payload !== "object") return;
    const map = {
      first_name: "first-name",
      last_name: "last-name",
      email: "email",
      current_password: "current-password",
      new_password: "new-password",
      confirm_new_password: "confirm-password",
    };

    Object.entries(map).forEach(([apiKey, fieldKey]) => {
      const value = payload[apiKey];
      if (!value) return;
      const text = Array.isArray(value) ? String(value[0] || "") : String(value);
      if (text) setFieldError(fieldKey, text);
    });
  }

  function populateForm(user) {
    getEl("settings-first-name").value = normalizeAccountField("settings-first-name", user?.first_name || "");
    getEl("settings-last-name").value = normalizeAccountField("settings-last-name", user?.last_name || "");
    getEl("settings-email").value = normalizeAccountField("settings-email", user?.email || "");
    getEl("settings-current-password").value = "";
    getEl("settings-new-password").value = "";
    getEl("settings-confirm-password").value = "";
  }

  function setSaving(isSaving) {
    state.saving = !!isSaving;
    const btn = getEl("settings-save-account-btn");
    if (!btn) return;
    btn.disabled = state.saving;
    btn.textContent = state.saving ? "Saving..." : "Save Changes";
  }

  async function fetchMe() {
    const res = await window.authFetch("/api/auth/me/", { method: "GET" });
    const data = await window.safeJson(res);
    if (!res.ok) {
      throw new Error(readError(data, "Failed to load account details."));
    }
    return data.user || {};
  }

  async function loadSettings() {
    clearFieldErrors();
    showFeedback("", false);
    try {
      const user = await fetchMe();
      state.user = user;
      populateForm(user);
      state.loaded = true;
    } catch (err) {
      showFeedback(err.message || "Failed to load account details.", true);
    }
  }

  function getPayload() {
    const firstName = normalizeAccountField("settings-first-name", getEl("settings-first-name")?.value || "").trim();
    const lastName = normalizeAccountField("settings-last-name", getEl("settings-last-name")?.value || "").trim();
    const email = normalizeAccountField("settings-email", getEl("settings-email")?.value || "").trim();

    if (getEl("settings-first-name")) getEl("settings-first-name").value = firstName;
    if (getEl("settings-last-name")) getEl("settings-last-name").value = lastName;
    if (getEl("settings-email")) getEl("settings-email").value = email;

    return {
      first_name: firstName,
      last_name: lastName,
      email,
      current_password: String(getEl("settings-current-password")?.value || ""),
      new_password: String(getEl("settings-new-password")?.value || ""),
      confirm_new_password: String(getEl("settings-confirm-password")?.value || ""),
    };
  }

  async function saveSettings() {
    if (state.saving) return;
    clearFieldErrors();
    showFeedback("", false);
    setSaving(true);

    try {
      const payload = getPayload();
      if (payload.first_name.length > SETTINGS_NAME_MAX_LENGTH) {
        setFieldError("first-name", "First name must be at most 25 characters.");
        showFeedback("Please fix highlighted fields.", true);
        return;
      }
      if (payload.last_name.length > SETTINGS_NAME_MAX_LENGTH) {
        setFieldError("last-name", "Last name must be at most 25 characters.");
        showFeedback("Please fix highlighted fields.", true);
        return;
      }
      if (payload.email.length > SETTINGS_EMAIL_MAX_LENGTH) {
        setFieldError("email", "Email must be at most 50 characters.");
        showFeedback("Please fix highlighted fields.", true);
        return;
      }
      const res = await window.authFetch("/api/auth/me/", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await window.safeJson(res);

      if (!res.ok) {
        mapApiErrors(data);
        showFeedback(readError(data, "Failed to save account changes."), true);
        return;
      }

      state.user = data.user || {};
      populateForm(state.user);
      if (typeof window.updateUserUI === "function") {
        window.updateUserUI(state.user);
      }
      showFeedback(data.message || "Account updated successfully.", false);
      if (typeof window.showSuccessModal === "function") {
        window.showSuccessModal(data.message || "Account updated successfully.", "Account Updated");
      }
    } catch (_err) {
      showFeedback("Failed to save account changes.", true);
    } finally {
      setSaving(false);
    }
  }

  function bind() {
    const saveBtn = getEl("settings-save-account-btn");
    if (saveBtn) {
      saveBtn.addEventListener("click", saveSettings);
    }

    [
      "settings-first-name",
      "settings-last-name",
      "settings-email",
      "settings-current-password",
      "settings-new-password",
      "settings-confirm-password",
    ].forEach(id => {
      const input = getEl(id);
      if (!input) return;
      input.addEventListener("input", () => {
        const next = normalizeAccountField(id, input.value);
        if (input.value !== next) input.value = next;
        const fieldId = id.replace("settings-", "");
        setFieldError(fieldId, "");
      });
    });

    if (window.EduTrackEvents?.on) {
      window.EduTrackEvents.on("dashboard:page-activated", event => {
        if (event?.detail?.page !== "settings") return;
        if (!state.loaded) {
          loadSettings();
        }
      });
    }
  }

  handlers.settings = () => {
    if (!state.loaded) {
      loadSettings();
      return;
    }
    populateForm(state.user || {});
    clearFieldErrors();
    showFeedback("", false);
  };

  document.addEventListener("DOMContentLoaded", () => {
    bind();
  });
})();
