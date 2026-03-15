function doPost(e) {
  var payload = JSON.parse(e.postData.contents || "{}");
  var participant = payload.participant || {};
  var rows = payload.rows || [];
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var rawSheet = getOrCreateSheet(spreadsheet, "raw", [
    "submittedAt",
    "baseParticipantId",
    "participantAttemptId",
    "deviceType",
    "runId",
    "localRunLabel",
    "rowId",
    "taskId",
    "phase",
    "trialNumber",
    "timestamp",
    "response",
    "correct",
    "reactionTimeMs",
    "condition",
    "wordMeaning",
    "inkColor",
    "setSize",
    "targetPresent",
    "userAgent",
  ]);
  var submissionsSheet = getOrCreateSheet(spreadsheet, "submissions", [
    "submittedAt",
    "baseParticipantId",
    "participantAttemptId",
    "attemptNumber",
    "insertedRows",
  ]);

  var existingRowIds = getExistingValues(rawSheet, "rowId");
  var newRows = rows.filter(function(row) {
    return row.rowId && !existingRowIds[row.rowId];
  });

  if (newRows.length === 0) {
    return jsonResponse({
      ok: true,
      insertedRows: 0,
      participantAttemptId: "",
      message: "No new rows inserted.",
    });
  }

  var baseParticipantId = participant.baseParticipantId || "student";
  var attemptNumber = getNextAttemptNumber(submissionsSheet, baseParticipantId);
  var participantAttemptId = baseParticipantId + "_" + attemptNumber;
  var submittedAt = payload.submittedAt || new Date().toISOString();

  var values = newRows.map(function(row) {
    return [
      submittedAt,
      row.baseParticipantId || baseParticipantId,
      participantAttemptId,
      row.deviceType || participant.deviceType || "",
      row.runId || "",
      row.localRunLabel || "",
      row.rowId || "",
      row.taskId || "",
      row.phase || "",
      row.trialNumber || "",
      row.timestamp || "",
      row.response || "",
      row.correct,
      row.reactionTimeMs || "",
      row.condition || "",
      row.wordMeaning || "",
      row.inkColor || "",
      row.setSize || "",
      row.targetPresent,
      row.userAgent || participant.userAgent || "",
    ];
  });

  rawSheet.getRange(rawSheet.getLastRow() + 1, 1, values.length, values[0].length).setValues(values);
  submissionsSheet.appendRow([submittedAt, baseParticipantId, participantAttemptId, attemptNumber, newRows.length]);

  return jsonResponse({
    ok: true,
    insertedRows: newRows.length,
    participantAttemptId: participantAttemptId,
  });
}

function doGet(e) {
  var mode = (e.parameter && e.parameter.mode) || "summary";
  if (mode !== "summary") {
    return jsonResponse({ ok: false, message: "Unsupported mode" });
  }

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var rawSheet = spreadsheet.getSheetByName("raw");
  if (!rawSheet || rawSheet.getLastRow() < 2) {
    return jsonResponse({
      ok: true,
      generatedAt: new Date().toISOString(),
      winners: {},
      leaderboards: {},
      conditionMeans: {},
    });
  }

  var rows = getSheetRows(rawSheet).filter(function(row) {
    return row.phase === "main";
  });
  var summaries = summarizeRuns(rows);

  return jsonResponse({
    ok: true,
    generatedAt: new Date().toISOString(),
    winners: buildWinners(summaries),
    leaderboards: buildLeaderboards(summaries),
    conditionMeans: buildConditionMeans(rows),
  });
}

function getOrCreateSheet(spreadsheet, name, headers) {
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }
  return sheet;
}

function getExistingValues(sheet, keyName) {
  var rows = getSheetRows(sheet);
  var map = {};
  rows.forEach(function(row) {
    if (row[keyName]) {
      map[row[keyName]] = true;
    }
  });
  return map;
}

function getNextAttemptNumber(sheet, baseParticipantId) {
  var rows = getSheetRows(sheet);
  var matching = rows.filter(function(row) {
    return row.baseParticipantId === baseParticipantId;
  });
  return matching.length + 1;
}

function getSheetRows(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return [];
  }
  var headers = values[0];
  return values.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(header, index) {
      obj[header] = row[index];
    });
    return obj;
  });
}

function summarizeRuns(rows) {
  var groups = {};

  rows.forEach(function(row) {
    var key = [row.participantAttemptId, row.taskId, row.runId].join("::");
    if (!groups[key]) {
      groups[key] = {
        participantAttemptId: row.participantAttemptId,
        baseParticipantId: row.baseParticipantId,
        taskId: row.taskId,
        runId: row.runId,
        reactionTimes: [],
        correctCount: 0,
        totalCount: 0,
      };
    }

    groups[key].reactionTimes.push(Number(row.reactionTimeMs) || 0);
    groups[key].correctCount += row.correct === true || row.correct === "TRUE" || row.correct === "true" ? 1 : 0;
    groups[key].totalCount += 1;
  });

  return Object.keys(groups).map(function(key) {
    var group = groups[key];
    var meanRt = average(group.reactionTimes);
    var accuracy = group.totalCount ? (group.correctCount / group.totalCount) * 100 : 0;
    return {
      participantAttemptId: group.participantAttemptId,
      baseParticipantId: group.baseParticipantId,
      taskId: group.taskId,
      runId: group.runId,
      meanRt: round(meanRt),
      accuracy: round(accuracy),
      totalCount: group.totalCount,
    };
  });
}

function buildWinners(summaries) {
  var winners = {};
  ["stroop", "visual-search"].forEach(function(taskId) {
    var taskRuns = summaries
      .filter(function(item) { return item.taskId === taskId; })
      .sort(compareRuns);
    if (taskRuns.length) {
      winners[taskId] = taskRuns[0];
    }
  });
  return winners;
}

function buildLeaderboards(summaries) {
  var leaderboards = {};
  ["stroop", "visual-search"].forEach(function(taskId) {
    leaderboards[taskId] = summaries
      .filter(function(item) { return item.taskId === taskId; })
      .sort(compareRuns)
      .slice(0, 5);
  });
  return leaderboards;
}

function buildConditionMeans(rows) {
  var buckets = {};
  rows.forEach(function(row) {
    var taskId = row.taskId || "unknown";
    var condition = row.condition || "unknown";
    var key = taskId + "::" + condition;
    if (!buckets[key]) {
      buckets[key] = {
        taskId: taskId,
        condition: condition,
        reactionTimes: [],
        correctCount: 0,
        totalCount: 0,
      };
    }

    buckets[key].reactionTimes.push(Number(row.reactionTimeMs) || 0);
    buckets[key].correctCount += row.correct === true || row.correct === "TRUE" || row.correct === "true" ? 1 : 0;
    buckets[key].totalCount += 1;
  });

  var result = {};
  Object.keys(buckets).forEach(function(key) {
    var bucket = buckets[key];
    if (!result[bucket.taskId]) {
      result[bucket.taskId] = [];
    }
    result[bucket.taskId].push({
      condition: bucket.condition,
      meanRt: round(average(bucket.reactionTimes)),
      accuracy: round(bucket.totalCount ? (bucket.correctCount / bucket.totalCount) * 100 : 0),
      trialCount: bucket.totalCount,
    });
  });

  Object.keys(result).forEach(function(taskId) {
    result[taskId].sort(function(a, b) {
      return String(a.condition).localeCompare(String(b.condition));
    });
  });

  return result;
}

function compareRuns(a, b) {
  if (b.accuracy !== a.accuracy) {
    return b.accuracy - a.accuracy;
  }
  return a.meanRt - b.meanRt;
}

function average(values) {
  if (!values.length) {
    return 0;
  }
  var total = values.reduce(function(sum, value) {
    return sum + value;
  }, 0);
  return total / values.length;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
