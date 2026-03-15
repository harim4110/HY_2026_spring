import { APPS_SCRIPT_URL } from "./config.js?v=20260316-debug1";

const DEBUG_MODE = new URLSearchParams(window.location.search).get("debug") === "1";

const BASE_TRIAL_CONFIG = {
  stroop: { practice: 4, main: 20 },
  visualSearch: { practice: 6, main: 24 },
};

const TRIAL_CONFIG = DEBUG_MODE
  ? {
      stroop: { practice: 1, main: 4 },
      visualSearch: { practice: 1, main: 4 },
    }
  : BASE_TRIAL_CONFIG;

const STROOP_COLORS = [
  { key: "red", label: "RED", css: "#dc2626" },
  { key: "blue", label: "BLUE", css: "#2563eb" },
  { key: "green", label: "GREEN", css: "#16a34a" },
  { key: "yellow", label: "YELLOW", css: "#ca8a04" },
];

const VISUAL_STIMULI = {
  featureTarget: { shape: "■", color: "#0f766e" },
  featureDistractor: { shape: "●", color: "#334155" },
  conjunctionTarget: { shape: "■", color: "#0f766e" },
  conjunctionA: { shape: "■", color: "#1d4ed8" },
  conjunctionB: { shape: "●", color: "#0f766e" },
};

const TASKS = {
  stroop: {
    id: "stroop",
    shortLabel: "Task A",
    title: "Stroop Task",
    description: "Respond to the ink color, not the word meaning.",
    estimatedMinutes: "2-3 min",
    rules: [
      "Tap the color label that matches the ink color.",
      "Ignore the word meaning and focus on the font color.",
      "Main block compares congruent and incongruent trials.",
    ],
    buttonLabels: STROOP_COLORS.map((item) => item.label),
    makeTrials: (phase) => buildStroopTrials(TRIAL_CONFIG.stroop[phase]),
  },
  visualSearch: {
    id: "visual-search",
    shortLabel: "Task B",
    title: "Visual Search",
    description: "Decide whether the target item is present in the array.",
    estimatedMinutes: "3-4 min",
    rules: [
      "Target: green square.",
      "Tap PRESENT if the target is on the screen, ABSENT if not.",
      "Feature search uses dark circles with one green square target.",
      "Main block mixes feature search and conjunction search for a simple class comparison.",
    ],
    buttonLabels: ["PRESENT", "ABSENT"],
    makeTrials: (phase) => buildVisualSearchTrials(TRIAL_CONFIG.visualSearch[phase]),
  },
};

const appState = {
  participant: null,
  currentTaskKey: null,
  currentPhase: null,
  currentTrials: [],
  trialIndex: 0,
  currentTrial: null,
  currentTrialStart: null,
  results: [],
  taskRuns: [],
  activeRun: null,
  lastSubmission: null,
  lastSyncError: null,
};

const els = {
  setupPanel: document.querySelector("#setup-panel"),
  setupForm: document.querySelector("#setup-form"),
  participantId: document.querySelector("#participant-id"),
  participantHint: document.querySelector("#participant-hint"),
  deviceType: document.querySelector("#device-type"),
  menuPanel: document.querySelector("#menu-panel"),
  welcomeTitle: document.querySelector("#welcome-title"),
  taskMenu: document.querySelector("#task-menu"),
  overallStats: document.querySelector("#overall-stats"),
  menuStatus: document.querySelector("#menu-status"),
  menuResetButton: document.querySelector("#menu-reset-button"),
  instructionPanel: document.querySelector("#instruction-panel"),
  taskTag: document.querySelector("#task-tag"),
  taskTitle: document.querySelector("#task-title"),
  taskDescription: document.querySelector("#task-description"),
  taskRules: document.querySelector("#task-rules"),
  startTaskButton: document.querySelector("#start-task-button"),
  taskPanel: document.querySelector("#task-panel"),
  taskNameLabel: document.querySelector("#task-name-label"),
  taskProgressTitle: document.querySelector("#task-progress-title"),
  phaseBadge: document.querySelector("#phase-badge"),
  trialBadge: document.querySelector("#trial-badge"),
  fixation: document.querySelector("#fixation"),
  stroopStimulus: document.querySelector("#stroop-stimulus"),
  stroopWord: document.querySelector("#stroop-word"),
  visualSearchStimulus: document.querySelector("#visual-search-stimulus"),
  responseButtons: document.querySelector("#response-buttons"),
  feedback: document.querySelector("#feedback"),
  summaryPanel: document.querySelector("#summary-panel"),
  summaryTitle: document.querySelector("#summary-title"),
  summaryCards: document.querySelector("#summary-cards"),
  nextTaskButton: document.querySelector("#next-task-button"),
  retryTaskButton: document.querySelector("#retry-task-button"),
  backToMenuButton: document.querySelector("#back-to-menu-button"),
  submissionStatus: document.querySelector("#submission-status"),
};

els.setupForm.addEventListener("submit", handleSetupSubmit);
els.startTaskButton.addEventListener("click", startCurrentTask);
els.nextTaskButton.addEventListener("click", goToOtherTask);
els.retryTaskButton.addEventListener("click", retryCurrentTask);
els.backToMenuButton.addEventListener("click", showMenu);
els.menuResetButton.addEventListener("click", resetApp);

function handleSetupSubmit(event) {
  event.preventDefault();
  const baseParticipantId = sanitizeParticipantId(els.participantId.value.trim());
  appState.participant = {
    baseParticipantId,
    deviceType: els.deviceType.value,
    userAgent: navigator.userAgent,
    startedAt: new Date().toISOString(),
  };
  appState.results = [];
  appState.taskRuns = [];
  appState.activeRun = null;
  appState.lastSubmission = null;
  appState.lastSyncError = null;
  renderMenu();
  showMenu();
}

function renderMenu() {
  els.welcomeTitle.textContent = `${appState.participant.baseParticipantId} - choose a task`;
  els.taskMenu.innerHTML = "";

  Object.entries(TASKS).forEach(([taskKey, task]) => {
    const previousRuns = appState.taskRuns.filter((run) => run.taskKey === taskKey);
    const latestRun = previousRuns.at(-1);
    const card = document.createElement("article");
    card.className = "task-card";
    card.innerHTML = `
      <p class="eyebrow">${task.shortLabel}</p>
      <h3>${task.title}</h3>
      <p>${task.description}</p>
      <p class="meta">Estimated time: ${task.estimatedMinutes}</p>
      <p class="meta">Runs completed on this device: ${previousRuns.length}</p>
      <p class="meta">${latestRun ? `Latest run: ${latestRun.accuracy}% accuracy, ${latestRun.meanRt} ms` : "No completed run yet."}</p>
      <button class="primary-button" data-task-key="${taskKey}">Start ${task.title}</button>
    `;
    card.querySelector("button").addEventListener("click", () => showInstructions(taskKey));
    els.taskMenu.appendChild(card);
  });

  updateOverallStats();
}

function updateOverallStats() {
  const mainRows = appState.results.filter((row) => row.phase === "main");
  const accuracy = mainRows.length ? Math.round((mainRows.filter((row) => row.correct).length / mainRows.length) * 100) : 0;
  const meanRt = mainRows.length ? Math.round(mainRows.reduce((sum, row) => sum + row.reactionTimeMs, 0) / mainRows.length) : 0;

  els.overallStats.innerHTML = `
    <article class="summary-card">
      <h3>Total stored trials</h3>
      <p><strong>${appState.results.length}</strong></p>
    </article>
    <article class="summary-card">
      <h3>Main-block accuracy</h3>
      <p><strong>${mainRows.length ? `${accuracy}%` : "-"}</strong></p>
    </article>
    <article class="summary-card">
      <h3>Main-block mean RT</h3>
      <p><strong>${mainRows.length ? `${meanRt} ms` : "-"}</strong></p>
    </article>
  `;

  const hasData = appState.results.length > 0;
  if (!hasData) {
    els.menuStatus.textContent = "No data collected yet.";
  } else if (!APPS_SCRIPT_URL) {
    els.menuStatus.textContent = "Apps Script URL is empty.";
  } else if (appState.lastSyncError) {
    els.menuStatus.textContent = `Last sync failed: ${appState.lastSyncError}`;
  } else if (appState.lastSubmission?.participantAttemptId) {
    els.menuStatus.textContent = `Latest official save: ${appState.lastSubmission.participantAttemptId}`;
  } else {
    els.menuStatus.textContent = "Each finished task is automatically sent to Google Sheets.";
  }
  if (DEBUG_MODE) {
    els.menuStatus.textContent += ` [debug on: stroop ${TRIAL_CONFIG.stroop.main}, visual ${TRIAL_CONFIG.visualSearch.main}]`;
  }
}

function showMenu() {
  hideAllPanels();
  renderMenu();
  els.menuPanel.classList.remove("hidden");
  els.submissionStatus.textContent = "";
}

function showInstructions(taskKey) {
  appState.currentTaskKey = taskKey;
  appState.currentPhase = "practice";
  appState.currentTrials = TASKS[taskKey].makeTrials("practice");
  appState.trialIndex = 0;
  appState.currentTrial = null;

  const task = TASKS[taskKey];
  hideAllPanels();
  els.instructionPanel.classList.remove("hidden");
  els.taskTag.textContent = task.shortLabel;
  els.taskTitle.textContent = task.title;
  els.taskDescription.textContent = task.description;
  els.taskRules.innerHTML = "";
  task.rules.forEach((rule) => {
    const item = document.createElement("li");
    item.textContent = rule;
    els.taskRules.appendChild(item);
  });
  els.startTaskButton.textContent = "Start practice";
}

function startCurrentTask() {
  const task = TASKS[appState.currentTaskKey];
  const localRunNumber = appState.taskRuns.filter((run) => run.taskKey === appState.currentTaskKey).length + 1;
  appState.activeRun = {
    runId: crypto.randomUUID(),
    taskKey: appState.currentTaskKey,
    taskId: task.id,
    localRunLabel: `${task.id}-${localRunNumber}`,
    startedAt: new Date().toISOString(),
  };

  hideAllPanels();
  els.taskPanel.classList.remove("hidden");
  renderResponseButtons(task.buttonLabels);
  runNextTrial();
}

function renderResponseButtons(labels) {
  els.responseButtons.innerHTML = "";
  els.responseButtons.classList.remove("hidden");
  labels.forEach((label, index) => {
    const button = document.createElement("button");
    button.className = "response-button primary-button";
    button.textContent = label;
    button.addEventListener("click", () => handleResponse(index));
    els.responseButtons.appendChild(button);
  });
}

function runNextTrial() {
  if (appState.trialIndex >= appState.currentTrials.length) {
    if (appState.currentPhase === "practice") {
      appState.currentPhase = "main";
      appState.currentTrials = TASKS[appState.currentTaskKey].makeTrials("main");
      appState.trialIndex = 0;
      els.feedback.textContent = "Practice complete. Main block starts now.";
      setTimeout(runNextTrial, 900);
      return;
    }
    finalizeTaskRun();
    return;
  }

  appState.currentTrial = appState.currentTrials[appState.trialIndex];
  updateTaskHeader();
  presentTrial();
}

function updateTaskHeader() {
  const task = TASKS[appState.currentTaskKey];
  const current = appState.trialIndex + 1;
  els.taskNameLabel.textContent = `${task.shortLabel} / ${appState.activeRun.localRunLabel}`;
  els.taskProgressTitle.textContent = task.title;
  els.phaseBadge.textContent = appState.currentPhase === "practice" ? "Practice" : "Main";
  els.trialBadge.textContent = `${current} / ${appState.currentTrials.length}`;
}

function presentTrial() {
  els.feedback.textContent = "";
  els.feedback.className = "feedback";
  els.fixation.classList.remove("hidden");
  els.stroopStimulus.classList.add("hidden");
  els.visualSearchStimulus.classList.add("hidden");
  setButtonsDisabled(true);

  setTimeout(() => {
    els.fixation.classList.add("hidden");
    if (appState.currentTaskKey === "stroop") {
      renderStroopTrial(appState.currentTrial);
    } else {
      renderSearchTrial(appState.currentTrial);
    }
    appState.currentTrialStart = performance.now();
    setButtonsDisabled(false);
  }, 450);
}

function renderStroopTrial(trial) {
  els.stroopStimulus.classList.remove("hidden");
  els.stroopWord.textContent = trial.wordLabel;
  els.stroopWord.style.color = trial.inkCss;
}

function renderSearchTrial(trial) {
  els.visualSearchStimulus.classList.remove("hidden");
  els.visualSearchStimulus.style.gridTemplateColumns = `repeat(${trial.columns}, minmax(0, 1fr))`;
  els.visualSearchStimulus.innerHTML = "";

  trial.items.forEach((item) => {
    const cell = document.createElement("div");
    cell.className = "search-item";
    cell.textContent = item.shape;
    cell.style.color = item.color;
    els.visualSearchStimulus.appendChild(cell);
  });
}

function handleResponse(responseIndex) {
  const trial = appState.currentTrial;
  const rt = Math.round(performance.now() - appState.currentTrialStart);
  const task = TASKS[appState.currentTaskKey];
  let selectedLabel = task.buttonLabels[responseIndex];
  let correct = false;

  if (appState.currentTaskKey === "stroop") {
    correct = STROOP_COLORS[responseIndex].key === trial.correctKey;
  } else {
    selectedLabel = responseIndex === 0 ? "present" : "absent";
    correct = selectedLabel === trial.correctResponse;
  }

  appState.results.push({
    rowId: crypto.randomUUID(),
    baseParticipantId: appState.participant.baseParticipantId,
    deviceType: appState.participant.deviceType,
    userAgent: appState.participant.userAgent,
    runId: appState.activeRun.runId,
    localRunLabel: appState.activeRun.localRunLabel,
    taskId: task.id,
    phase: appState.currentPhase,
    trialNumber: appState.trialIndex + 1,
    timestamp: new Date().toISOString(),
    response: selectedLabel,
    correct,
    reactionTimeMs: rt,
    ...trial.data,
  });

  els.feedback.textContent = correct ? "Correct" : "Incorrect";
  els.feedback.className = `feedback ${correct ? "success" : "error"}`;
  appState.trialIndex += 1;
  setButtonsDisabled(true);
  setTimeout(runNextTrial, 320);
}

function finalizeTaskRun() {
  const task = TASKS[appState.currentTaskKey];
  const mainRows = appState.results.filter(
    (row) => row.runId === appState.activeRun.runId && row.taskId === task.id && row.phase === "main"
  );
  const accuracy = mainRows.length ? Math.round((mainRows.filter((row) => row.correct).length / mainRows.length) * 100) : 0;
  const meanRt = mainRows.length ? Math.round(mainRows.reduce((sum, row) => sum + row.reactionTimeMs, 0) / mainRows.length) : 0;

  appState.taskRuns.push({
    ...appState.activeRun,
    endedAt: new Date().toISOString(),
    mainTrialCount: mainRows.length,
    accuracy,
    meanRt,
  });

  showTaskSummary(task, { accuracy, meanRt, mainTrialCount: mainRows.length });
  syncResults();
}

function showTaskSummary(task, metrics) {
  hideAllPanels();
  els.summaryPanel.classList.remove("hidden");
  els.summaryTitle.textContent = `${task.title} complete`;
  els.nextTaskButton.textContent = task.id === "stroop" ? "Visual Search 하기" : "Stroop 하기";
  els.summaryCards.innerHTML = `
    <article class="summary-card">
      <h3>Accuracy</h3>
      <p><strong>${metrics.accuracy}%</strong></p>
    </article>
    <article class="summary-card">
      <h3>Mean RT</h3>
      <p><strong>${metrics.meanRt} ms</strong></p>
    </article>
    <article class="summary-card">
      <h3>Main trials</h3>
      <p><strong>${metrics.mainTrialCount}</strong></p>
    </article>
  `;

  els.submissionStatus.textContent = APPS_SCRIPT_URL
    ? "자동 제출 중입니다..."
    : "Apps Script URL is empty.";
  if (DEBUG_MODE) {
    els.submissionStatus.textContent += " Debug mode is on.";
  }
}

async function syncResults() {
  if (!appState.results.length) {
    setStatusText("No data to submit yet.");
    return;
  }
  if (!APPS_SCRIPT_URL) {
    setStatusText("Apps Script URL is not configured yet.");
    return;
  }

  appState.lastSyncError = null;
  setStatusText("Submitting to Google Sheets...");

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        submittedAt: new Date().toISOString(),
        participant: appState.participant,
        rows: appState.results,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    appState.lastSubmission = data;
    appState.lastSyncError = null;
    setStatusText(
      data.participantAttemptId
        ? `Submission complete. Official ID: ${data.participantAttemptId}`
        : `Submission complete. Inserted ${data.insertedRows ?? 0} new rows.`
    );
  } catch (error) {
    appState.lastSyncError = error.message;
    setStatusText(`Submission failed: ${error.message}.`);
  }
}

function resetApp() {
  appState.participant = null;
  appState.currentTaskKey = null;
  appState.currentPhase = null;
  appState.currentTrials = [];
  appState.trialIndex = 0;
  appState.currentTrial = null;
  appState.currentTrialStart = null;
  appState.results = [];
  appState.taskRuns = [];
  appState.activeRun = null;
  appState.lastSubmission = null;
  els.setupForm.reset();
  hideAllPanels();
  els.setupPanel.classList.remove("hidden");
}

function retryCurrentTask() {
  if (appState.currentTaskKey) {
    showInstructions(appState.currentTaskKey);
  }
}

function goToOtherTask() {
  if (!appState.currentTaskKey) {
    showMenu();
    return;
  }
  const otherTaskKey = appState.currentTaskKey === "stroop" ? "visualSearch" : "stroop";
  showInstructions(otherTaskKey);
}

function buildStroopTrials(count) {
  const congruentCount = Math.floor(count / 2);
  const incongruentCount = count - congruentCount;
  const trials = [];

  for (let index = 0; index < congruentCount; index += 1) {
    const word = pickRandom(STROOP_COLORS);
    trials.push({
      wordLabel: word.label,
      inkCss: word.css,
      correctKey: word.key,
      data: {
        condition: "congruent",
        wordMeaning: word.key,
        inkColor: word.key,
        setSize: "",
        targetPresent: "",
      },
    });
  }

  for (let index = 0; index < incongruentCount; index += 1) {
    const word = pickRandom(STROOP_COLORS);
    const ink = pickRandom(STROOP_COLORS.filter((item) => item.key !== word.key));
    trials.push({
      wordLabel: word.label,
      inkCss: ink.css,
      correctKey: ink.key,
      data: {
        condition: "incongruent",
        wordMeaning: word.key,
        inkColor: ink.key,
        setSize: "",
        targetPresent: "",
      },
    });
  }
  return shuffle(trials);
}

function buildVisualSearchTrials(count) {
  const setSizes = [8, 16, 24];
  const trials = [];
  const featureCount = Math.floor(count / 2);
  const conjunctionCount = count - featureCount;

  addVisualConditionTrials("feature-search", featureCount);
  addVisualConditionTrials("conjunction-search", conjunctionCount);

  return shuffle(trials);

  function addVisualConditionTrials(condition, conditionCount) {
    const presentCount = Math.floor(conditionCount / 2);
    const absentCount = conditionCount - presentCount;
    const targetPresenceList = [
      ...Array.from({ length: presentCount }, () => true),
      ...Array.from({ length: absentCount }, () => false),
    ];

    targetPresenceList.forEach((targetPresent) => {
      const setSize = pickRandom(setSizes);
      const columns = setSize <= 8 ? 4 : 6;
      const items = [];

      if (targetPresent) {
        items.push(condition === "feature-search" ? VISUAL_STIMULI.featureTarget : VISUAL_STIMULI.conjunctionTarget);
      }

      while (items.length < setSize) {
        if (condition === "feature-search") {
          items.push(VISUAL_STIMULI.featureDistractor);
        } else {
          items.push(Math.random() < 0.5 ? VISUAL_STIMULI.conjunctionA : VISUAL_STIMULI.conjunctionB);
        }
      }

      trials.push({
        columns,
        items: shuffle(items),
        correctResponse: targetPresent ? "present" : "absent",
        data: {
          condition,
          wordMeaning: "",
          inkColor: "",
          setSize,
          targetPresent,
        },
      });
    });
  }
}

function sanitizeParticipantId(value) {
  const normalized = value.replace(/\s+/g, "").replace(/[^a-zA-Z0-9_-]/g, "");
  return normalized || "student";
}

function setButtonsDisabled(disabled) {
  els.responseButtons.querySelectorAll("button").forEach((button) => {
    button.disabled = disabled;
  });
}

function setStatusText(text) {
  els.submissionStatus.textContent = text;
  els.menuStatus.textContent = text;
}

function hideAllPanels() {
  els.setupPanel.classList.add("hidden");
  els.menuPanel.classList.add("hidden");
  els.instructionPanel.classList.add("hidden");
  els.taskPanel.classList.add("hidden");
  els.summaryPanel.classList.add("hidden");
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
