(() => {
  const handlers = window.dashboardPageHandlers || (window.dashboardPageHandlers = {});

  handlers.openStudentView = (name, initials, color, avg, attendance, schedules) => {
    const avatar = document.getElementById("sv-avatar");
    const initialsEl = document.getElementById("sv-initials");
    const nameEl = document.getElementById("sv-name");
    const schedulesEl = document.getElementById("sv-schedules");
    const avgEl = document.getElementById("sv-avg");
    const attEl = document.getElementById("sv-att-pct");
    const attEl2 = document.getElementById("sv-att-pct2");
    const attBar = document.getElementById("sv-att-bar");
    const modal = document.getElementById("modal-student-view");

    if (avatar && color) avatar.style.background = color;
    if (initialsEl) initialsEl.textContent = initials || "TA";
    if (nameEl) nameEl.textContent = name || "Student";
    if (schedulesEl) schedulesEl.textContent = schedules || "0 schedules";
    if (avgEl) avgEl.textContent = avg || "0.0";
    if (attEl) attEl.textContent = attendance || "0%";
    if (attEl2) attEl2.textContent = attendance || "0%";
    if (attBar) attBar.style.width = attendance || "0%";
    if (modal) modal.hidden = false;
  };
})();
