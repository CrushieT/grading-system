(() => {
  const handlers = window.dashboardPageHandlers || (window.dashboardPageHandlers = {});

  handlers.setAttendanceState = (button, state) => {
    const parent = button.closest(".att-status");
    if (!parent) return;

    parent.querySelectorAll(".att-btn").forEach(attBtn => {
      attBtn.classList.remove("active-p", "active-a", "active-l", "active-e");
    });
    button.classList.add(`active-${state}`);
  };
})();
