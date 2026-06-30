// 表紙用です。
// コード.gs の doPost(e) 内の switch (action) に、以下を追加して再デプロイしてください。
// case "uploadCover":
//   return createJsonResponse(uploadCover(body));

function uploadCover(data) {
  const ss = SpreadsheetApp.openById(data.spreadsheetId);
  const sheet = ss.getSheetByName("表紙");

  if (!sheet) {
    throw new Error("表紙 シートが見つかりません");
  }

  if (sheet.isSheetHidden()) {
    sheet.showSheet();
  }

  sheet.getRange("B3").setNumberFormat("@").setValue(buildCoverStationNo_(data.stationNo));
  sheet.getRange("B6").setNumberFormat("@").setValue(buildCoverStationName_(data.stationName));
  sheet.getRange("K13").setNumberFormat("@").setValue(coverText_(data.inspectDate));

  SpreadsheetApp.flush();

  return {
    success: true,
  };
}

function coverText_(value) {
  return value === null || value === undefined ? "" : String(value);
}

function buildCoverStationNo_(value) {
  const text = coverText_(value).trim();
  return text ? "〈 No.　" + text + "　 〉" : "";
}

function buildCoverStationName_(value) {
  const text = coverText_(value).trim().replace(/駅$/, "");
  return text ? text + " 駅" : "";
}
