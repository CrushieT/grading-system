(() => {
  const handlers = window.dashboardPageHandlers || (window.dashboardPageHandlers = {});

  handlers.switchGradeTab = (tabId, tabButton) => {
    document.querySelectorAll(".tab-panel").forEach(panel => {
      panel.classList.toggle("active", panel.id === tabId);
    });
    document.querySelectorAll(".tab").forEach(tab => {
      tab.classList.toggle("active", tab === tabButton);
    });
  };
})();
