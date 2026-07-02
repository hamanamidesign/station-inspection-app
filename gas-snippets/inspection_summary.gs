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

  createInspectionSummaryPdfSheets_(ss, sheet, data, reportRows, slopeRows);

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

function createInspectionSummaryPdfSheets_(ss, source, data, reportRows, slopeRows) {
  deleteInspectionSummaryPdfSheets_(ss);
  var pages = buildInspectionSummaryPdfPages_(reportRows, slopeRows);
  var totalPages = pages.length;

  pages.forEach(function(items, pageIndex) {
    var pageSheet = source.copyTo(ss).setName("点検結果総括表_" + (pageIndex + 1));
    pageSheet.setHiddenGridlines(true);
    copyInspectionSummaryColumnWidths_(source, pageSheet);

    if (pageIndex === 0) {
      clearInspectionSummaryBody_(pageSheet);
    } else {
      resetInspectionSummaryPdfPage_(pageSheet);
    }

    var row = pageIndex === 0 ? 7 : 1;
    items.forEach(function(item) {
      ensureInspectionSummaryRows_(pageSheet, row);
      row = renderInspectionSummaryPdfItem_(pageSheet, row, item);
    });

    var footerRow = pageIndex === 0 ? 27 : 26;
    ensureInspectionSummaryRows_(pageSheet, footerRow);
    var footerRange = mergeInspectionSummaryRange_(pageSheet, footerRow, 2, 29);
    setInspectionSummaryValue_(
      footerRange,
      "－" + String(data.stationName || "") + " " + (pageIndex + 1) + " / " + totalPages,
      9,
      "center",
      false
    );
    pageSheet.setRowHeight(footerRow, 20);
    trimInspectionSummaryPdfSheet_(pageSheet, footerRow);
    pageSheet.hideSheet();
  });
}

function buildInspectionSummaryPdfPages_(reportRows, slopeRows) {
  var pages = [[]];

  function currentPage_() {
    return pages[pages.length - 1];
  }

  function capacity_() {
    return pages.length === 1 ? 15 : 17;
  }

  function remaining_() {
    return capacity_() - currentPage_().length;
  }

  function newPage_() {
    pages.push([]);
  }

  function addSectionTitle_(title, minimumRows) {
    var requiredRows = Math.max(2, Number(minimumRows) || 2);
    if (remaining_() < requiredRows && currentPage_().length) newPage_();
    currentPage_().push({ type: "title", title: title });
  }

  function repeatSectionTitle_(title) {
    if (currentPage_().length === 0) currentPage_().push({ type: "title", title: title });
  }

  function addEvaluationSection_(title, evaluations, redEvaluations, note) {
    addSectionTitle_(title, 4);

    evaluations.forEach(function(evaluation) {
      var rows = reportRows.filter(function(item) {
        return String(item.totalEval || "").trim().toUpperCase() === evaluation;
      });

      if (!rows.length) {
        if (remaining_() < 1) {
          newPage_();
          repeatSectionTitle_(title);
        }
        currentPage_().push({
          type: "evaluation",
          evaluation: evaluation,
          count: 0,
          red: redEvaluations.indexOf(evaluation) !== -1,
        });
        return;
      }

      var index = 0;
      var needsHeader = true;
      while (index < rows.length) {
        if (needsHeader) {
          if (remaining_() < 3) {
            newPage_();
            repeatSectionTitle_(title);
          }
          currentPage_().push({
            type: "evaluation",
            evaluation: evaluation,
            count: rows.length,
            continued: index > 0,
            red: redEvaluations.indexOf(evaluation) !== -1,
          });
          currentPage_().push({ type: "reportHeader" });
          needsHeader = false;
        }

        var take = Math.min(remaining_(), rows.length - index);
        for (var offset = 0; offset < take; offset += 1) {
          currentPage_().push({ type: "reportRow", row: rows[index + offset] });
        }
        index += take;

        if (index < rows.length) {
          newPage_();
          repeatSectionTitle_(title);
          needsHeader = true;
        }
      }
    });

    if (remaining_() < 1) {
      newPage_();
      repeatSectionTitle_(title);
    }
    currentPage_().push({ type: "note", text: note });
  }

  addEvaluationSection_(
    "Ⅰ.形状判定",
    ["AA", "A1", "A2", "B"],
    ["AA", "A1", "A2", "B"],
    "・上記のBランク以上の損傷個所を確認しました。"
  );
  if (remaining_() > 0) currentPage_().push({ type: "blank" });

  addEvaluationSection_(
    "Ⅱ.申し入れ等（改修済み、補修済み）",
    ["C", "S"],
    [],
    "・上記の点検を実施しました。"
  );
  if (remaining_() > 0) currentPage_().push({ type: "blank" });

  var slopeTitle = "Ⅲ.傾斜測定";
  addSectionTitle_(slopeTitle, slopeRows.length ? 4 : 2);
  if (!slopeRows.length) {
    if (remaining_() < 1) {
      newPage_();
      repeatSectionTitle_(slopeTitle);
    }
    currentPage_().push({ type: "slopeEmpty" });
  } else {
    var slopeIndex = 0;
    var slopeNeedsHeader = true;
    while (slopeIndex < slopeRows.length) {
      if (slopeNeedsHeader) {
        if (remaining_() < 3) {
          newPage_();
          repeatSectionTitle_(slopeTitle);
        }
        currentPage_().push({ type: "slopeCount", count: slopeRows.length });
        currentPage_().push({ type: "slopeHeader" });
        slopeNeedsHeader = false;
      }

      var slopeTake = Math.min(remaining_(), slopeRows.length - slopeIndex);
      for (var slopeOffset = 0; slopeOffset < slopeTake; slopeOffset += 1) {
        currentPage_().push({ type: "slopeRow", row: slopeRows[slopeIndex + slopeOffset] });
      }
      slopeIndex += slopeTake;

      if (slopeIndex < slopeRows.length) {
        newPage_();
        repeatSectionTitle_(slopeTitle);
        slopeNeedsHeader = true;
      }
    }

    if (remaining_() < 1) {
      newPage_();
      repeatSectionTitle_(slopeTitle);
    }
    currentPage_().push({ type: "note", text: "・上記の10.0mmを超える測定値を確認しました。" });
  }

  if (remaining_() < 1) newPage_();
  currentPage_().push({ type: "end" });
  return pages.filter(function(page) { return page.length > 0; });
}

function renderInspectionSummaryPdfItem_(sheet, row, item) {
  if (item.type === "blank") return row + 1;

  if (item.type === "title") {
    var titleEndColumn = String(item.title || "").indexOf("Ⅱ.") === 0 ? 12 : 5;
    var titleRange = mergeInspectionSummaryRange_(sheet, row, 2, titleEndColumn);
    setInspectionSummaryValue_(titleRange, item.title, 10, "left", true);
    sheet.setRowHeight(row, 22);
    return row + 1;
  }

  if (item.type === "evaluation") {
    var evaluationRange = mergeInspectionSummaryRange_(sheet, row, 2, 3);
    setInspectionSummaryEvaluationLabel_(evaluationRange, item.evaluation, item.red);
    var resultRange = mergeInspectionSummaryRange_(sheet, row, 4, 8);
    var resultText = item.continued
      ? ""
      : item.count
        ? "－" + item.count + "箇所"
        : "－今回　該当なし";
    setInspectionSummaryValue_(resultRange, resultText, 10, "left", false);
    sheet.setRowHeight(row, 22);
    return row + 1;
  }

  if (item.type === "reportHeader") {
    writeInspectionSummaryReportHeader_(sheet, row);
    sheet.setRowHeight(row, 32);
    return row + 1;
  }

  if (item.type === "reportRow") {
    writeInspectionSummaryReportRow_(sheet, row, item.row);
    sheet.setRowHeight(row, 38);
    return row + 1;
  }

  if (item.type === "slopeCount") {
    var countRange = mergeInspectionSummaryRange_(sheet, row, 2, 29);
    setInspectionSummaryValue_(countRange, "・測定値　10.0mm以上－" + item.count + "箇所", 10, "left", false);
    return row + 1;
  }

  if (item.type === "slopeHeader") {
    writeInspectionSummarySlopeHeader_(sheet, row);
    sheet.setRowHeight(row, 32);
    return row + 1;
  }

  if (item.type === "slopeRow") {
    writeInspectionSummarySlopeRow_(sheet, row, item.row);
    sheet.setRowHeight(row, 38);
    return row + 1;
  }

  if (item.type === "slopeEmpty") {
    var emptyRange = mergeInspectionSummaryRange_(sheet, row, 2, 29);
    setInspectionSummaryValue_(emptyRange, "・今回　10.0mmを超える測定値は確認されませんでした。", 10, "left", false);
    return row + 1;
  }

  if (item.type === "note") {
    var noteRange = mergeInspectionSummaryRange_(sheet, row, 2, 29);
    setInspectionSummaryValue_(noteRange, item.text, 10, "left", false);
    return row + 1;
  }

  if (item.type === "end") {
    var endRange = mergeInspectionSummaryRange_(sheet, row, 27, 28);
    setInspectionSummaryValue_(endRange, "以上", 10, "center", false);
    return row + 1;
  }

  return row;
}

function deleteInspectionSummaryPdfSheets_(ss) {
  ss.getSheets().forEach(function(sheet) {
    if (/^点検結果総括表_\d+$/.test(sheet.getName())) ss.deleteSheet(sheet);
  });
}

function resetInspectionSummaryPdfPage_(sheet) {
  var range = sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns());
  range.breakApart().clear();
  range.setBackground("#ffffff");
}

function copyInspectionSummaryColumnWidths_(source, target) {
  for (var column = 1; column <= 29; column += 1) {
    target.setColumnWidth(column, source.getColumnWidth(column));
  }
}

function trimInspectionSummaryPdfSheet_(sheet, lastRow) {
  if (sheet.getMaxRows() > lastRow) {
    sheet.deleteRows(lastRow + 1, sheet.getMaxRows() - lastRow);
  }
  if (sheet.getMaxColumns() > 29) {
    sheet.deleteColumns(30, sheet.getMaxColumns() - 29);
  }
}
