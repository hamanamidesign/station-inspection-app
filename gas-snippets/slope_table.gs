// doPost などの action 分岐には以下を追加してください。
// case "uploadSlopeTable":
//   return createJsonResponse(uploadSlopeTable(body));
// case "getSlopeTableData":
//   return createJsonResponse(getSlopeTableData(body.spreadsheetId || body));

const SLOPE_TABLE_MASTER_SPREADSHEET_ID_ =
  typeof INSPECTION_LIST_MASTER_ID !== "undefined"
    ? INSPECTION_LIST_MASTER_ID
    : "14FBV3XuMWhv4DcjfjmIWSY5zY5NbxD5gp2E1rqTQPHs";

const SLOPE_TABLE_NOTE_TEXT_ =
  "*測定値については±1mmの範囲で測定誤差の生じる場合があります。";
const SLOPE_TABLE_COLUMN_COUNT_ = 15;
const SLOPE_TABLE_DATA_START_ROW_ = 5;
const SLOPE_TABLE_ROWS_PER_PAGE_ = 10;
const SLOPE_TABLE_NOTE_ROW_ = 16;
const SLOPE_TABLE_LAST_ROW_ = 16;

function uploadSlopeTable(data) {
  const ss = SpreadsheetApp.openById(data.spreadsheetId);
  const rows = normalizeSlopeTableUploadRows_(Array.isArray(data.rows) ? data.rows : []);
  const pageCount = Math.max(1, Math.ceil(rows.length / SLOPE_TABLE_ROWS_PER_PAGE_));
  const template = getSlopeTableTemplateSheet_(ss);
  const sheets = [];

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const sheet = getOrCreateSlopeTableSheet_(ss, pageIndex, template);
    const pageRows = rows.slice(
      pageIndex * SLOPE_TABLE_ROWS_PER_PAGE_,
      (pageIndex + 1) * SLOPE_TABLE_ROWS_PER_PAGE_
    );

    prepareSlopeTablePage_(sheet, template, data);
    writeSlopeTableRows_(sheet, pageRows);
    sheets.push(sheet.getName());
  }

  removeExtraSlopeTableSheets_(ss, pageCount);

  return { success: true, sheets: sheets };
}

function normalizeSlopeTableUploadRows_(rows) {
  return rows.filter((row, index) => {
    if (index === 0 || index % SLOPE_TABLE_ROWS_PER_PAGE_ !== 0) return true;
    return !slopeTableRowsAreSame_(rows[index - 1], row);
  });
}

function slopeTableRowsAreSame_(a, b) {
  const fields = [
    "slopeType",
    "point",
    "placeSide",
    "place",
    "firstEwDirection",
    "firstEwValue",
    "firstEw",
    "firstNsDirection",
    "firstNsValue",
    "firstNs",
    "currentEwDirection",
    "currentEwValue",
    "currentEw",
    "currentNsDirection",
    "currentNsValue",
    "currentNs",
  ];

  return fields.every(field =>
    slopeTableComparableValue_(a && a[field], field) === slopeTableComparableValue_(b && b[field], field)
  );
}

function slopeTableComparableValue_(value, field) {
  const text = slopeText_(value).trim();
  if (text === "") return "";

  if (/Value$/.test(field) || ["firstEw", "firstNs", "currentEw", "currentNs"].indexOf(field) !== -1) {
    const number = Number(text);
    return Number.isFinite(number) ? number.toFixed(1) : text;
  }

  return text.replace(/\s+/g, "");
}

function writeSlopeTableRows_(sheet, rows) {
  const pageRows = rows.slice(0, SLOPE_TABLE_ROWS_PER_PAGE_);
  if (pageRows.length === 0) return;

  const values = pageRows.map(row => [
    slopeText_(row.slopeType),
    slopeText_(row.point),
    slopeText_(row.placeSide),
    slopeText_(row.place),
    slopeText_(row.firstEwDirection),
    slopeNumberCellValue_(slopeFallback_(row.firstEwValue, row.firstEw)),
    slopeText_(row.firstNsDirection),
    slopeNumberCellValue_(slopeFallback_(row.firstNsValue, row.firstNs)),
    slopeText_(row.currentEwDirection),
    slopeNumberCellValue_(slopeFallback_(row.currentEwValue, row.currentEw)),
    slopeText_(row.currentNsDirection),
    slopeNumberCellValue_(slopeFallback_(row.currentNsValue, row.currentNs)),
    slopeText_(row.note),
  ]);

  const range = sheet.getRange(SLOPE_TABLE_DATA_START_ROW_, 1, values.length, values[0].length);
  range.setValues(values);
  sheet.getRange(SLOPE_TABLE_DATA_START_ROW_, 2, values.length, 1).setFontSize(15);
  [6, 8, 10, 12].forEach(col => {
    sheet.getRange(SLOPE_TABLE_DATA_START_ROW_, col, values.length, 1).setNumberFormat("0.0");
  });

  pageRows.forEach((row, index) => {
    const r = SLOPE_TABLE_DATA_START_ROW_ + index;

    const valueCols = [
      { valueCol: 6, directionCol: 5, value: slopeNumberText_(slopeFallback_(row.firstEwValue, row.firstEw)) },
      { valueCol: 8, directionCol: 7, value: slopeNumberText_(slopeFallback_(row.firstNsValue, row.firstNs)) },
      { valueCol: 10, directionCol: 9, value: slopeNumberText_(slopeFallback_(row.currentEwValue, row.currentEw)) },
      { valueCol: 12, directionCol: 11, value: slopeNumberText_(slopeFallback_(row.currentNsValue, row.currentNs)) },
    ];

    let pointShouldBeRed = false;
    sheet.getRange(r, 2).setFontColor("black").setFontWeight("normal").setFontSize(15);

    valueCols.forEach(item => {
      const num = Number(item.value);

      sheet.getRange(r, item.valueCol).setFontColor("black").setFontWeight("normal");
      sheet.getRange(r, item.directionCol).setFontColor("black").setFontWeight("normal");

      if (!isNaN(num) && num >= 10.1) {
        pointShouldBeRed = true;
        sheet.getRange(r, item.valueCol).setFontColor("red").setFontWeight("normal");
        sheet.getRange(r, item.directionCol).setFontColor("red").setFontWeight("normal");
      }
    });

    if (pointShouldBeRed) {
      sheet.getRange(r, 2).setFontColor("red").setFontWeight("normal").setFontSize(15);
    }

    const ewChanged = slopeValuesAreDifferent_(
      slopeFallback_(row.firstEwValue, row.firstEw),
      slopeFallback_(row.currentEwValue, row.currentEw)
    );

    const nsChanged = slopeValuesAreDifferent_(
      slopeFallback_(row.firstNsValue, row.firstNs),
      slopeFallback_(row.currentNsValue, row.currentNs)
    );

    if (ewChanged) {
      sheet.getRange(r, 10).setBackground("#d1d5db");
    }

    if (nsChanged) {
      sheet.getRange(r, 12).setBackground("#d1d5db");
    }
  });
}

function getSlopeTableData(spreadsheetId) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheets = getSlopeTableSheets_(ss);
  const sheet = sheets[0];

  if (!sheet) {
    return {
      success: true,
      stationNo: "",
      firstDate: "",
      inspectDate: "",
      rows: createEmptySlopeTableRows_(),
      inspectList: [],
    };
  }

  const rows = [];
  const inspectList = [];

  sheets.forEach(pageSheet => {
    const rowCount = getSlopeTableReadRowCount_(pageSheet, sheets.length);
    const range = pageSheet.getRange(SLOPE_TABLE_DATA_START_ROW_, 1, rowCount, 13);
    const values = range.getDisplayValues();
    const fontColors = range.getFontColors();
    const backgrounds = range.getBackgrounds();

    values.forEach((row, index) => {
      if (row.some(value => String(value || "").trim() === SLOPE_TABLE_NOTE_TEXT_)) return;

      rows.push({
        id: String(rows.length + 1),
        slopeType: slopeText_(row[0]),
        point: slopeText_(row[1]),
        placeSide: slopeText_(row[2]),
        place: slopeText_(row[3]),
        firstEwDirection: slopeText_(row[4]),
        firstEwValue: slopeNumberText_(row[5]),
        firstNsDirection: slopeText_(row[6]),
        firstNsValue: slopeNumberText_(row[7]),
        currentEwDirection: slopeText_(row[8]),
        currentEwValue: slopeNumberText_(row[9]),
        currentNsDirection: slopeText_(row[10]),
        currentNsValue: slopeNumberText_(row[11]),
        note: slopeText_(row[12]),
        pointColor: fontColors[index][1],
        cellStyles: buildSlopeCellStyles_(fontColors[index], backgrounds[index]),
      });

      if (row[1]) inspectList.push(row[1]);
    });
  });

  return {
    success: true,
    stationNo: sheet.getRange("N1").getValue() || "",
    firstDate: sheet.getRange("G2").getValue() || "",
    inspectDate: sheet.getRange("K2").getValue() || "",
    rows,
    inspectList,
  };
}

function getSlopeTableReadRowCount_(sheet, slopeSheetCount) {
  if (slopeSheetCount > 1) return SLOPE_TABLE_ROWS_PER_PAGE_;

  const noteRow = findSlopeTableNoteRow_(sheet);
  if (noteRow && noteRow <= SLOPE_TABLE_NOTE_ROW_) return SLOPE_TABLE_ROWS_PER_PAGE_;

  return 20;
}

function prepareSlopeTablePage_(sheet, template, data) {
  if (sheet.getMaxRows() < SLOPE_TABLE_LAST_ROW_) {
    sheet.insertRowsAfter(sheet.getMaxRows(), SLOPE_TABLE_LAST_ROW_ - sheet.getMaxRows());
  }

  if (template) {
    template
      .getRange(1, 1, 4, SLOPE_TABLE_COLUMN_COUNT_)
      .copyTo(sheet.getRange(1, 1, 4, SLOPE_TABLE_COLUMN_COUNT_), { contentsOnly: false });
    template
      .getRange(SLOPE_TABLE_DATA_START_ROW_, 1, SLOPE_TABLE_ROWS_PER_PAGE_, SLOPE_TABLE_COLUMN_COUNT_)
      .copyTo(sheet.getRange(SLOPE_TABLE_DATA_START_ROW_, 1, SLOPE_TABLE_ROWS_PER_PAGE_, SLOPE_TABLE_COLUMN_COUNT_), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  }

  sheet.getRange("N1").setValue(data.stationNo || "");
  setSlopeDateHeaderValue_(sheet.getRange("G2"), data.firstDate);
  setSlopeDateHeaderValue_(sheet.getRange("K2"), data.inspectDate);
  sheet
    .getRange(SLOPE_TABLE_DATA_START_ROW_, 1, SLOPE_TABLE_ROWS_PER_PAGE_, SLOPE_TABLE_COLUMN_COUNT_)
    .clearContent()
    .setFontColor("black")
    .setFontWeight("normal");
  sheet
    .getRange(SLOPE_TABLE_DATA_START_ROW_ + SLOPE_TABLE_ROWS_PER_PAGE_, 1, SLOPE_TABLE_NOTE_ROW_ - SLOPE_TABLE_DATA_START_ROW_ - SLOPE_TABLE_ROWS_PER_PAGE_, SLOPE_TABLE_COLUMN_COUNT_)
    .breakApart()
    .clearContent()
    .setFontColor("black")
    .setFontWeight("normal")
    .setBackground("#ffffff");
  for (let row = SLOPE_TABLE_DATA_START_ROW_; row < SLOPE_TABLE_DATA_START_ROW_ + SLOPE_TABLE_ROWS_PER_PAGE_; row += 1) {
    sheet.setRowHeight(row, 45);
  }
  [10, 12].forEach(col => {
    sheet.getRange(SLOPE_TABLE_DATA_START_ROW_, col, SLOPE_TABLE_ROWS_PER_PAGE_, 1).setBackground("#ffffff");
  });

  restoreSlopeTableNote_(sheet, SLOPE_TABLE_NOTE_ROW_);
  trimSlopeTableRows_(sheet);
  cleanupSlopeTableFooterRows_(sheet);
}

function findSlopeTableNoteRow_(sheet) {
  const lastRow = Math.max(sheet.getLastRow(), 1);
  const values = sheet
    .getRange(1, 1, lastRow, Math.min(sheet.getLastColumn(), SLOPE_TABLE_COLUMN_COUNT_))
    .getDisplayValues();

  for (let rowIndex = 0; rowIndex < values.length; rowIndex++) {
    if (values[rowIndex].some(value => String(value || "").trim() === SLOPE_TABLE_NOTE_TEXT_)) {
      return rowIndex + 1;
    }
  }

  return null;
}

function restoreSlopeTableNote_(sheet, row) {
  const existingRow = findSlopeTableNoteRow_(sheet);
  const targetRow = row;

  if (existingRow && existingRow !== targetRow) {
    sheet.getRange(existingRow, 1, 1, SLOPE_TABLE_COLUMN_COUNT_).breakApart().clearContent();
  }

  const range = sheet.getRange(targetRow, 1, 1, SLOPE_TABLE_COLUMN_COUNT_);
  range.breakApart();
  range.clearContent();
  range.merge();
  range
    .setValue(SLOPE_TABLE_NOTE_TEXT_)
    .setFontSize(12)
    .setFontColor("#000000")
    .setFontWeight("normal")
    .setHorizontalAlignment("left")
    .setVerticalAlignment("middle");
}

function trimSlopeTableRows_(sheet) {
  const maxRows = sheet.getMaxRows();
  if (maxRows > SLOPE_TABLE_LAST_ROW_) {
    sheet.deleteRows(SLOPE_TABLE_LAST_ROW_ + 1, maxRows - SLOPE_TABLE_LAST_ROW_);
  }
}

function cleanupSlopeTableFooterRows_(sheet) {
  const startRow = 15;
  const rowCount = Math.max(1, sheet.getMaxRows() - startRow + 1);
  const range = sheet.getRange(startRow, 1, rowCount, SLOPE_TABLE_COLUMN_COUNT_);

  range.setBorder(false, false, false, false, false, false);
  range.setBorder(true, null, null, null, null, null, "#000000", SpreadsheetApp.BorderStyle.SOLID);
  sheet.autoResizeRows(startRow, rowCount);
}

function slopeText_(value) {
  return value === null || value === undefined ? "" : String(value);
}

function setSlopeDateHeaderValue_(range, value) {
  const text = slopeText_(value);
  range.setNumberFormat("@").setValue(text);

  const fontSize = getSlopeDateHeaderFontSize_(text);
  if (fontSize) {
    range.setFontSize(fontSize);
  }
}

function getSlopeDateHeaderFontSize_(value) {
  const length = slopeText_(value).length;
  if (length === 10) return 10;
  if (length >= 11 && length <= 13) return 9;
  if (length >= 14 && length <= 16) return 8;
  return null;
}

function slopeFallback_(primary, fallback) {
  const primaryText = slopeText_(primary);
  return primaryText === "" ? slopeText_(fallback) : primaryText;
}

function slopeNumberText_(value) {
  const text = slopeText_(value).trim();
  if (text === "") return "";

  const number = Number(text);
  return Number.isFinite(number) ? number.toFixed(1) : text;
}

function slopeValuesAreDifferent_(firstValue, currentValue) {
  const firstText = slopeText_(firstValue).trim();
  const currentText = slopeText_(currentValue).trim();
  if (firstText === "" || currentText === "") return false;

  const firstNumber = Number(firstText);
  const currentNumber = Number(currentText);
  if (Number.isFinite(firstNumber) && Number.isFinite(currentNumber)) {
    return firstNumber !== currentNumber;
  }

  return firstText !== currentText;
}

function slopeNumberCellValue_(value) {
  const text = slopeText_(value).trim();
  if (text === "") return "";

  const number = Number(text);
  return Number.isFinite(number) ? number : text;
}

function buildSlopeCellStyles_(fontColors, backgrounds) {
  const fields = [
    "slopeType",
    "point",
    "placeSide",
    "place",
    "firstEwDirection",
    "firstEwValue",
    "firstNsDirection",
    "firstNsValue",
    "currentEwDirection",
    "currentEwValue",
    "currentNsDirection",
    "currentNsValue",
    "note",
  ];

  return fields.reduce((styles, field, index) => {
    styles[field] = {
      color: fontColors[index],
      backgroundColor: backgrounds[index],
    };
    return styles;
  }, {});
}

function getOrCreateSlopeTableSheet_(ss, pageIndex, template) {
  const sheetName = getSlopeTableSheetName_(pageIndex);
  const existing = ss.getSheetByName(sheetName);
  if (existing && pageIndex === 0) return existing;
  if (existing) ss.deleteSheet(existing);

  if (!template) {
    throw new Error("傾斜表_マスタ シートが見つかりません");
  }

  const sheet = template.copyTo(ss).setName(sheetName);
  sheet.showSheet();
  ss.setActiveSheet(sheet);
  ss.moveActiveSheet(ss.getNumSheets());

  return sheet;
}

function getSlopeTableTemplateSheet_(ss) {
  return ss.getSheetByName("傾斜表_マスタ") ||
    SpreadsheetApp.openById(SLOPE_TABLE_MASTER_SPREADSHEET_ID_).getSheetByName("傾斜表_マスタ") ||
    ss.getSheetByName("傾斜表");
}

function getSlopeTableSheetName_(pageIndex) {
  return pageIndex === 0 ? "傾斜表" : "傾斜表_" + (pageIndex + 1);
}

function getSlopeTableSheets_(ss) {
  return ss
    .getSheets()
    .filter(sheet => /^傾斜表(?:_\d+)?$/.test(sheet.getName()))
    .sort((a, b) => getSlopeTableSheetPageNumber_(a.getName()) - getSlopeTableSheetPageNumber_(b.getName()));
}

function getSlopeTableSheetPageNumber_(sheetName) {
  if (sheetName === "傾斜表") return 1;
  const match = String(sheetName || "").match(/^傾斜表_(\d+)$/);
  return match ? Number(match[1]) : 9999;
}

function removeExtraSlopeTableSheets_(ss, pageCount) {
  getSlopeTableSheets_(ss).forEach(sheet => {
    if (getSlopeTableSheetPageNumber_(sheet.getName()) > pageCount) {
      ss.deleteSheet(sheet);
    }
  });
}

function createEmptySlopeTableRows_() {
  return Array.from({ length: SLOPE_TABLE_ROWS_PER_PAGE_ }, (_, index) => ({
    id: String(index + 1),
    slopeType: "",
    point: "",
    placeSide: "",
    place: "",
    firstEwDirection: "",
    firstEwValue: "",
    firstNsDirection: "",
    firstNsValue: "",
    currentEwDirection: "",
    currentEwValue: "",
    currentNsDirection: "",
    currentNsValue: "",
    note: "",
  }));
}

function getRangeLabel(values) {
  if (!values || values.length === 0) return "";

  const start = values[0];
  const end = values[3] || values[values.length - 1];

  return `${start}-${end}`;
}
