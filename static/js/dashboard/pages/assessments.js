(() => {
  const handlers = window.dashboardPageHandlers || (window.dashboardPageHandlers = {});

  handlers.openScoresModal = (assessment, maxScore) => {
    const max = maxScore || 50;
    const title = document.getElementById("scores-modal-title");
    const maxLabel = document.getElementById("scores-max-label");
    const maxCols = document.querySelectorAll(".score-max-col");
    const scoreInputs = document.querySelectorAll(".score-input");
    const modal = document.getElementById("modal-scores");

    if (title) title.textContent = `Scores - ${assessment || "Assessment"}`;
    if (maxLabel) maxLabel.textContent = `Max Score: ${max}`;
    maxCols.forEach(el => {
      el.textContent = `/${max}`;
    });
    scoreInputs.forEach(input => {
      input.max = String(max);
    });
    if (modal) modal.hidden = false;
  };
})();
