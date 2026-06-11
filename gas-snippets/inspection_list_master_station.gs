// 点検リスト_マスタへの駅追加・更新用です。
// コード.gs の doPost(e) 内の switch (action) に、以下を追加して再デプロイしてください。
// case "updateInspectionListMasterStation":
//   return createJsonResponse(updateInspectionListMasterStation(body));

function updateInspectionListMasterStation(data) {
  const masterSpreadsheetId =
    data.masterSpreadsheetId || "14FBV3XuMWhv4DcjfjmIWSY5zY5NbxD5gp2E1rqTQPHs";
  const routeName = inspectionListMasterNormalizeText_(data.routeName);
  const stationNo = inspectionListMasterText_(data.stationNo).trim();
  const stationName = inspectionListMasterText_(data.station).trim();

  if (!routeName || !stationNo || !stationName) {
    throw new Error("路線名、駅番号、駅名のいずれかが空です");
  }

  const ss = SpreadsheetApp.openById(masterSpreadsheetId);
  let sheet = ss
    .getSheets()
    .find(item => inspectionListMasterNormalizeText_(item.getName()) === routeName);

  if (!sheet) {
    sheet = ss.insertSheet(inspectionListMasterSafeSheetName_(data.routeName));
    sheet.getRange("A1").setNumberFormat("@").setValue("駅No.");
    sheet.getRange("B1").setNumberFormat("@").setValue("駅名");
  }

  const lastRow = Math.max(sheet.getLastRow(), 1);
  const targetStationName = inspectionListMasterNormalizeStationName_(stationName);
  let targetRow = 0;

  if (lastRow >= 2) {
    const stationValues = sheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
    const stationIndex = stationValues.findIndex(
      row => inspectionListMasterNormalizeStationName_(row[0]) === targetStationName
    );

    if (stationIndex !== -1) {
      targetRow = stationIndex + 2;
    }
  }

  if (!targetRow) {
    targetRow = lastRow + 1;
  }

  sheet.getRange(targetRow, 1).setNumberFormat("@").setValue(stationNo);
  sheet.getRange(targetRow, 2).setNumberFormat("@").setValue(stationName);
  SpreadsheetApp.flush();

  return {
    success: true,
    sheetName: sheet.getName(),
    row: targetRow,
  };
}

function inspectionListMasterText_(value) {
  return value === null || value === undefined ? "" : String(value);
}

function inspectionListMasterNormalizeText_(value) {
  return inspectionListMasterText_(value).replace(/\s+/g, "").trim();
}

function inspectionListMasterNormalizeStationName_(value) {
  return inspectionListMasterNormalizeText_(value).replace(/駅$/, "");
}

function inspectionListMasterSafeSheetName_(value) {
  const text = inspectionListMasterText_(value).trim().replace(/[\[\]\:\*\?\/\\]/g, "_");
  return text.slice(0, 100) || "新規路線";
}
