// 点検リスト_マスタから、駅No.・初回点検日・最新点検日を取得します。
// 既存の doPost(e) 内で action === "getInspectionListDates" のときに呼び出してください。

function getInspectionListDates(payload) {
  const masterSpreadsheetId =
    payload.masterSpreadsheetId || "14FBV3XuMWhv4DcjfjmIWSY5zY5NbxD5gp2E1rqTQPHs";
  const routeName = normalizeText_(payload.routeName);
  const stationName = normalizeStationName_(payload.station);
  const year = String(payload.year || "").trim();

  if (!routeName || !stationName || !year) {
    return {
      success: true,
      firstDate: "",
      latestDate: "",
      message: "routeName, station, year のいずれかが空です",
    };
  }

  const ss = SpreadsheetApp.openById(masterSpreadsheetId);
  const sheet = findSheetByName_(ss, routeName);
  if (!sheet) {
    return {
      success: true,
      firstDate: "",
      latestDate: "",
      message: "路線名と一致するシートが見つかりません",
    };
  }

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 3) {
    return { success: true, firstDate: "", latestDate: "" };
  }

  const stationValues = sheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
  const stationIndex = stationValues.findIndex(
    row => normalizeStationName_(row[0]) === stationName
  );
  if (stationIndex === -1) {
    return {
      success: true,
      firstDate: "",
      latestDate: "",
      message: "駅名が見つかりません",
    };
  }

  const targetRow = stationIndex + 2;
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const latestColumn = findInspectionDateColumn_(headers, year);

  return {
    success: true,
    stationNo: sheet.getRange(targetRow, 1).getDisplayValue(),
    firstDate: sheet.getRange(targetRow, 3).getDisplayValue(),
    latestDate: latestColumn ? sheet.getRange(targetRow, latestColumn).getDisplayValue() : "",
    sheetName: sheet.getName(),
    row: targetRow,
    latestHeader: latestColumn ? headers[latestColumn - 1] : "",
  };
}

function findSheetByName_(spreadsheet, routeName) {
  return spreadsheet
    .getSheets()
    .find(sheet => normalizeText_(sheet.getName()) === routeName);
}

function findInspectionDateColumn_(headers, year) {
  const targetYear = String(year).trim();
  const index = headers.findIndex(header => {
    const text = normalizeText_(header);
    const match = text.match(/^(\d{4})年_点検日$/);
    return match && match[1] === targetYear;
  });

  return index === -1 ? null : index + 1;
}

function normalizeText_(value) {
  return String(value || "").replace(/\s+/g, "").trim();
}

function normalizeStationName_(value) {
  return normalizeText_(value).replace(/駅$/, "");
}
