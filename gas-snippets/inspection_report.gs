// 施設点検報告書用です。
// コード.gs の doPost(e) 内の switch (action) に、以下を必ず追加して再デプロイしてください。
// 追加されていない場合、アプリ側で
// 「unknown action action=getInspectionReportData」と表示されます。
// case "getInspectionReportData":
//   return createJsonResponse(getInspectionReportData(body));
// case "uploadInspectionReport":
//   return createJsonResponse(uploadInspectionReport(body));

function getInspectionReportData(data) {
  const ss = SpreadsheetApp.openById(data.spreadsheetId);

  const karteSheets = ss
    .getSheets()
    .filter(sheet => /^\d+$/.test(sheet.getName()))
    .sort((a, b) => Number(a.getName()) - Number(b.getName()));

  const offset = Math.max(0, Number(data.offset) || 0);
  const limit = Math.min(Math.max(Number(data.limit) || 25, 1), 50);
  const pageSheets = karteSheets.slice(offset, offset + limit);

  const baseSheet = offset === 0 ? (ss.getSheetByName("1") || karteSheets[0] || null) : null;
  const baseValues = baseSheet ? baseSheet.getRange("A1:V16").getDisplayValues() : null;
  const pageHeader = {
    inspectDates: [],
    inspectors: [],
  };

  const rows = pageSheets.map(sheet => {
    const values = sheet.getRange("A1:V16").getDisplayValues();
    const firstDate = getInspectionReportCell_(values, 5, 6);
    const latestDate = getInspectionReportCell_(values, 5, 18);
    const firstSituation = joinInspectionReportText_(
      getInspectionReportCell_(values, 13, 10),
      getInspectionReportCell_(values, 16, 10)
    );
    const currentSituation = joinInspectionReportText_(
      getInspectionReportCell_(values, 13, 22),
      getInspectionReportCell_(values, 16, 22)
    );
    const useFirstSituationAsCurrent =
      isInspectionReportCurrentYearFirstInspection_(firstDate, data.year);

    addInspectionReportUnique_(pageHeader.inspectDates, latestDate);
    addInspectionReportUnique_(pageHeader.inspectors, getInspectionReportCell_(values, 6, 18));

    return {
    buildingName: getInspectionReportCell_(values, 1, 12),
    inspectionPlace: buildInspectionReportPlace_(
      getInspectionReportCell_(values, 1, 16),
      getInspectionReportCell_(values, 1, 17)
    ),
    photoNo: getInspectionReportCell_(values, 1, 4) || sheet.getName(),
    finishType: getInspectionReportCell_(values, 10, 10),
    firstSituation: useFirstSituationAsCurrent ? "" : firstSituation,
    firstEval: extractInspectionReportYear_(firstDate),
    previousYearEval: getInspectionReportCell_(values, 3, 17),
    currentSituation: useFirstSituationAsCurrent
      ? joinInspectionReportText_(currentSituation, firstSituation)
      : currentSituation,
    structEval: getInspectionReportCell_(values, 3, 6),
    impactEval: getInspectionReportCell_(values, 3, 9),
    totalEval: getInspectionReportCell_(values, 3, 12),
    };
  });

  const header = {
    stationNo: data.stationNo || "",
    stationName: data.station || "",
    inspectDate: pageHeader.inspectDates.join(",　") || (baseValues ? getInspectionReportCell_(baseValues, 5, 18) : ""),
    contractor: baseValues ? getInspectionReportCell_(baseValues, 3, 22) : "",
    inspector: pageHeader.inspectors.join(",　") || (baseValues ? getInspectionReportCell_(baseValues, 6, 18) : ""),
  };

  const nextOffset = offset + rows.length;

  return {
    success: true,
    header: header,
    rows: rows,
    offset: offset,
    limit: limit,
    nextOffset: nextOffset,
    total: karteSheets.length,
    hasMore: nextOffset < karteSheets.length,
  };
}

function getInspectionReportCell_(values, row, column) {
  return values[row - 1] && values[row - 1][column - 1]
    ? String(values[row - 1][column - 1]).trim()
    : "";
}

function addInspectionReportUnique_(items, value) {
  const text = String(value || "").trim();
  if (text && items.indexOf(text) === -1) items.push(text);
}

function buildInspectionReportPlace_(place, detail) {
  const placeText = String(place || "").trim();
  const detailText = String(detail || "").trim();
  if (placeText && detailText) return placeText + "\n" + detailText;
  return placeText || detailText;
}
function joinInspectionReportText_() {
  return Array.prototype.slice.call(arguments)
    .map(value => String(value || "").trim())
    .filter(Boolean)
    .join("\n");
}

function isInspectionReportCurrentYearFirstInspection_(firstDate, year) {
  const firstYear = extractInspectionReportYear_(firstDate);
  const targetYear = extractInspectionReportYear_(year);

  return !!firstYear && !!targetYear && firstYear === targetYear;
}

function extractInspectionReportYear_(value) {
  const text = String(value || "").trim();
  const match = text.match(/(?:19|20)\d{2}/);
  return match ? match[0] : "";
}

function uploadInspectionReport(data) {
  const ss = SpreadsheetApp.openById(data.spreadsheetId);
  const sheet = ss.getSheetByName("施設点検報告書");

  if (!sheet) {
    throw new Error("施設点検報告書 シートが見つかりません");
  }

  if (sheet.isSheetHidden()) {
    sheet.showSheet();
  }

  sheet.setHiddenGridlines(true);

  const rows = Array.isArray(data.rows)
    ? data.rows.filter(row => inspectionReportRowHasValue_(row))
    : [];

  sheet.getRange("M2").setNumberFormat("@").setValue(inspectionReportText_(data.contractor));
  sheet.getRange("B3").setNumberFormat("@").setValue(inspectionReportText_(data.stationNo));
  sheet.getRange("D3").setNumberFormat("@").setValue(inspectionReportText_(data.stationName));
  ["H4", "H5"].forEach(a1Notation => sheet.getRange(a1Notation).clearContent());
  sheet.getRange("M4").setNumberFormat("@").setValue(inspectionReportText_(data.inspectDate));
  sheet.getRange("M5").setNumberFormat("@").setValue(inspectionReportText_(data.inspector));
  sheet.getRange("A1").setNumberFormat("@").setValue(buildInspectionReportTitle_(data.year));
  applyInspectionReportLayoutSettings_(sheet);
  applyInspectionReportCurrentYearHeader_(sheet, data.year);
  applyInspectionReportHeaderWraps_(sheet);

  const startRow = 9;
  const clearRows = Math.max(rows.length, 23, Math.max(sheet.getLastRow() - startRow + 1, 0));
  if (clearRows > 0) {
    ensureInspectionReportRows_(sheet, startRow + clearRows - 1);
    sheet
      .getRange(startRow, 1, clearRows, 17)
      .breakApart()
      .clearContent();
  }

  const borderRows = rows.length;
  applyInspectionReportTableBorders_(sheet, startRow, borderRows, rows.length, clearRows);
  applyInspectionReportTableAlignments_(sheet, startRow, rows.length);
  applyInspectionReportTableWraps_(sheet, startRow, rows.length);

  if (rows.length === 0) {
    SpreadsheetApp.flush();
    return { success: true, rowCount: 0 };
  }

  const columns = [
    { column: 1, field: "buildingName" },
    { column: 3, field: "inspectionPlace" },
    { column: 5, field: "photoNo" },
    { column: 6, field: "finishType" },
    { column: 7, field: "firstSituation" },
    { column: 10, field: "firstEval" },
    { column: 11, field: "previousYearEval" },
    { column: 12, field: "currentSituation" },
    { column: 15, field: "structEval" },
    { column: 16, field: "impactEval" },
    { column: 17, field: "totalEval" },
  ];

  columns.forEach(item => {
    const values = rows.map(row => [inspectionReportText_(row[item.field])]);
    sheet
      .getRange(startRow, item.column, values.length, 1)
      .setNumberFormat("@")
      .setValues(values);
  });
  applyInspectionReportFinishTypeLineBreaks_(sheet, startRow, rows.length);

  applyInspectionReportDefaultFontColors_(sheet, startRow, rows.length);
  applyInspectionReportEvalFontColors_(sheet, startRow, rows);

  SpreadsheetApp.flush();
  applyInspectionReportEstimatedRowHeights_(sheet, startRow, rows.length);
  createInspectionReportPdfSheets_(ss, sheet, startRow, rows.length);
  SpreadsheetApp.flush();

  return {
    success: true,
    rowCount: rows.length,
  };
}

function inspectionReportRowHasValue_(row) {
  if (!row) return false;
  return [
    "buildingName",
    "inspectionPlace",
    "photoNo",
    "finishType",
    "firstSituation",
    "firstEval",
    "previousYearEval",
    "currentSituation",
    "structEval",
    "impactEval",
    "totalEval",
  ].some(field => String(row[field] || "").trim());
}

function inspectionReportText_(value) {
  return value === null || value === undefined ? "" : String(value);
}

function buildInspectionReportYearLabel_(year) {
  const text = inspectionReportText_(year).trim();
  if (!text) return "年度_点検";
  return text.indexOf("年度") !== -1 ? `${text}_点検` : `${text}年度_点検`;
}

function buildInspectionReportTitle_(year) {
  const yearText = inspectionReportText_(year)
    .replace(/年度/g, "")
    .trim();
  const digits = yearText || "〇〇〇〇";
  return "〈　" + Array.from(digits).join("　") + "　年　度　施　設　点　検　報　告　書　〉";
}

function applyInspectionReportCurrentYearHeader_(sheet, year) {
  const range = sheet.getRange("L7:Q7");
  range.breakApart();
  range.merge();
  range
    .setNumberFormat("@")
    .setValue(buildInspectionReportYearLabel_(year))
    .setBackground("#ffffff")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setBorder(
      true,
      true,
      true,
      true,
      false,
      false,
      "#000000",
      SpreadsheetApp.BorderStyle.SOLID
    );
  range.setBorder(null, null, null, null, false, false);
}

function createInspectionReportPdfSheets_(ss, source, startRow, dataRowCount) {
  deleteInspectionReportPdfSheets_(ss);
  if (dataRowCount <= 0) return;

  const pages = buildInspectionReportPdfPages_(source, startRow, dataRowCount);
  const mergedSingleLastRow = mergeInspectionReportSingleLastPage_(pages);
  setInspectionReportTightBottomMarginFlag_(ss.getId(), mergedSingleLastRow);

  pages.forEach((page, pageIndex) => {
    const pageSheet = source.copyTo(ss).setName(`施設点検報告書_${pageIndex + 1}`);
    pageSheet.setHiddenGridlines(true);
    populateInspectionReportPdfPage_(
      pageSheet,
      source,
      pageIndex,
      page.startRow,
      page.rowCount
    );
    pageSheet.hideSheet();
  });
}

function populateInspectionReportPdfPage_(pageSheet, source, pageIndex, sourceStartRow, rowCount) {
  resetInspectionReportPdfPageSheet_(pageSheet);

  if (pageIndex === 0) {
    source
      .getRange(1, 1, 8, 17)
      .copyTo(pageSheet.getRange(1, 1, 8, 17), { contentsOnly: false });
    for (let row = 1; row <= 8; row += 1) {
      pageSheet.setRowHeight(row, source.getRowHeight(row));
    }
  } else {
    source
      .getRange(7, 1, 2, 17)
      .copyTo(pageSheet.getRange(1, 1, 2, 17), { contentsOnly: false });
    pageSheet.setRowHeight(1, source.getRowHeight(7));
    pageSheet.setRowHeight(2, source.getRowHeight(8));
    pageSheet.getRange(1, 1, 2, 6).setVerticalAlignment("middle");
  }

  const targetStartRow = pageIndex === 0 ? 9 : 3;
  ensureInspectionReportRows_(pageSheet, targetStartRow + rowCount - 1);
  source
    .getRange(sourceStartRow, 1, rowCount, 17)
    .copyTo(pageSheet.getRange(targetStartRow, 1, rowCount, 17), { contentsOnly: false });
  copyInspectionReportFinishTypeLineBreaks_(source, pageSheet, sourceStartRow, targetStartRow, rowCount);

  for (let offset = 0; offset < rowCount; offset += 1) {
    pageSheet.setRowHeight(
      targetStartRow + offset,
      source.getRowHeight(sourceStartRow + offset)
    );
  }

  trimInspectionReportRows_(pageSheet, targetStartRow + rowCount - 1);
}

function applyInspectionReportFinishTypeLineBreaks_(sheet, startRow, rowCount) {
  if (rowCount <= 0) return;

  const range = sheet.getRange(startRow, 6, rowCount, 1);
  const texts = range.getDisplayValues().map(row => [inspectionReportText_(row[0])]);

  range
    .setNumberFormat("@")
    .setValues(texts)
    .setWrap(true)
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP)
    .setVerticalAlignment("middle");
}

function copyInspectionReportFinishTypeLineBreaks_(source, target, sourceStartRow, targetStartRow, rowCount) {
  if (rowCount <= 0) return;

  const sourceRange = source.getRange(sourceStartRow, 6, rowCount, 1);
  const targetRange = target.getRange(targetStartRow, 6, rowCount, 1);
  const texts = sourceRange.getDisplayValues().map(row => [inspectionReportText_(row[0])]);

  targetRange
    .setNumberFormat("@")
    .setValues(texts)
    .setWrap(true)
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP)
    .setVerticalAlignment("middle");
}

function buildInspectionReportPdfPages_(sheet, startRow, dataRowCount) {
  const pages = [];
  const pageWidthInches = 11.69;
  const pageHeightInches = 8.27;
  const horizontalMargins = (1.7 / 2.54) * 2;
  const verticalMargins = (2.5 / 2.54) + (2.0 / 2.54);
  const safetyRatio = 1.0;
  const maxFirstPageRows = 15;
  const maxRepeatPageRows = 23;
  let contentWidth = 0;

  for (let column = 1; column <= 17; column += 1) {
    contentWidth += sheet.getColumnWidth(column);
  }

  const printableAspect =
    (pageHeightInches - verticalMargins) /
    (pageWidthInches - horizontalMargins);
  const maxPageHeight = contentWidth * printableAspect * safetyRatio;
  const firstPageBodyHeight =
    maxPageHeight - getInspectionReportRowsHeight_(sheet, 1, 8);
  const repeatPageBodyHeight =
    maxPageHeight - getInspectionReportRowsHeight_(sheet, 7, 2);
  let pageStartRow = startRow;
  let usedHeight = 0;
  let rowsOnPage = 0;
  let isFirstPage = true;

  for (let index = 0; index < dataRowCount; index += 1) {
    const currentRow = startRow + index;
    const rowHeight = sheet.getRowHeight(currentRow);
    const availableHeight = isFirstPage
      ? firstPageBodyHeight
      : repeatPageBodyHeight;
    const maxRows = isFirstPage ? maxFirstPageRows : maxRepeatPageRows;

    if (rowsOnPage > 0 && (usedHeight + rowHeight > availableHeight || rowsOnPage >= maxRows)) {
      pages.push({ startRow: pageStartRow, rowCount: rowsOnPage });
      pageStartRow = currentRow;
      usedHeight = 0;
      rowsOnPage = 0;
      isFirstPage = false;
    }

    usedHeight += rowHeight;
    rowsOnPage += 1;
  }

  if (rowsOnPage > 0) {
    pages.push({ startRow: pageStartRow, rowCount: rowsOnPage });
  }

  return pages;
}

function mergeInspectionReportSingleLastPage_(pages) {
  if (!Array.isArray(pages) || pages.length < 2) return false;

  const lastPage = pages[pages.length - 1];
  if (!lastPage || lastPage.rowCount !== 1) return false;

  const previousPage = pages[pages.length - 2];
  previousPage.rowCount += 1;
  pages.pop();
  return true;
}

function setInspectionReportTightBottomMarginFlag_(spreadsheetId, enabled) {
  PropertiesService
    .getScriptProperties()
    .setProperty(
      "inspectionReportTightBottomMargin:" + spreadsheetId,
      enabled ? "1" : "0"
    );
}

function applyInspectionReportEstimatedRowHeights_(sheet, startRow, rowCount) {
  if (rowCount <= 0) return;

  const cellGroups = [
    { column: 1, columnCount: 2 },
    { column: 3, columnCount: 2 },
    { column: 5, columnCount: 1 },
    { column: 6, columnCount: 1 },
    { column: 7, columnCount: 3 },
    { column: 10, columnCount: 1 },
    { column: 11, columnCount: 1 },
    { column: 12, columnCount: 3 },
    { column: 15, columnCount: 1 },
    { column: 16, columnCount: 1 },
    { column: 17, columnCount: 1 },
  ];
  const values = sheet.getRange(startRow, 1, rowCount, 17).getDisplayValues();
  const fontSizes = sheet.getRange(startRow, 1, rowCount, 17).getFontSizes();
  const groupWidths = cellGroups.map(group => {
    let width = 0;

    for (let offset = 0; offset < group.columnCount; offset += 1) {
      width += sheet.getColumnWidth(group.column + offset);
    }

    return width;
  });

  for (let offset = 0; offset < rowCount; offset += 1) {
    const row = startRow + offset;
    let estimatedLines = 1;
    let rowFontSize = 10;

    cellGroups.forEach((group, groupIndex) => {
      const columnIndex = group.column - 1;
      const text = values[offset][columnIndex];
      const fontSize = Number(fontSizes[offset][columnIndex]) || 10;
      estimatedLines = Math.max(
        estimatedLines,
        estimateInspectionReportWrappedLines_(text, groupWidths[groupIndex], fontSize)
      );
      rowFontSize = Math.max(rowFontSize, fontSize);
    });

    const lineHeight = Math.max(13, rowFontSize * 1.35);
    const estimatedHeight = Math.ceil(estimatedLines * lineHeight + 6);
    sheet.setRowHeight(row, Math.max(33, estimatedHeight));
  }
}

function estimateInspectionReportWrappedLines_(value, cellWidth, fontSize) {
  const text = inspectionReportText_(value);
  if (!text) return 1;

  const usableWidth = Math.max(8, cellWidth - 8);
  let totalLines = 0;

  text.split(/\r?\n/).forEach(line => {
    let lineWidth = 0;

    Array.from(line || " ").forEach(character => {
      lineWidth += /[\x00-\x7f]/.test(character)
        ? fontSize * 0.58
        : fontSize;
    });

    totalLines += Math.max(1, Math.ceil(lineWidth / usableWidth));
  });

  return totalLines;
}

function deleteInspectionReportPdfSheets_(ss) {
  ss.getSheets().forEach(sheet => {
    if (/^施設点検報告書_\d+$/.test(sheet.getName())) {
      ss.deleteSheet(sheet);
    }
  });
}

function resetInspectionReportPdfPageSheet_(sheet) {
  const maxRows = sheet.getMaxRows();
  const maxColumns = sheet.getMaxColumns();

  sheet
    .getRange(1, 1, maxRows, maxColumns)
    .breakApart()
    .clear();
}

function applyInspectionReportRepeatedPageHeaders_(sheet, startRow, dataRowCount) {
  if (dataRowCount <= 0) return;

  const printableHeightPx = 430;
  const maxBodyRowsPerPage = 8;
  const firstHeaderHeight = getInspectionReportRowsHeight_(sheet, 1, 8);
  const repeatHeaderHeight = getInspectionReportRowsHeight_(sheet, 7, 2);
  let remainingHeight = Math.max(120, printableHeightPx - firstHeaderHeight);
  let currentRow = startRow;
  let rowsOnPage = 0;

  for (let index = 0; index < dataRowCount; index += 1) {
    const rowHeight = sheet.getRowHeight(currentRow);

    if (rowsOnPage > 0 && (rowHeight > remainingHeight || rowsOnPage >= maxBodyRowsPerPage)) {
      sheet.insertRowsBefore(currentRow, 2);
      sheet
        .getRange(7, 1, 2, 17)
        .copyTo(sheet.getRange(currentRow, 1, 2, 17), { contentsOnly: false });
      sheet
        .getRange(currentRow, 1, 2, 6)
        .setVerticalAlignment("middle");
      currentRow += 2;
      remainingHeight = Math.max(120, printableHeightPx - repeatHeaderHeight);
      rowsOnPage = 0;
    }

    remainingHeight -= rowHeight;
    rowsOnPage += 1;
    currentRow += 1;
  }

  trimInspectionReportRows_(sheet, currentRow - 1);
}

function getInspectionReportRowsHeight_(sheet, startRow, rowCount) {
  let height = 0;

  for (let offset = 0; offset < rowCount; offset += 1) {
    height += sheet.getRowHeight(startRow + offset);
  }

  return height;
}

function trimInspectionReportRows_(sheet, lastRow) {
  const maxRows = sheet.getMaxRows();
  const keepRows = Math.max(lastRow, 31);

  if (maxRows > keepRows) {
    sheet.deleteRows(keepRows + 1, maxRows - keepRows);
  }
}

function ensureInspectionReportRows_(sheet, requiredLastRow) {
  const maxRows = sheet.getMaxRows();

  if (maxRows < requiredLastRow) {
    sheet.insertRowsAfter(maxRows, requiredLastRow - maxRows);
  }
}

function applyInspectionReportLayoutSettings_(sheet) {
  sheet.setColumnWidth(3, 80);
  sheet.setColumnWidth(4, 80);
  [10, 11, 15, 16, 17].forEach(column => {
    sheet.setColumnWidth(column, 60);
  });
  sheet.getRange("K8").setFontSize(8);
}

function applyInspectionReportEvalFontColors_(sheet, startRow, rows) {
  const targets = [
    { column: 11, field: "previousYearEval", redValues: ["AA", "A1", "A2", "B"] },
    { column: 15, field: "structEval", redValues: [] },
    { column: 17, field: "totalEval", redValues: ["AA", "A1", "A2", "B"] },
  ];

  targets.forEach(target => {
    const colors = rows.map(row => {
      const value = inspectionReportText_(row[target.field]).trim();
      return [target.redValues.some(redValue => isInspectionReportSameEval_(value, redValue)) ? "#dc2626" : "#000000"];
    });

    sheet
      .getRange(startRow, target.column, rows.length, 1)
      .setFontColors(colors)
      .setFontWeights(colors.map(row => [row[0] === "#dc2626" ? "bold" : "normal"]));
  });
}

function normalizeInspectionReportEval_(value) {
  const text = String(value || "")
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, character =>
      String.fromCharCode(character.charCodeAt(0) - 0xFEE0)
    )
    .replace(/\s+/g, "")
    .toUpperCase();

  return text;
}

function isInspectionReportSameEval_(value, expected) {
  return normalizeInspectionReportEval_(value) === normalizeInspectionReportEval_(expected);
}

function applyInspectionReportDefaultFontColors_(sheet, startRow, rowCount) {
  if (rowCount <= 0) return;

  sheet
    .getRange(startRow, 1, rowCount, 17)
    .setFontColor("#000000")
    .setFontWeight("normal");
}

function applyInspectionReportTableBorders_(sheet, startRow, rowCount, dataRowCount, clearRowCount) {
  if (clearRowCount > 0) {
    sheet
      .getRange(startRow, 1, clearRowCount, 17)
      .setBorder(false, false, false, false, false, false);
  }

  if (rowCount <= 0) return;

  const mergedColumnGroups = [
    { startColumn: 1, columnCount: 2 },
    { startColumn: 3, columnCount: 2 },
    { startColumn: 7, columnCount: 3 },
    { startColumn: 12, columnCount: 3 },
  ];

  for (let row = startRow; row < startRow + rowCount; row++) {
    mergedColumnGroups.forEach(group => {
      const range = sheet.getRange(row, group.startColumn, 1, group.columnCount);
      range.breakApart();
      range.merge();
    });
  }

  for (let row = startRow; row < startRow + rowCount; row++) {
    sheet
      .getRange(row, 1, 1, 17)
      .setBorder(
        true,
        false,
        true,
        false,
        false,
        false,
        "#000000",
        SpreadsheetApp.BorderStyle.SOLID
      );
  }

  if (dataRowCount <= 0) return;

  [
    { startColumn: 1, columnCount: 2 },
    { startColumn: 3, columnCount: 2 },
    { startColumn: 5, columnCount: 1 },
    { startColumn: 6, columnCount: 1 },
    { startColumn: 7, columnCount: 3 },
    { startColumn: 10, columnCount: 1 },
    { startColumn: 11, columnCount: 1 },
    { startColumn: 12, columnCount: 3 },
    { startColumn: 15, columnCount: 1 },
    { startColumn: 16, columnCount: 1 },
    { startColumn: 17, columnCount: 1 },
  ].forEach(group => {
    sheet
      .getRange(startRow, group.startColumn, dataRowCount, group.columnCount)
      .setBorder(
        null,
        true,
        null,
        true,
        null,
        null,
        "#000000",
        SpreadsheetApp.BorderStyle.SOLID
      );
  });
}

function applyInspectionReportTableAlignments_(sheet, startRow, rowCount) {
  if (rowCount <= 0) return;

  [
    { startColumn: 1, columnCount: 6 },
    { startColumn: 10, columnCount: 2 },
    { startColumn: 15, columnCount: 3 },
  ].forEach(group => {
    sheet
      .getRange(startRow, group.startColumn, rowCount, group.columnCount)
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle");
  });
}

function applyInspectionReportTableWraps_(sheet, startRow, rowCount) {
  if (rowCount <= 0) return;

  sheet
    .getRange(startRow, 1, rowCount, 17)
    .setWrap(true);
}

function applyInspectionReportHeaderWraps_(sheet) {
  ["M2", "M4", "M5"].forEach(a1Notation => {
    sheet
      .getRange(a1Notation)
      .setWrap(true)
      .setVerticalAlignment("middle");
  });

  sheet.autoResizeRows(2, 1);
  sheet.autoResizeRows(4, 2);
  sheet.setRowHeights(3, 1, 7);
  sheet.setRowHeights(6, 1, 7);
}
