// 点検結果総括表用です。
// コード.gs の doPost(e) 内の switch (action) に以下を追加してください。
// case "uploadInspectionSummary":
//   return createJsonResponse(uploadInspectionSummary(body));

var INSPECTION_SUMMARY_SHEET_NAME_ = "点検結果総括表";
var INSPECTION_SUMMARY_FONT_ = "MS Mincho";
var INSPECTION_SUMMARY_START_ROW_ = 7;
var INSPECTION_SUMMARY_START_COLUMN_ = 2; // B
var INSPECTION_SUMMARY_COLUMN_COUNT_ = 28; // B:AC
var INSPECTION_SUMMARY_BLUE_ = "#9dc3e6";
var INSPECTION_SUMMARY_SAME_FILL_ = "#d9eaf7";

function uploadInspectionSummary(data) {
  var ss = SpreadsheetApp.openById(data.spreadsheetId);
  var sheet = ss.getSheetByName(INSPECTION_SUMMARY_SHEET_NAME_);

  if (!sheet) throw new Error("点検結果総括表 シートが見つかりません");
  if (sheet.isSheetHidden()) sheet.showSheet();

  var reportRows = Array.isArray(data.reportRows) ? data.reportRows : [];
  var slopeRows = Array.isArray(data.slopeRows) ? data.slopeRows : [];
  var reportCount = Math.max(0, Number(data.reportInspectionCount) || 0);
  var slopeCount = Math.max(0, Number(data.slopeInspectionCount) || 0);
  var totalCount = reportCount + slopeCount;

  writeInspectionSummaryHeader_(sheet, data, totalCount, reportCount, slopeCount);
  clearInspectionSummaryBody_(sheet);

  var row = INSPECTION_SUMMARY_START_ROW_;
  row = writeInspectionSummaryEvaluationSection_(
    sheet,
    row,
    "Ⅰ.形状判定",
    ["AA", "A1", "A2", "B"],
    reportRows,
    true,
    "・上記のBランク以上の損傷個所を確認しました。"
  );
  row += 1;
  row = writeInspectionSummaryEvaluationSection_(
    sheet,
    row,
    "Ⅱ.申し入れ等（改修済み、補修済み）",
    ["C", "S"],
    reportRows,
    false,
    "・上記の点検を実施しました。"
  );
  row += 1;
  row = writeInspectionSummarySlopeSection_(sheet, row, slopeRows);

  ensureInspectionSummaryRows_(sheet, row);
  var endRange = sheet.getRange(row, 27, 1, 2); // AA:AB
  endRange.merge().setValue("以上");
  formatInspectionSummaryRange_(endRange, 10, "center", false);

  sheet.setHiddenGridlines(true);
  return { success: true, lastRow: row };
}

function writeInspectionSummaryHeader_(sheet, data, totalCount, reportCount, slopeCount) {
  var year = String(data.year || "").trim().replace(/年度$/, "");
  var inspectors = String(data.inspector || "")
    .split(/[,、\n]+/)
    .map(function(value) { return String(value || "").trim(); })
    .filter(Boolean);

  setInspectionSummaryValue_(getInspectionSummaryHeaderRange_(sheet, "C1"), year ? year + "年度" : "", 12, "center", false);
  setInspectionSummaryValue_(getInspectionSummaryHeaderRange_(sheet, "D3"), data.stationNo || "", 12, "center", true);
  setInspectionSummaryValue_(getInspectionSummaryHeaderRange_(sheet, "F3"), data.stationName || "", 12, "center", true);
  setInspectionSummaryValue_(getInspectionSummaryHeaderRange_(sheet, "U3"), data.inspectDate || "", 10, "left", false);
  setInspectionSummaryValue_(getInspectionSummaryHeaderRange_(sheet, "U4"), inspectors.join(",\n"), 10, "left", false);
  setInspectionSummaryValue_(getInspectionSummaryHeaderRange_(sheet, "F4"), "－" + totalCount + "箇所", 12, "center", true);
  setInspectionSummaryValue_(getInspectionSummaryHeaderRange_(sheet, "D5"), "（" + reportCount + "箇所 + 傾斜 " + slopeCount + "箇所）", 10, "left", true);
  getInspectionSummaryHeaderRange_(sheet, "U4").setWrap(true);
}

function getInspectionSummaryHeaderRange_(sheet, a1Notation) {
  var cell = sheet.getRange(a1Notation);
  var mergedRanges = cell.getMergedRanges();
  return mergedRanges.length ? mergedRanges[0] : cell;
}

function clearInspectionSummaryBody_(sheet) {
  var rowCount = Math.max(sheet.getMaxRows() - INSPECTION_SUMMARY_START_ROW_ + 1, 1);
  var range = sheet.getRange(
    INSPECTION_SUMMARY_START_ROW_,
    INSPECTION_SUMMARY_START_COLUMN_,
    rowCount,
    INSPECTION_SUMMARY_COLUMN_COUNT_
  );
  range.breakApart();
  range.clearContent();
  range.setBorder(false, false, false, false, false, false);
  range.setBackground("#ffffff");
  range.setFontFamily(INSPECTION_SUMMARY_FONT_).setFontColor("#000000").setFontWeight("normal");
}

function writeInspectionSummaryEvaluationSection_(sheet, row, title, evaluations, sourceRows, redEvaluation, note) {
  ensureInspectionSummaryRows_(sheet, row + 2);
  var titleEndColumn = title.indexOf("Ⅱ.") === 0 ? 12 : 5;
  var titleRange = mergeInspectionSummaryRange_(sheet, row, 2, titleEndColumn);
  setInspectionSummaryValue_(titleRange, title, 10, "left", true);
  row += 1;

  evaluations.forEach(function(evaluation) {
    var rows = sourceRows.filter(function(item) {
      return String(item.totalEval || "").trim().toUpperCase() === evaluation;
    });

    ensureInspectionSummaryRows_(sheet, row + rows.length + 2);
    var evaluationRange = mergeInspectionSummaryRange_(sheet, row, 2, 3);
    setInspectionSummaryEvaluationLabel_(evaluationRange, evaluation, redEvaluation);
    var resultRange = mergeInspectionSummaryRange_(sheet, row, 4, 8);
    setInspectionSummaryValue_(
      resultRange,
      rows.length ? "－" + rows.length + "箇所" : "－今回　該当なし",
      10,
      "left",
      false
    );
    row += 1;

    if (rows.length) {
      writeInspectionSummaryReportHeader_(sheet, row);
      row += 1;
      rows.forEach(function(item) {
        writeInspectionSummaryReportRow_(sheet, row, item);
        row += 1;
      });
    }
  });

  var noteRange = mergeInspectionSummaryRange_(sheet, row, 2, 29);
  setInspectionSummaryValue_(noteRange, note, 10, "left", false);
  return row + 1;
}

function writeInspectionSummarySlopeSection_(sheet, row, rows) {
  ensureInspectionSummaryRows_(sheet, row + rows.length + 4);
  var titleRange = mergeInspectionSummaryRange_(sheet, row, 2, 5);
  setInspectionSummaryValue_(titleRange, "Ⅲ.傾斜測定", 10, "left", true);
  row += 1;

  if (!rows.length) {
    var emptyRange = mergeInspectionSummaryRange_(sheet, row, 2, 29);
    setInspectionSummaryValue_(emptyRange, "・今回　10.0mmを超える測定値は確認されませんでした。", 10, "left", false);
    return row + 1;
  }

  var countRange = mergeInspectionSummaryRange_(sheet, row, 2, 29);
  setInspectionSummaryValue_(countRange, "・測定値　10.0mm以上－" + rows.length + "箇所", 10, "left", false);
  row += 1;
  writeInspectionSummarySlopeHeader_(sheet, row);
  row += 1;

  rows.forEach(function(item) {
    writeInspectionSummarySlopeRow_(sheet, row, item);
    row += 1;
  });

  var noteRange = mergeInspectionSummaryRange_(sheet, row, 2, 29);
  setInspectionSummaryValue_(noteRange, "・上記の10.0mmを超える測定値を確認しました。", 10, "left", false);
  return row + 1;
}

function writeInspectionSummaryReportHeader_(sheet, row) {
  var cells = [
    [2, 3, "写真No.", 10],
    [4, 5, "点検\n箇所数", 8],
    [6, 9, "建物名", 10],
    [10, 14, "点検場所", 10],
    [15, 19, "仕上げ", 10],
    [20, 29, "現況説明（■は前回と同じ）", 10],
  ];
  cells.forEach(function(cell) {
    var range = mergeInspectionSummaryRange_(sheet, row, cell[0], cell[1]);
    setInspectionSummaryValue_(range, cell[2], cell[3], "center", false);
    setInspectionSummaryTableBorder_(range);
    if (cell[0] === 20) setInspectionSummaryBlueSquare_(range, cell[2]);
  });
}

function writeInspectionSummaryReportRow_(sheet, row, item) {
  var cells = [
    [2, 3, item.photoNo || ""],
    [4, 5, ""],
    [6, 9, item.buildingName || ""],
    [10, 14, item.inspectionPlace || ""],
    [15, 19, item.finishType || ""],
    [20, 29, item.currentSituation || ""],
  ];
  cells.forEach(function(cell, index) {
    var range = mergeInspectionSummaryRange_(sheet, row, cell[0], cell[1]);
    setInspectionSummaryValue_(range, cell[2], 10, index === 5 ? "left" : "center", false);
    if (index === 5 && String(cell[2]).indexOf("前回と同じ") >= 0) {
      range.setBackground(INSPECTION_SUMMARY_SAME_FILL_);
    }
    setInspectionSummaryTableBorder_(range);
  });
}

function writeInspectionSummarySlopeHeader_(sheet, row) {
  var cells = [
    [2, 3, "測点", 10],
    [4, 9, "建物名\n点検場所", 8],
    [10, 14, "東西方向", 10],
    [15, 19, "南北方向", 10],
    [20, 29, "現況説明（■は前回と同じ）", 10],
  ];
  cells.forEach(function(cell) {
    var range = mergeInspectionSummaryRange_(sheet, row, cell[0], cell[1]);
    setInspectionSummaryValue_(range, cell[2], cell[3], "center", false);
    setInspectionSummaryTableBorder_(range);
    if (cell[0] === 20) setInspectionSummaryBlueSquare_(range, cell[2]);
  });
}

function writeInspectionSummarySlopeRow_(sheet, row, item) {
  var place = [item.place, item.placeSide].filter(Boolean).join("\n");
  var ew = formatInspectionSummarySlopeValue_(item.currentEwDirection, item.currentEwValue);
  var ns = formatInspectionSummarySlopeValue_(item.currentNsDirection, item.currentNsValue);
  var cells = [
    [2, 3, item.point || "", 10, "center"],
    [4, 9, place, 8, "center"],
    [10, 14, ew, 10, "center"],
    [15, 19, ns, 10, "center"],
    [20, 29, item.note || "", 10, "left"],
  ];
  var sameEw = isInspectionSummarySameSlope_(item.currentEwDirection, item.currentEwValue, item.firstEwDirection, item.firstEwValue);
  var sameNs = isInspectionSummarySameSlope_(item.currentNsDirection, item.currentNsValue, item.firstNsDirection, item.firstNsValue);
  cells.forEach(function(cell) {
    var range = mergeInspectionSummaryRange_(sheet, row, cell[0], cell[1]);
    setInspectionSummaryValue_(range, cell[2], cell[3], cell[4], false);
    if (cell[0] === 20 && (sameEw || sameNs)) {
      range.setBackground(INSPECTION_SUMMARY_SAME_FILL_);
    }
    if (cell[0] === 20 && String(cell[2]).indexOf("前回と同じ") >= 0) {
      range.setBackground(INSPECTION_SUMMARY_SAME_FILL_);
    }
    setInspectionSummaryTableBorder_(range);
  });
}

function formatInspectionSummarySlopeValue_(direction, value) {
  var directionText = String(direction || "").trim();
  var valueText = String(value || "").trim();
  if (directionText && valueText) return directionText + "　　" + valueText + " (mm)";
  if (valueText) return valueText + " (mm)";
  return directionText;
}

function isInspectionSummarySameSlope_(currentDirection, currentValue, previousDirection, previousValue) {
  var currentText = String(currentValue || "").trim();
  var previousText = String(previousValue || "").trim();
  if (!currentText || !previousText) return false;
  var currentNumber = Number(currentText.replace(/[^\d.-]/g, ""));
  var previousNumber = Number(previousText.replace(/[^\d.-]/g, ""));
  var sameValue = isFinite(currentNumber) && isFinite(previousNumber)
    ? currentNumber === previousNumber
    : currentText === previousText;
  return sameValue && String(currentDirection || "").trim() === String(previousDirection || "").trim();
}

function setInspectionSummaryEvaluationLabel_(range, evaluation, red) {
  var text = "【" + evaluation + "】";
  setInspectionSummaryValue_(range, text, 10, "center", false);
  if (!red) return;

  var baseStyle = SpreadsheetApp.newTextStyle()
    .setFontFamily(INSPECTION_SUMMARY_FONT_)
    .setFontSize(10)
    .setForegroundColor("#000000")
    .build();
  var redStyle = SpreadsheetApp.newTextStyle()
    .setFontFamily(INSPECTION_SUMMARY_FONT_)
    .setFontSize(10)
    .setForegroundColor("#ff0000")
    .build();
  var richText = SpreadsheetApp.newRichTextValue()
    .setText(text)
    .setTextStyle(baseStyle)
    .setTextStyle(1, 1 + evaluation.length, redStyle)
    .build();
  range.setRichTextValue(richText);
}

function setInspectionSummaryBlueSquare_(range, text) {
  var index = String(text).indexOf("■");
  if (index < 0) return;
  var baseStyle = SpreadsheetApp.newTextStyle()
    .setFontFamily(INSPECTION_SUMMARY_FONT_)
    .setFontSize(10)
    .setForegroundColor("#000000")
    .build();
  var blueStyle = SpreadsheetApp.newTextStyle()
    .setFontFamily(INSPECTION_SUMMARY_FONT_)
    .setFontSize(10)
    .setForegroundColor(INSPECTION_SUMMARY_BLUE_)
    .build();
  range.setRichTextValue(
    SpreadsheetApp.newRichTextValue()
      .setText(String(text))
      .setTextStyle(baseStyle)
      .setTextStyle(index, index + 1, blueStyle)
      .build()
  );
}

function setInspectionSummaryValue_(range, value, size, alignment, bold) {
  range.setNumberFormat("@").setValue(String(value === null || value === undefined ? "" : value));
  formatInspectionSummaryRange_(range, size, alignment, bold);
}

function formatInspectionSummaryRange_(range, size, alignment, bold) {
  range
    .setFontFamily(INSPECTION_SUMMARY_FONT_)
    .setFontColor("#000000")
    .setFontSize(size)
    .setFontWeight(bold ? "bold" : "normal")
    .setHorizontalAlignment(alignment)
    .setVerticalAlignment("middle")
    .setWrap(true);
}

function mergeInspectionSummaryRange_(sheet, row, startColumn, endColumn) {
  var range = sheet.getRange(row, startColumn, 1, endColumn - startColumn + 1);
  range.merge();
  return range;
}

function setInspectionSummaryTableBorder_(range) {
  range.setBorder(true, true, true, true, false, false, "#000000", SpreadsheetApp.BorderStyle.SOLID);
}

function ensureInspectionSummaryRows_(sheet, requiredRow) {
  if (sheet.getMaxRows() < requiredRow) {
    sheet.insertRowsAfter(sheet.getMaxRows(), requiredRow - sheet.getMaxRows());
  }
}
