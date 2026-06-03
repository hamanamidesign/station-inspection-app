// doPost などの action 分岐には以下を追加してください。
// case "uploadSlopeTable":
//   return createJsonResponse(uploadSlopeTable(body));
// case "getSlopeTableData":
//   return createJsonResponse(getSlopeTableData(body.spreadsheetId || body));

const SLOPE_TABLE_MASTER_SPREADSHEET_ID_ =
  typeof INSPECTION_LIST_MASTER_ID !== "undefined"
    ? INSPECTION_LIST_MASTER_ID
    : "14FBV3XuMWhv4DcjfjmIWSY5zY5NbxD5gp2E1rqTQPHs";

function uploadSlopeTable(data) {
  const ss = SpreadsheetApp.openById(data.spreadsheetId);
  const sheet = getOrCreateSlopeTableSheet_(ss);

  // =========================
  // ヘッダー反映
  // =========================

  sheet.getRange("N1").setValue(data.stationNo || "");
  sheet.getRange("G2").setNumberFormat("@").setValue(String(data.firstDate || ""));
  sheet.getRange("K2").setNumberFormat("@").setValue(String(data.inspectDate || ""));

  const rows = Array.isArray(data.rows) ? data.rows : [];

  // =========================
  // 既存データクリア
  // =========================

  const startRow = 5;
  const clearRowCount = Math.max(rows.length, 13);

  sheet
    .getRange(startRow, 1, clearRowCount, 13)
    .clearContent()
    .setBackground(null)
    .setFontColor("black")
    .setFontWeight("normal");

  if (rows.length === 0) {
    return { success: true };
  }

  // =========================
  // データ反映
  // =========================

  const values = rows.map(row => [
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

  const range = sheet.getRange(startRow, 1, values.length, values[0].length);
  range.setValues(values);
  [6, 8, 10, 12].forEach(col => {
    sheet.getRange(startRow, col, values.length, 1).setNumberFormat("0.0");
  });

  // =========================
  // 色変更反映
  // =========================

  rows.forEach((row, index) => {
    const r = startRow + index;

    const valueCols = [
      { valueCol: 6, directionCol: 5, value: slopeNumberText_(slopeFallback_(row.firstEwValue, row.firstEw)) },
      { valueCol: 8, directionCol: 7, value: slopeNumberText_(slopeFallback_(row.firstNsValue, row.firstNs)) },
      { valueCol: 10, directionCol: 9, value: slopeNumberText_(slopeFallback_(row.currentEwValue, row.currentEw)) },
      { valueCol: 12, directionCol: 11, value: slopeNumberText_(slopeFallback_(row.currentNsValue, row.currentNs)) },
    ];

    valueCols.forEach(item => {
      const num = Number(item.value);

      sheet.getRange(r, item.valueCol).setFontColor("black").setFontWeight("normal");
      sheet.getRange(r, item.directionCol).setFontColor("black").setFontWeight("normal");
      sheet.getRange(r, 2).setFontColor("black").setFontWeight("normal");

      if (!isNaN(num) && num >= 10.1) {
        sheet.getRange(r, item.valueCol).setFontColor("red").setFontWeight("normal");
        sheet.getRange(r, item.directionCol).setFontColor("red").setFontWeight("normal");
        sheet.getRange(r, 2).setFontColor("red").setFontWeight("normal");
      }
    });

    // =====================
    // 変化あり → グレー
    // =====================

    const ewChanged =
      slopeNumberText_(slopeFallback_(row.firstEwValue, row.firstEw)) !==
      slopeNumberText_(slopeFallback_(row.currentEwValue, row.currentEw));

    const nsChanged =
      slopeNumberText_(slopeFallback_(row.firstNsValue, row.firstNs)) !==
      slopeNumberText_(slopeFallback_(row.currentNsValue, row.currentNs));

    if (ewChanged) {
      sheet.getRange(r, 10).setBackground("#d1d5db");
    }

    if (nsChanged) {
      sheet.getRange(r, 12).setBackground("#d1d5db");
    }
  });

  return { success: true };
}

function getSlopeTableData(spreadsheetId) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheetByName("傾斜表");

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

  const startRow = 5;
  const rowCount = 13;

  const range = sheet.getRange(startRow, 1, rowCount, 13);
  const values = range.getDisplayValues();
  const fontColors = range.getFontColors();
  const backgrounds = range.getBackgrounds();

  const rows = values.map((row, index) => ({
    id: String(index + 1),
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
  }));

  const lastRow = Math.max(sheet.getLastRow(), startRow);
  const inspectList = sheet
    .getRange(startRow, 2, lastRow - startRow + 1, 1)
    .getDisplayValues()
    .flat()
    .filter(v => v);

  return {
    success: true,
    stationNo: sheet.getRange("N1").getValue() || "",
    firstDate: sheet.getRange("G2").getValue() || "",
    inspectDate: sheet.getRange("K2").getValue() || "",
    rows,
    inspectList,
  };
}

function slopeText_(value) {
  return value === null || value === undefined ? "" : String(value);
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

function getOrCreateSlopeTableSheet_(ss) {
  const existing = ss.getSheetByName("傾斜表");
  if (existing) return existing;

  const template =
    ss.getSheetByName("傾斜表_マスタ") ||
    SpreadsheetApp.openById(SLOPE_TABLE_MASTER_SPREADSHEET_ID_).getSheetByName("傾斜表_マスタ");

  if (!template) {
    throw new Error("傾斜表_マスタ シートが見つかりません");
  }

  const sheet = template.copyTo(ss).setName("傾斜表");
  sheet.showSheet();
  ss.setActiveSheet(sheet);
  ss.moveActiveSheet(ss.getNumSheets());

  return sheet;
}

function createEmptySlopeTableRows_() {
  return Array.from({ length: 13 }, (_, index) => ({
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
