// 「プルダウンリスト_マスタ」からアプリ用のプルダウンを取得します。
// 既存の getPulldownLists() をこの版に置き換え、
// readInspectorRegistrations() を同じ コード.gs に追加してください。

function getPulldownLists() {
  const ss = SpreadsheetApp.openById(CONFIG.PULLDOWN_SS_ID);
  const placeSheet = ss.getSheetByName("点検場所リスト");

  return createJsonResponse({
    success: true,
    buildingCategories: readPulldownColumn(ss, "建物分類リスト"),
    inspectionPlaces: readPulldownColumn(ss, "点検場所リスト"),
    finishOptionsByPlace: readFinishOptionsByPlace(placeSheet),
    checkItemsByPlace: readCheckItemsByPlace(ss),
    inspectorRegistrations: readInspectorRegistrations(ss),
  });
}

function readInspectorRegistrations(ss) {
  const sheet = ss.getSheetByName("点検者登録");
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 4) return [];

  return sheet
    .getRange(2, 1, lastRow - 1, lastCol)
    .getDisplayValues()
    .map(row => ({
      routeName: String(row[0] || "").trim(),
      year: String(row[1] || "").trim(),
      contractor: String(row[2] || "").trim(),
      inspectors: row
        .slice(3)
        .map(value => String(value || "").trim())
        .filter(Boolean),
    }))
    .filter(item => item.routeName && item.year);
}
