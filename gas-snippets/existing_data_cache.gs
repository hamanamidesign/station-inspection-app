// 既存の getExistingData(routeFolderId) をこの内容に差し替えてください。
// 「現場管理台帳」の読み込み結果を路線ごとに5分間キャッシュします。

function getExistingData(routeFolderId) {
  const routeKey = String(routeFolderId || "").trim();
  const cache = CacheService.getScriptCache();
  const cacheKey = "existing_data_v1_" + (routeKey || "all");
  const cached = cache.get(cacheKey);

  if (cached) {
    return createJsonResponse({
      success: true,
      list: JSON.parse(cached),
      cached: true,
    });
  }

  const sheet = SpreadsheetApp
    .openById(CONFIG.TEMPLATE_SS_ID)
    .getSheetByName("現場管理台帳");

  if (!sheet) {
    return createJsonResponse({ success: true, list: [] });
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return createJsonResponse({ success: true, list: [] });
  }

  const values = sheet
    .getRange(2, 1, lastRow - 1, 10)
    .getValues();

  const list = values
    .filter(row => !routeKey || String(row[9]) === routeKey)
    .map(row => ({
      stationNo: row[0],
      stationName: row[1],
      year: String(row[2]),
      spreadsheetId: row[3],
      folderId: row[4],
      photoFolderId: row[5],
      routeName: row[8],
      routeFolderId: row[9],
    }));

  cache.put(cacheKey, JSON.stringify(list), 300);

  return createJsonResponse({
    success: true,
    list: list,
    cached: false,
  });
}
