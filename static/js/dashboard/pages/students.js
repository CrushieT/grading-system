(() => {
  const REFRESH_STORAGE_KEY = "gd_refresh";

  let accessToken = null;
  let refreshPromise = null;
  let isRedirectingToLogin = false;

  const state = {
    students: [],
    sections: [],
    schedules: [],
    enrollments: [],
    editingStudentId: null,
    profileStudentId: null,
    deleteContext: null,
    search: "",
    sectionFilter: "",
    yearLevelFilter: "",
  };

  const AVATAR_COLORS = [
    "avatar-blue",
    "avatar-green",
    "avatar-amber",
    "avatar-red",
    "avatar-gray",
  ];

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
    const feedbackEl = getEl("students-feedback");
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

  function initialsForStudent(item) {
    const first = String(item.first_name || "").trim();
    const last = String(item.last_name || "").trim();
    return `${(first[0] || "S").toUpperCase()}${(last[0] || "T").toUpperCase()}`;
  }

  function colorClassForStudent(item) {
    return AVATAR_COLORS[item.id % AVATAR_COLORS.length];
  }

  function fullName(item) {
    return item.full_name || `${item.first_name || ""} ${item.last_name || ""}`.trim();
  }

  function getStudentEnrollmentCount(studentId) {
    return state.enrollments.filter(item => item.student === studentId && item.is_active).length;
  }

  function getStudentEnrollments(studentId) {
    return state.enrollments.filter(item => item.student === studentId && item.is_active);
  }

  function renderStudentTable() {
    const tableBody = getEl("students-table-body");
    if (!tableBody) return;

    if (!state.students.length) {
      tableBody.innerHTML = `
        <tr><td colspan="8" class="setup-sub">No students yet.</td></tr>
      `;
      return;
    }

    tableBody.innerHTML = state.students
      .map(item => {
        const schedulesCount = getStudentEnrollmentCount(item.id);
        return `
          <tr>
            <td><div class="avatar-name"><span class="avatar-badge ${colorClassForStudent(item)}">${initialsForStudent(item)}</span>${fullName(item)}</div></td>
            <td class="mono subtle">${item.student_id}</td>
            <td>${item.section_name || "-"}</td>
            <td>Year ${item.year_level}</td>
            <td>${schedulesCount} schedule${schedulesCount === 1 ? "" : "s"}</td>
            <td class="mono subtle">${item.average_grade || "--"}</td>
            <td><span class="badge badge-gray">${item.attendance_rate || "--"}</span></td>
            <td class="table-actions">
              <button type="button" class="btn btn-ghost btn-xs" data-action="st-view-student" data-id="${item.id}">View</button>
              <button type="button" class="btn btn-ghost btn-xs" data-action="st-edit-student" data-id="${item.id}">Edit</button>
              <button type="button" class="btn btn-danger btn-xs" data-action="st-delete-student" data-id="${item.id}">Delete</button>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function renderStudentMobile() {
    const listEl = getEl("students-mobile-list");
    if (!listEl) return;

    if (!state.students.length) {
      listEl.innerHTML = `
        <article class="m-card"><div class="setup-sub">No students yet.</div></article>
      `;
      return;
    }

    listEl.innerHTML = state.students
      .map(item => {
        const schedulesCount = getStudentEnrollmentCount(item.id);
        return `
          <article class="m-card">
            <div class="m-card-row">
              <div class="avatar-name">
                <span class="avatar-badge ${colorClassForStudent(item)}">${initialsForStudent(item)}</span>
                <div>
                  <div class="m-card-title">${fullName(item)}</div>
                  <div class="m-card-sub">${item.student_id}</div>
                </div>
              </div>
              <span class="badge badge-gray">Year ${item.year_level}</span>
            </div>
            <div class="m-card-meta">
              <div class="m-meta-item"><span class="m-meta-label">Section</span><span class="m-meta-value">${item.section_name || "-"}</span></div>
              <div class="m-meta-item"><span class="m-meta-label">Schedules</span><span class="m-meta-value">${schedulesCount}</span></div>
              <div class="m-meta-item"><span class="m-meta-label">Avg Grade</span><span class="m-meta-value mono subtle">${item.average_grade || "--"}</span></div>
              <div class="m-meta-item"><span class="m-meta-label">Attendance</span><span class="m-meta-value">${item.attendance_rate || "--"}</span></div>
            </div>
            <div class="m-card-actions">
              <button type="button" class="btn btn-ghost" data-action="st-view-student" data-id="${item.id}">View</button>
              <button type="button" class="btn btn-ghost" data-action="st-edit-student" data-id="${item.id}">Edit</button>
              <button type="button" class="btn btn-danger" data-action="st-delete-student" data-id="${item.id}">Delete</button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderStudentSectionFilterOptions() {
    const sectionFilter = getEl("student-section-filter");
    const studentSectionSelect = getEl("student-section-input");
    if (!sectionFilter || !studentSectionSelect) return;

    const options = state.sections
      .map(item => `<option value="${item.id}">${item.name}</option>`)
      .join("");

    sectionFilter.innerHTML = `<option value="">All Sections</option>${options}`;
    studentSectionSelect.innerHTML = `<option value="">Select section</option>${options}`;
  }

  function renderEnrollmentOptions() {
    const studentSelect = getEl("enroll-student-input");
    const scheduleSelect = getEl("enroll-schedule-input");
    if (!studentSelect || !scheduleSelect) return;

    studentSelect.innerHTML = `
      <option value="">Select student</option>
      ${state.students.map(item => `<option value="${item.id}">${fullName(item)} (${item.student_id})</option>`).join("")}
    `;

    scheduleSelect.innerHTML = `
      <option value="">Select schedule</option>
      ${state.schedules.map(item => `<option value="${item.id}">${item.subject_name} - ${item.section_name} (${item.day || "-"})</option>`).join("")}
    `;
  }

  function renderStudentProfile(studentId) {
    const student = state.students.find(item => item.id === studentId);
    if (!student) return;

    state.profileStudentId = studentId;
    const enrolled = getStudentEnrollments(studentId);

    const avatar = getEl("sv-avatar");
    const initialsEl = getEl("sv-initials");
    const nameEl = getEl("sv-name");
    const schedulesEl = getEl("sv-schedules");
    const studentIdEl = getEl("sv-student-id");
    const sectionEl = getEl("sv-section");
    const yearLevelEl = getEl("sv-year-level");
    const enrolledList = getEl("sv-enrolled-list");

    if (avatar) {
      avatar.classList.remove("avatar-blue", "avatar-green", "avatar-amber", "avatar-red", "avatar-gray");
      const colorClass = colorClassForStudent(student);
      if (colorClass === "avatar-blue") avatar.style.background = "var(--blue)";
      if (colorClass === "avatar-green") avatar.style.background = "var(--green)";
      if (colorClass === "avatar-amber") avatar.style.background = "var(--amber)";
      if (colorClass === "avatar-red") avatar.style.background = "var(--red)";
      if (colorClass === "avatar-gray") avatar.style.background = "var(--text-2)";
    }
    if (initialsEl) initialsEl.textContent = initialsForStudent(student);
    if (nameEl) nameEl.textContent = fullName(student);
    if (schedulesEl) schedulesEl.textContent = `${enrolled.length} schedule${enrolled.length === 1 ? "" : "s"}`;
    if (studentIdEl) studentIdEl.textContent = student.student_id || "-";
    if (sectionEl) sectionEl.textContent = student.section_name || "-";
    if (yearLevelEl) yearLevelEl.textContent = student.year_level ? `Year ${student.year_level}` : "-";

    if (enrolledList) {
      if (!enrolled.length) {
        enrolledList.innerHTML = `<div class="summary-row"><span>No schedules enrolled yet.</span></div>`;
      } else {
        enrolledList.innerHTML = enrolled
          .map(item => `<div class="summary-row"><span>${item.schedule_label}</span><span class="mono subtle">${item.date_enrolled || ""}</span></div>`)
          .join("");
      }
    }

    openModal("modal-student-view");
  }

  function buildStudentsUrl() {
    const params = new URLSearchParams();
    if (state.search) params.set("search", state.search);
    if (state.sectionFilter) params.set("section", state.sectionFilter);
    if (state.yearLevelFilter) params.set("year_level", state.yearLevelFilter);
    const query = params.toString();
    return query ? `/api/students/?${query}` : "/api/students/";
  }

  async function fetchList(url, failureMessage) {
    const response = await authFetch(url, { method: "GET" });
    const payload = await safeJson(response);
    if (!response.ok) {
      throw new Error(extractErrorMessage(payload, failureMessage));
    }
    return normalizeList(payload);
  }

  async function loadReferenceLists() {
    const [sections, schedules] = await Promise.all([
      fetchList("/api/sections/", "Failed to load sections."),
      fetchList("/api/schedules/", "Failed to load schedules."),
    ]);
    state.sections = sections;
    state.schedules = schedules;
    renderStudentSectionFilterOptions();
  }

  async function loadStudentsList() {
    const table = getEl("students-table-body");
    const mobile = getEl("students-mobile-list");
    if (table) table.innerHTML = `<tr><td colspan="8" class="setup-sub">Loading students...</td></tr>`;
    if (mobile) mobile.innerHTML = `<article class="m-card"><div class="setup-sub">Loading students...</div></article>`;

    state.students = await fetchList(buildStudentsUrl(), "Failed to load students.");
    renderStudentTable();
    renderStudentMobile();
    renderEnrollmentOptions();
  }

  async function loadEnrollmentsList() {
    state.enrollments = await fetchList(
      "/api/student-enrollments/",
      "Failed to load student enrollments."
    );
    renderStudentTable();
    renderStudentMobile();
  }

  async function reloadStudentsData() {
    await Promise.all([loadStudentsList(), loadEnrollmentsList()]);
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

  function resetStudentModal() {
    state.editingStudentId = null;
    getEl("student-modal-title").textContent = "Add Student";
    getEl("student-id-input").value = "";
    getEl("student-first-name-input").value = "";
    getEl("student-middle-name-input").value = "";
    getEl("student-last-name-input").value = "";
    getEl("student-gender-input").value = "";
    getEl("student-contact-number-input").value = "";
    getEl("student-year-level-input").value = "";
    getEl("student-section-input").value = "";
    showModalError("student-modal-error", "");
  }

  function resetEnrollModal() {
    getEl("enroll-student-input").value = "";
    getEl("enroll-schedule-input").value = "";
    showModalError("enroll-modal-error", "");
  }

  function closeStudentModal() {
    closeModal("modal-student");
  }

  function closeEnrollModal() {
    closeModal("modal-enroll");
  }

  function closeDeleteModal() {
    closeModal("modal-student-delete");
    state.deleteContext = null;
    showModalError("student-delete-error", "");
  }

  async function openStudentCreate() {
    resetStudentModal();
    await loadReferenceLists();
    openModal("modal-student");
  }

  async function openStudentEdit(id) {
    resetStudentModal();
    await loadReferenceLists();
    const student = state.students.find(item => item.id === id);
    if (!student) return;
    state.editingStudentId = id;
    getEl("student-modal-title").textContent = "Edit Student";
    getEl("student-id-input").value = student.student_id || "";
    getEl("student-first-name-input").value = student.first_name || "";
    getEl("student-middle-name-input").value = student.middle_name || "";
    getEl("student-last-name-input").value = student.last_name || "";
    getEl("student-gender-input").value = student.gender || "";
    getEl("student-contact-number-input").value = student.contact_number || "";
    getEl("student-year-level-input").value = student.year_level || "";
    getEl("student-section-input").value = student.section || "";
    openModal("modal-student");
  }

  async function openEnrollCreate() {
    resetEnrollModal();
    await loadReferenceLists();
    await reloadStudentsData();
    openModal("modal-enroll");
  }

  function openDeleteConfirm(message, context) {
    state.deleteContext = context;
    getEl("student-delete-message").textContent = message;
    showModalError("student-delete-error", "");
    openModal("modal-student-delete");
  }

  async function saveStudent() {
    const payload = {
      student_id: String(getEl("student-id-input").value || "").trim(),
      first_name: String(getEl("student-first-name-input").value || "").trim(),
      middle_name: String(getEl("student-middle-name-input").value || "").trim(),
      last_name: String(getEl("student-last-name-input").value || "").trim(),
      gender: String(getEl("student-gender-input").value || "").trim(),
      contact_number: String(getEl("student-contact-number-input").value || "").trim(),
      year_level: Number(getEl("student-year-level-input").value),
      section: Number(getEl("student-section-input").value),
    };

    if (!payload.student_id) {
      showModalError("student-modal-error", "Student ID is required.");
      return;
    }
    if (!payload.first_name) {
      showModalError("student-modal-error", "First name is required.");
      return;
    }
    if (!payload.last_name) {
      showModalError("student-modal-error", "Last name is required.");
      return;
    }
    if (!payload.year_level || Number.isNaN(payload.year_level) || payload.year_level <= 0) {
      showModalError("student-modal-error", "Year level must be greater than 0.");
      return;
    }
    if (!payload.section || Number.isNaN(payload.section)) {
      showModalError("student-modal-error", "Please select a section.");
      return;
    }

    const isEditing = !!state.editingStudentId;
    const url = isEditing ? `/api/students/${state.editingStudentId}/` : "/api/students/";
    const method = isEditing ? "PATCH" : "POST";

    try {
      await sendJson(url, method, payload, "Failed to save student.");
      closeStudentModal();
      await loadReferenceLists();
      await reloadStudentsData();
      showFeedback("Student saved.");
    } catch (err) {
      showModalError("student-modal-error", err.message || "Failed to save student.");
    }
  }

  async function saveEnrollment() {
    const student = Number(getEl("enroll-student-input").value);
    const schedule = Number(getEl("enroll-schedule-input").value);

    if (!student || Number.isNaN(student)) {
      showModalError("enroll-modal-error", "Please select a student.");
      return;
    }
    if (!schedule || Number.isNaN(schedule)) {
      showModalError("enroll-modal-error", "Please select a schedule.");
      return;
    }

    try {
      await sendJson(
        "/api/student-enrollments/",
        "POST",
        { student, schedule, is_active: true },
        "Failed to enroll student."
      );
      closeEnrollModal();
      await reloadStudentsData();
      showFeedback("Student enrolled.");
    } catch (err) {
      showModalError("enroll-modal-error", err.message || "Failed to enroll student.");
    }
  }

  async function confirmDelete() {
    if (!state.deleteContext) return;
    const response = await authFetch(state.deleteContext.url, { method: "DELETE" });
    if (response.status === 204) {
      closeDeleteModal();
      await reloadStudentsData();
      showFeedback(state.deleteContext.successMessage);
      return;
    }
    const payload = await safeJson(response);
    showModalError("student-delete-error", extractErrorMessage(payload, "Failed to delete student."));
  }

  function setupFilters() {
    const searchInput = getEl("student-search-input");
    const sectionFilter = getEl("student-section-filter");
    const yearLevelFilter = getEl("student-year-level-filter");
    if (!searchInput || !sectionFilter || !yearLevelFilter) return;

    searchInput.addEventListener("input", () => {
      state.search = String(searchInput.value || "").trim();
      window.clearTimeout(setupFilters._searchTimeoutId);
      setupFilters._searchTimeoutId = window.setTimeout(() => {
        loadStudentsList().catch(err => {
          showFeedback(err.message || "Failed to load students.", true);
        });
      }, 220);
    });

    sectionFilter.addEventListener("change", () => {
      state.sectionFilter = String(sectionFilter.value || "");
      loadStudentsList().catch(err => {
        showFeedback(err.message || "Failed to load students.", true);
      });
    });

    yearLevelFilter.addEventListener("change", () => {
      state.yearLevelFilter = String(yearLevelFilter.value || "");
      loadStudentsList().catch(err => {
        showFeedback(err.message || "Failed to load students.", true);
      });
    });
  }

  function handleAction(actionEl) {
    const action = actionEl.dataset.action;
    const id = Number(actionEl.dataset.id || "0");

    if (action === "st-open-student-create") openStudentCreate();
    if (action === "st-open-enroll-create") openEnrollCreate();
    if (action === "st-close-student-modal") closeStudentModal();
    if (action === "st-close-enroll-modal") closeEnrollModal();
    if (action === "st-close-delete-modal") closeDeleteModal();
    if (action === "st-save-student") saveStudent();
    if (action === "st-save-enroll") saveEnrollment();
    if (action === "st-confirm-delete") confirmDelete();

    if (action === "st-view-student") renderStudentProfile(id);
    if (action === "st-edit-student") openStudentEdit(id);
    if (action === "st-edit-from-profile" && state.profileStudentId) {
      closeModal("modal-student-view");
      openStudentEdit(state.profileStudentId);
    }
    if (action === "st-delete-student") {
      const student = state.students.find(item => item.id === id);
      const label = student ? `${fullName(student)} (${student.student_id})` : "this student";
      openDeleteConfirm(`Delete ${label}?`, {
        url: `/api/students/${id}/`,
        successMessage: "Student deleted.",
      });
    }
  }

  async function initStudentsPage() {
    const page = getEl("page-students");
    if (!page) return;

    document.addEventListener("click", event => {
      const actionEl = event.target.closest("[data-action]");
      if (!actionEl) return;
      if (!String(actionEl.dataset.action || "").startsWith("st-")) return;
      handleAction(actionEl);
    });

    setupFilters();

    try {
      await loadReferenceLists();
      await reloadStudentsData();
    } catch (err) {
      showFeedback(err.message || "Failed to load students.", true);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initStudentsPage();
  });
})();
