(() => {
  const REFRESH_STORAGE_KEY = "gd_refresh";
  const events = window.EduTrackEvents || null;

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

  function emitStudentsChanged() {
    if (!events) return;
    events.invalidate("students");
    events.emit("students:changed");
  }

  function emitEnrollmentsChanged() {
    if (!events) return;
    events.invalidate("enrollments");
    events.emit("enrollments:changed");
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

  function parseId(value) {
    const num = Number(value);
    if (!num || Number.isNaN(num)) return null;
    return num;
  }

  function getSectionById(sectionId) {
    const id = parseId(sectionId);
    if (!id) return null;
    return state.sections.find(item => item.id === id) || null;
  }

  function getStudentById(studentId) {
    const id = parseId(studentId);
    if (!id) return null;
    return state.students.find(item => item.id === id) || null;
  }

  function getScheduleById(scheduleId) {
    const id = parseId(scheduleId);
    if (!id) return null;
    return state.schedules.find(item => item.id === id) || null;
  }

  function getSectionYearLevel(sectionId) {
    const section = getSectionById(sectionId);
    if (!section) return null;
    return Number(section.year_level) || null;
  }

  function getStudentYearLevel(student) {
    if (!student) return null;
    if (student.section_year_level) return Number(student.section_year_level) || null;
    if (student.year_level) return Number(student.year_level) || null;
    return getSectionYearLevel(student.section);
  }

  function getScheduleSectionId(schedule) {
    if (!schedule) return null;
    return parseId(schedule.section_id || schedule.section);
  }

  function getScheduleYearLevel(schedule) {
    if (!schedule) return null;
    if (schedule.section_year_level) return Number(schedule.section_year_level) || null;
    return getSectionYearLevel(getScheduleSectionId(schedule));
  }

  function parseTimeToMinutes(raw) {
    const text = String(raw || "").trim();
    const match = text.match(/^(\d{2}):(\d{2})$/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return hour * 60 + minute;
  }

  function getScheduleTimeRange(schedule) {
    if (!schedule || !schedule.period_time) return null;
    const [startRaw, endRaw] = String(schedule.period_time).split("-");
    const start = parseTimeToMinutes(startRaw);
    const end = parseTimeToMinutes(endRaw);
    if (start == null || end == null || end <= start) return null;
    return { start, end };
  }

  function schedulesTimeConflict(scheduleA, scheduleB) {
    if (!scheduleA || !scheduleB) return false;
    if (!scheduleA.day || !scheduleB.day || scheduleA.day !== scheduleB.day) return false;

    const periodA = parseId(scheduleA.period);
    const periodB = parseId(scheduleB.period);
    if (periodA && periodB && periodA === periodB) return true;

    const rangeA = getScheduleTimeRange(scheduleA);
    const rangeB = getScheduleTimeRange(scheduleB);
    if (!rangeA || !rangeB) return false;
    return rangeA.start < rangeB.end && rangeB.start < rangeA.end;
  }

  function hasStudentScheduleConflict(studentId, schedule) {
    const sid = parseId(studentId);
    if (!sid || !schedule) return false;
    const activeEnrollments = state.enrollments.filter(
      item => item.is_active !== false && Number(item.student) === sid
    );
    for (const enrollment of activeEnrollments) {
      const existingSchedule = getScheduleById(enrollment.schedule);
      if (!existingSchedule || Number(existingSchedule.id) === Number(schedule.id)) continue;
      if (schedulesTimeConflict(schedule, existingSchedule)) return true;
    }
    return false;
  }

  function isStudentCompatibleWithSchedule(student, schedule) {
    if (!student || !schedule) return false;

    const studentSectionId = parseId(student.section);
    const scheduleSectionId = getScheduleSectionId(schedule);
    if (studentSectionId && scheduleSectionId) {
      return studentSectionId === scheduleSectionId;
    }

    const studentYearLevel = getStudentYearLevel(student);
    const scheduleYearLevel = getScheduleYearLevel(schedule);
    if (studentYearLevel && scheduleYearLevel) {
      return studentYearLevel === scheduleYearLevel;
    }
    return false;
  }

  function isStudentAlreadyEnrolled(studentId, scheduleId) {
    const sid = parseId(studentId);
    const scid = parseId(scheduleId);
    if (!sid || !scid) return false;
    return state.enrollments.some(
      item =>
        item.is_active !== false &&
        Number(item.student) === sid &&
        Number(item.schedule) === scid
    );
  }

  function getEligibleStudentsForSchedule(scheduleId) {
    const schedule = getScheduleById(scheduleId);
    if (!schedule) return [];
    return state.students.filter(student => {
      if (!isStudentCompatibleWithSchedule(student, schedule)) return false;
      if (hasStudentScheduleConflict(student.id, schedule)) return false;
      return !isStudentAlreadyEnrolled(student.id, schedule.id);
    });
  }

  function getEligibleSchedulesForStudent(studentId) {
    const student = getStudentById(studentId);
    if (!student) return [];
    return state.schedules.filter(schedule => {
      if (!isStudentCompatibleWithSchedule(student, schedule)) return false;
      if (hasStudentScheduleConflict(student.id, schedule)) return false;
      return !isStudentAlreadyEnrolled(student.id, schedule.id);
    });
  }

  function getStudentEnrollmentCount(studentId) {
    return state.enrollments.filter(
      item => Number(item.student) === Number(studentId) && item.is_active !== false
    ).length;
  }

  function getStudentEnrollments(studentId) {
    return state.enrollments.filter(
      item => Number(item.student) === Number(studentId) && item.is_active !== false
    );
  }

  function sectionOptionLabel(section) {
    if (!section) return "";
    const term = String(section.school_year_sem_label || "").trim();
    const termLabel = term ? term.replace(" - ", ", ") : "";
    return termLabel
      ? `Grade ${section.year_level} - ${section.name} (${termLabel})`
      : `Grade ${section.year_level} - ${section.name}`;
  }

  function scheduleOptionLabel(schedule) {
    if (!schedule) return "";
    const subject = schedule.subject_name || schedule.subject_code || "Subject";
    const section = schedule.section_name || "Section";
    const day = schedule.day || "-";
    const period =
      schedule.period_display ||
      (schedule.period_name
        ? `${schedule.period_name}${schedule.period_time ? ` (${schedule.period_time})` : ""}`
        : "");
    const term =
      schedule.school_year_sem_display ||
      [schedule.school_year_name, schedule.semester_name].filter(Boolean).join(", ");

    const parts = [`${subject} - ${section}`, day];
    if (period) parts.push(period);
    if (term) parts.push(term);
    return parts.join(" · ");
  }

  function renderStudentTable() {
    const tableBody = getEl("students-table-body");
    if (!tableBody) return;

    if (!state.students.length) {
      tableBody.innerHTML = `<tr><td colspan="7" class="setup-sub">No students yet.</td></tr>`;
      return;
    }

    tableBody.innerHTML = state.students
      .map(item => {
        return `
          <tr>
            <td><div class="avatar-name"><span class="avatar-badge ${colorClassForStudent(item)}">${initialsForStudent(item)}</span>${fullName(item)}</div></td>
            <td class="mono subtle">${item.student_id}</td>
            <td>${item.section_name || "-"}</td>
            <td>Year ${item.year_level}</td>
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
      listEl.innerHTML = `<article class="m-card"><div class="setup-sub">No students yet.</div></article>`;
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

    sectionFilter.innerHTML = `
      <option value="">All Sections</option>
      ${state.sections
        .map(item => `<option value="${item.id}">${sectionOptionLabel(item)}</option>`)
        .join("")}
    `;

    studentSectionSelect.innerHTML = `
      <option value="">Select section</option>
      ${state.sections
        .map(item => `<option value="${item.id}">${sectionOptionLabel(item)}</option>`)
        .join("")}
    `;
  }

  function setStudentYearLevelFromSection(sectionId) {
    const yearInput = getEl("student-year-level-input");
    if (!yearInput) return null;
    const yearLevel = getSectionYearLevel(sectionId);
    yearInput.value = yearLevel ? String(yearLevel) : "";
    return yearLevel;
  }

  function renderStudentProfile(studentId) {
    const student = getStudentById(studentId);
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
      const colorClass = colorClassForStudent(student);
      avatar.style.background = "";
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
    syncEnrollDropdownOptions();
  }

  async function loadEnrollmentsList() {
    state.enrollments = await fetchList(
      "/api/student-enrollments/",
      "Failed to load student enrollments."
    );
    renderStudentTable();
    renderStudentMobile();
    syncEnrollDropdownOptions();
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

  function closeStudentModal() {
    closeModal("modal-student");
  }

  function resetEnrollModal() {
    const studentSelect = getEl("enroll-student-input");
    const scheduleSelect = getEl("enroll-schedule-input");
    if (studentSelect) studentSelect.value = "";
    if (scheduleSelect) scheduleSelect.value = "";
    showModalError("enroll-modal-error", "");
    syncEnrollDropdownOptions();
  }

  function closeEnrollModal() {
    closeModal("modal-enroll");
  }

  function closeDeleteModal() {
    closeModal("modal-student-delete");
    state.deleteContext = null;
    showModalError("student-delete-error", "");
  }

  function syncEnrollSaveButton() {
    const saveBtn = document.querySelector('[data-action="st-save-enroll"]');
    if (!saveBtn) return;
    const student = parseId(getEl("enroll-student-input")?.value);
    const schedule = parseId(getEl("enroll-schedule-input")?.value);
    if (!student || !schedule) {
      saveBtn.disabled = true;
      return;
    }
    const studentObj = getStudentById(student);
    const scheduleObj = getScheduleById(schedule);
    const valid =
      !!studentObj &&
      !!scheduleObj &&
      isStudentCompatibleWithSchedule(studentObj, scheduleObj) &&
      !hasStudentScheduleConflict(studentObj.id, scheduleObj) &&
      !isStudentAlreadyEnrolled(student, schedule);
    saveBtn.disabled = !valid;
  }

  function syncEnrollDropdownOptions(changed = "") {
    const studentSelect = getEl("enroll-student-input");
    const scheduleSelect = getEl("enroll-schedule-input");
    if (!studentSelect || !scheduleSelect) return;

    const currentStudentId = parseId(studentSelect.value);
    const currentScheduleId = parseId(scheduleSelect.value);

    const studentCandidates = currentScheduleId
      ? getEligibleStudentsForSchedule(currentScheduleId)
      : [...state.students];

    const scheduleCandidates = currentStudentId
      ? getEligibleSchedulesForStudent(currentStudentId)
      : [...state.schedules];

    const selectedStudentStillValid = currentStudentId
      ? studentCandidates.some(item => item.id === currentStudentId)
      : false;
    const selectedScheduleStillValid = currentScheduleId
      ? scheduleCandidates.some(item => item.id === currentScheduleId)
      : false;

    const selectedStudentId = selectedStudentStillValid ? currentStudentId : null;
    const selectedScheduleId = selectedScheduleStillValid ? currentScheduleId : null;

    let studentEmptyText = "Select student";
    if (currentScheduleId && !studentCandidates.length) {
      studentEmptyText = "No eligible students available for this schedule.";
    }

    let scheduleEmptyText = "Select schedule";
    if (currentStudentId && !scheduleCandidates.length) {
      scheduleEmptyText = "No available schedules for this student.";
    }

    studentSelect.innerHTML = `
      <option value="">${studentEmptyText}</option>
      ${studentCandidates
        .map(item => `<option value="${item.id}">${fullName(item)} (${item.student_id})</option>`)
        .join("")}
    `;

    scheduleSelect.innerHTML = `
      <option value="">${scheduleEmptyText}</option>
      ${scheduleCandidates
        .map(item => `<option value="${item.id}">${scheduleOptionLabel(item)}</option>`)
        .join("")}
    `;

    studentSelect.value = selectedStudentId ? String(selectedStudentId) : "";
    scheduleSelect.value = selectedScheduleId ? String(selectedScheduleId) : "";

    if (changed) {
      showModalError("enroll-modal-error", "");
    }
    syncEnrollSaveButton();
  }

  async function openStudentCreate() {
    resetStudentModal();
    await loadReferenceLists();
    openModal("modal-student");
  }

  async function openStudentEdit(id) {
    resetStudentModal();
    await loadReferenceLists();

    const student = getStudentById(id);
    if (!student) return;

    state.editingStudentId = id;
    getEl("student-modal-title").textContent = "Edit Student";
    getEl("student-id-input").value = student.student_id || "";
    getEl("student-first-name-input").value = student.first_name || "";
    getEl("student-middle-name-input").value = student.middle_name || "";
    getEl("student-last-name-input").value = student.last_name || "";
    getEl("student-gender-input").value = student.gender || "";
    getEl("student-contact-number-input").value = student.contact_number || "";
    getEl("student-section-input").value = student.section || "";
    setStudentYearLevelFromSection(student.section);

    openModal("modal-student");
  }

  async function openEnrollCreate() {
    resetEnrollModal();
    await Promise.all([loadReferenceLists(), reloadStudentsData()]);
    syncEnrollDropdownOptions();
    openModal("modal-enroll");
  }

  function openDeleteConfirm(message, context) {
    state.deleteContext = context;
    getEl("student-delete-message").textContent = message;
    showModalError("student-delete-error", "");
    openModal("modal-student-delete");
  }

  function getCurrentStudentPayload() {
    const sectionId = parseId(getEl("student-section-input").value);
    const derivedYearLevel = sectionId ? getSectionYearLevel(sectionId) : null;

    return {
      student_id: String(getEl("student-id-input").value || "").trim(),
      first_name: String(getEl("student-first-name-input").value || "").trim(),
      middle_name: String(getEl("student-middle-name-input").value || "").trim(),
      last_name: String(getEl("student-last-name-input").value || "").trim(),
      gender: String(getEl("student-gender-input").value || "").trim(),
      contact_number: String(getEl("student-contact-number-input").value || "").trim(),
      year_level: derivedYearLevel,
      section: sectionId,
    };
  }

  async function saveStudent() {
    const payload = getCurrentStudentPayload();

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
    if (!payload.section) {
      showModalError("student-modal-error", "Please select a section.");
      return;
    }
    if (!payload.year_level || payload.year_level <= 0) {
      showModalError("student-modal-error", "Year level must be greater than 0.");
      return;
    }

    const section = getSectionById(payload.section);
    if (!section) {
      showModalError("student-modal-error", "Please select a valid section.");
      return;
    }
    if (Number(payload.year_level) !== Number(section.year_level)) {
      showModalError("student-modal-error", "Student year level must match the selected section.");
      return;
    }

    const isEditing = !!state.editingStudentId;
    const url = isEditing ? `/api/students/${state.editingStudentId}/` : "/api/students/";
    const method = isEditing ? "PATCH" : "POST";

    try {
      await sendJson(url, method, payload, "Failed to save student.");
      closeStudentModal();
      await Promise.all([loadReferenceLists(), reloadStudentsData()]);
      emitStudentsChanged();
      showFeedback("Student saved.");
    } catch (err) {
      showModalError("student-modal-error", err.message || "Failed to save student.");
    }
  }

  async function saveEnrollment() {
    const student = parseId(getEl("enroll-student-input").value);
    const schedule = parseId(getEl("enroll-schedule-input").value);

    if (!student) {
      showModalError("enroll-modal-error", "Please select a student.");
      return;
    }
    if (!schedule) {
      showModalError("enroll-modal-error", "Please select a schedule.");
      return;
    }

    const studentObj = getStudentById(student);
    const scheduleObj = getScheduleById(schedule);
    if (!studentObj || !scheduleObj) {
      showModalError("enroll-modal-error", "Please select valid student and schedule.");
      return;
    }
    if (!isStudentCompatibleWithSchedule(studentObj, scheduleObj)) {
      showModalError("enroll-modal-error", "Student is not compatible with this schedule.");
      return;
    }
    if (hasStudentScheduleConflict(studentObj.id, scheduleObj)) {
      showModalError(
        "enroll-modal-error",
        "This student already has another schedule conflict at this day and time."
      );
      return;
    }
    if (isStudentAlreadyEnrolled(student, schedule)) {
      showModalError("enroll-modal-error", "This student is already enrolled in this schedule.");
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
      emitEnrollmentsChanged();
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
      emitStudentsChanged();
      emitEnrollmentsChanged();
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

  function setupStudentModalSync() {
    const sectionSelect = getEl("student-section-input");
    if (!sectionSelect) return;
    sectionSelect.addEventListener("change", () => {
      setStudentYearLevelFromSection(sectionSelect.value);
      showModalError("student-modal-error", "");
    });
  }

  function setupEnrollModalSync() {
    const studentSelect = getEl("enroll-student-input");
    const scheduleSelect = getEl("enroll-schedule-input");
    if (!studentSelect || !scheduleSelect) return;

    studentSelect.addEventListener("change", () => {
      syncEnrollDropdownOptions("student");
    });

    scheduleSelect.addEventListener("change", () => {
      syncEnrollDropdownOptions("schedule");
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
      const student = getStudentById(id);
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
    setupStudentModalSync();
    setupEnrollModalSync();
    const refreshAllDebounced = events?.debounce?.(
      () => Promise.all([loadReferenceLists(), reloadStudentsData()]).catch(err => showFeedback(err.message || "Failed to refresh students.", true)),
      220
    );
    if (events && refreshAllDebounced) {
      events.on("sections:changed", refreshAllDebounced);
      events.on("schedules:changed", refreshAllDebounced);
      events.on("students:changed", refreshAllDebounced);
      events.on("enrollments:changed", refreshAllDebounced);
      events.on("dashboard:page-activated", event => {
        if (event.detail?.page !== "students") return;
        if (events.isInvalid("sections") || events.isInvalid("students") || events.isInvalid("schedules") || events.isInvalid("enrollments")) {
          events.clearInvalid("sections");
          events.clearInvalid("students");
          events.clearInvalid("schedules");
          events.clearInvalid("enrollments");
          refreshAllDebounced();
        }
      });
    }

    try {
      await Promise.all([loadReferenceLists(), reloadStudentsData()]);
      window.EduTrackModules = window.EduTrackModules || {};
      window.EduTrackModules.students = {
        refreshLookups: loadReferenceLists,
        refreshList: reloadStudentsData,
        refreshAll: async () => Promise.all([loadReferenceLists(), reloadStudentsData()]),
      };
    } catch (err) {
      showFeedback(err.message || "Failed to load students.", true);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initStudentsPage();
  });
})();
