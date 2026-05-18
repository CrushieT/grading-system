(() => {
  const REFRESH_STORAGE_KEY = "gd_refresh";

  let accessToken = null;
  let refreshPromise = null;
  let isRedirectingToLogin = false;

  const state = {
    subjects: [],
    sections: [],
    schoolYearSemesters: [],
    editingSubjectId: null,
    editingSectionId: null,
    deleteContext: null,
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
    const feedbackEl = getEl("subjects-sections-feedback");
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

  function formatUnits(units) {
    const value = Number(units);
    if (Number.isNaN(value)) return String(units || "");
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  function renderSubjects() {
    const listEl = getEl("subjects-list");
    if (!listEl) return;

    if (!state.subjects.length) {
      listEl.innerHTML = `
        <div class="setup-item">
          <div><div class="setup-sub">No subjects yet.</div></div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = state.subjects
      .map(item => `
        <div class="setup-item">
          <div>
            <div class="setup-label">${item.code} - ${item.name}</div>
            <div class="setup-sub">Units: ${formatUnits(item.units)}</div>
          </div>
          <div class="setup-actions">
            <button type="button" class="icon-btn" data-action="ss-edit-subject" data-id="${item.id}">Edit</button>
            <button type="button" class="icon-btn danger" data-action="ss-delete-subject" data-id="${item.id}">Delete</button>
          </div>
        </div>
      `)
      .join("");
  }

  function renderSections() {
    const listEl = getEl("sections-list");
    if (!listEl) return;

    if (!state.sections.length) {
      listEl.innerHTML = `
        <div class="setup-item">
          <div><div class="setup-sub">No sections yet.</div></div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = state.sections
      .map(item => `
        <div class="setup-item">
          <div>
            <div class="setup-label">${item.name}</div>
            <div class="setup-sub">Year ${item.year_level} - ${item.school_year_sem_label || "No school term"}</div>
          </div>
          <div class="setup-actions">
            <button type="button" class="icon-btn" data-action="ss-edit-section" data-id="${item.id}">Edit</button>
            <button type="button" class="icon-btn danger" data-action="ss-delete-section" data-id="${item.id}">Delete</button>
          </div>
        </div>
      `)
      .join("");
  }

  function renderSchoolYearSemesterOptions() {
    const select = getEl("section-school-year-sem-input");
    if (!select) return;

    const options = state.schoolYearSemesters
      .map(item => `<option value="${item.id}">${item.school_year_name} - ${item.semester_name}</option>`)
      .join("");

    select.innerHTML = `<option value="">Select school year / semester</option>${options}`;
  }

  async function fetchList(url, failureMessage) {
    const response = await authFetch(url, { method: "GET" });
    const payload = await safeJson(response);
    if (!response.ok) {
      throw new Error(extractErrorMessage(payload, failureMessage));
    }
    return normalizeList(payload);
  }

  async function loadSchoolYearSemesters() {
    const select = getEl("section-school-year-sem-input");
    if (select) {
      select.innerHTML = `<option value="">Loading school terms...</option>`;
    }
    state.schoolYearSemesters = await fetchList(
      "/api/school-year-semesters/",
      "Failed to load school year semesters."
    );
    renderSchoolYearSemesterOptions();
  }

  async function loadSubjectSectionLists() {
    const subjectsList = getEl("subjects-list");
    const sectionsList = getEl("sections-list");

    if (subjectsList) {
      subjectsList.innerHTML = `
        <div class="setup-item">
          <div><div class="setup-sub">Loading subjects...</div></div>
        </div>
      `;
    }
    if (sectionsList) {
      sectionsList.innerHTML = `
        <div class="setup-item">
          <div><div class="setup-sub">Loading sections...</div></div>
        </div>
      `;
    }

    const [subjects, sections] = await Promise.all([
      fetchList("/api/subjects/", "Failed to load subjects."),
      fetchList("/api/sections/", "Failed to load sections."),
    ]);
    state.subjects = subjects;
    state.sections = sections;
    renderSubjects();
    renderSections();
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

  function resetSubjectModal() {
    state.editingSubjectId = null;
    getEl("subject-modal-title").textContent = "Add Subject";
    getEl("subject-code-input").value = "";
    getEl("subject-name-input").value = "";
    getEl("subject-units-input").value = "";
    showModalError("subject-modal-error", "");
  }

  function resetSectionModal() {
    state.editingSectionId = null;
    getEl("section-modal-title").textContent = "Add Section";
    getEl("section-name-input").value = "";
    getEl("section-year-level-input").value = "";
    getEl("section-school-year-sem-input").value = "";
    showModalError("section-modal-error", "");
  }

  function closeSubjectModal() {
    closeModal("modal-subject-manage");
  }

  function closeSectionModal() {
    closeModal("modal-section-manage");
  }

  function closeDeleteModal() {
    closeModal("modal-subject-section-delete");
    state.deleteContext = null;
    showModalError("subject-section-delete-error", "");
  }

  function openSubjectCreate() {
    resetSubjectModal();
    openModal("modal-subject-manage");
  }

  function openSubjectEdit(id) {
    resetSubjectModal();
    const subject = state.subjects.find(item => item.id === id);
    if (!subject) return;
    state.editingSubjectId = id;
    getEl("subject-modal-title").textContent = "Edit Subject";
    getEl("subject-code-input").value = subject.code || "";
    getEl("subject-name-input").value = subject.name || "";
    getEl("subject-units-input").value = subject.units || "";
    openModal("modal-subject-manage");
  }

  function openSectionCreate() {
    resetSectionModal();
    openModal("modal-section-manage");
  }

  function openSectionEdit(id) {
    resetSectionModal();
    const section = state.sections.find(item => item.id === id);
    if (!section) return;
    state.editingSectionId = id;
    getEl("section-modal-title").textContent = "Edit Section";
    getEl("section-name-input").value = section.name || "";
    getEl("section-year-level-input").value = section.year_level || "";
    getEl("section-school-year-sem-input").value = section.school_year_sem || "";
    openModal("modal-section-manage");
  }

  function openDeleteConfirm(context) {
    state.deleteContext = context;
    getEl("subject-section-delete-message").textContent = context.message;
    showModalError("subject-section-delete-error", "");
    openModal("modal-subject-section-delete");
  }

  async function saveSubject() {
    const code = String(getEl("subject-code-input").value || "").trim();
    const name = String(getEl("subject-name-input").value || "").trim();
    const units = Number(getEl("subject-units-input").value);

    if (!code) {
      showModalError("subject-modal-error", "Subject code is required.");
      return;
    }
    if (!name) {
      showModalError("subject-modal-error", "Subject name is required.");
      return;
    }
    if (Number.isNaN(units) || units <= 0) {
      showModalError("subject-modal-error", "Units must be greater than 0.");
      return;
    }

    const payload = { code, name, units };
    const isEditing = !!state.editingSubjectId;
    const url = isEditing ? `/api/subjects/${state.editingSubjectId}/` : "/api/subjects/";
    const method = isEditing ? "PATCH" : "POST";

    try {
      await sendJson(url, method, payload, "Failed to save subject.");
      closeSubjectModal();
      await loadSubjectSectionLists();
      showFeedback("Subject saved.");
    } catch (err) {
      showModalError("subject-modal-error", err.message || "Failed to save subject.");
    }
  }

  async function saveSection() {
    const name = String(getEl("section-name-input").value || "").trim();
    const yearLevel = Number(getEl("section-year-level-input").value);
    const schoolYearSem = Number(getEl("section-school-year-sem-input").value);

    if (!name) {
      showModalError("section-modal-error", "Section name is required.");
      return;
    }
    if (Number.isNaN(yearLevel) || yearLevel <= 0) {
      showModalError("section-modal-error", "Year level must be greater than 0.");
      return;
    }
    if (!schoolYearSem || Number.isNaN(schoolYearSem)) {
      showModalError("section-modal-error", "Please select a school year semester.");
      return;
    }

    const payload = {
      name,
      year_level: yearLevel,
      school_year_sem: schoolYearSem,
    };

    const isEditing = !!state.editingSectionId;
    const url = isEditing ? `/api/sections/${state.editingSectionId}/` : "/api/sections/";
    const method = isEditing ? "PATCH" : "POST";

    try {
      await sendJson(url, method, payload, "Failed to save section.");
      closeSectionModal();
      await loadSubjectSectionLists();
      showFeedback("Section saved.");
    } catch (err) {
      showModalError("section-modal-error", err.message || "Failed to save section.");
    }
  }

  async function confirmDelete() {
    if (!state.deleteContext) return;

    const response = await authFetch(state.deleteContext.url, { method: "DELETE" });
    if (response.status === 204) {
      closeDeleteModal();
      await loadSubjectSectionLists();
      showFeedback(state.deleteContext.successMessage);
      return;
    }

    const payload = await safeJson(response);
    showModalError(
      "subject-section-delete-error",
      extractErrorMessage(payload, "Failed to delete item.")
    );
  }

  function handleAction(actionEl) {
    const action = actionEl.dataset.action;
    const id = Number(actionEl.dataset.id || "0");

    if (action === "ss-open-subject-create") openSubjectCreate();
    if (action === "ss-open-section-create") openSectionCreate();
    if (action === "ss-close-subject-modal") closeSubjectModal();
    if (action === "ss-close-section-modal") closeSectionModal();
    if (action === "ss-close-delete-modal") closeDeleteModal();
    if (action === "ss-edit-subject") openSubjectEdit(id);
    if (action === "ss-edit-section") openSectionEdit(id);
    if (action === "ss-save-subject") saveSubject();
    if (action === "ss-save-section") saveSection();
    if (action === "ss-confirm-delete") confirmDelete();

    if (action === "ss-delete-subject") {
      const subject = state.subjects.find(item => item.id === id);
      const name = subject ? `${subject.code} - ${subject.name}` : "this subject";
      openDeleteConfirm({
        url: `/api/subjects/${id}/`,
        message: `Delete ${name}?`,
        successMessage: "Subject deleted.",
      });
    }

    if (action === "ss-delete-section") {
      const section = state.sections.find(item => item.id === id);
      const name = section ? section.name : "this section";
      openDeleteConfirm({
        url: `/api/sections/${id}/`,
        message: `Delete ${name}?`,
        successMessage: "Section deleted.",
      });
    }
  }

  async function initSubjectsSections() {
    const page = getEl("page-schedules");
    if (!page) return;

    document.addEventListener("click", event => {
      const actionEl = event.target.closest("[data-action]");
      if (!actionEl) return;
      if (!String(actionEl.dataset.action || "").startsWith("ss-")) return;
      handleAction(actionEl);
    });

    try {
      await loadSchoolYearSemesters();
      await loadSubjectSectionLists();
    } catch (err) {
      showFeedback(err.message || "Failed to load subjects and sections.", true);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initSubjectsSections();
  });
})();
