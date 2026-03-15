import { APPS_SCRIPT_URL } from "./config.js";

const els = {
  refreshButton: document.querySelector("#refresh-button"),
  status: document.querySelector("#dashboard-status"),
  winnerCards: document.querySelector("#winner-cards"),
  leaderboards: document.querySelector("#leaderboards"),
  conditionCharts: document.querySelector("#condition-charts"),
};

els.refreshButton.addEventListener("click", loadSummary);

loadSummary();

async function loadSummary() {
  if (!APPS_SCRIPT_URL) {
    els.status.textContent = "Apps Script summary URL is empty. results.js에 URL을 넣어주세요.";
    return;
  }

  els.refreshButton.disabled = true;
  els.status.textContent = "결과를 불러오는 중입니다...";

  try {
    const response = await fetch(`${APPS_SCRIPT_URL}?mode=summary`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    renderWinners(data.winners || {});
    renderLeaderboards(data.leaderboards || {});
    renderConditionCharts(data.conditionMeans || {});
    els.status.textContent = `마지막 갱신: ${new Date(data.generatedAt).toLocaleString()}`;
  } catch (error) {
    els.status.textContent = `불러오기 실패: ${error.message}`;
  } finally {
    els.refreshButton.disabled = false;
  }
}

function renderWinners(winners) {
  els.winnerCards.innerHTML = "";
  ["stroop", "visual-search"].forEach((taskId) => {
    const winner = winners[taskId];
    const card = document.createElement("article");
    card.className = "summary-card";
    card.innerHTML = winner
      ? `
        <h3>${labelTask(taskId)} Winner</h3>
        <p><strong>${winner.participantAttemptId}</strong></p>
        <p>Accuracy: ${winner.accuracy}%</p>
        <p>Mean RT: ${winner.meanRt} ms</p>
      `
      : `
        <h3>${labelTask(taskId)} Winner</h3>
        <p>데이터가 아직 없습니다.</p>
      `;
    els.winnerCards.appendChild(card);
  });
}

function renderLeaderboards(leaderboards) {
  els.leaderboards.innerHTML = "";
  ["stroop", "visual-search"].forEach((taskId) => {
    const rows = leaderboards[taskId] || [];
    const card = document.createElement("article");
    card.className = "task-card";
    card.innerHTML = `
      <h3>${labelTask(taskId)}</h3>
      <div class="leaderboard-table">
        ${rows.length ? buildLeaderboardTable(rows) : "<p>데이터가 아직 없습니다.</p>"}
      </div>
    `;
    els.leaderboards.appendChild(card);
  });
}

function renderConditionCharts(conditionMeans) {
  els.conditionCharts.innerHTML = "";
  ["stroop", "visual-search"].forEach((taskId) => {
    const rows = conditionMeans[taskId] || [];
    const card = document.createElement("article");
    card.className = "task-card";
    card.innerHTML = `
      <h3>${labelTask(taskId)}</h3>
      <p class="meta">Condition means for main trials</p>
      <div class="chart-group">
        ${rows.length ? rows.map((row) => buildConditionRow(row, rows)).join("") : "<p>데이터가 아직 없습니다.</p>"}
      </div>
    `;
    els.conditionCharts.appendChild(card);
  });
}

function buildLeaderboardTable(rows) {
  return `
    <table class="simple-table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>ID</th>
          <th>Accuracy</th>
          <th>Mean RT</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${row.participantAttemptId}</td>
            <td>${row.accuracy}%</td>
            <td>${row.meanRt} ms</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function buildConditionRow(row, allRows) {
  const maxRt = Math.max(...allRows.map((item) => item.meanRt), 1);
  const rtWidth = Math.max(12, Math.round((row.meanRt / maxRt) * 100));
  const accWidth = Math.max(12, Math.round(row.accuracy));

  return `
    <div class="chart-row">
      <p><strong>${row.condition}</strong> <span class="meta">n=${row.trialCount}</span></p>
      <div class="bar-label">Mean RT ${row.meanRt} ms</div>
      <div class="chart-bar"><span class="bar-fill rt-fill" style="width:${rtWidth}%"></span></div>
      <div class="bar-label">Accuracy ${row.accuracy}%</div>
      <div class="chart-bar"><span class="bar-fill acc-fill" style="width:${accWidth}%"></span></div>
    </div>
  `;
}

function labelTask(taskId) {
  return taskId === "stroop" ? "Stroop" : "Visual Search";
}
