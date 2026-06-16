// ==========================================
// 1. 設定情報
// ==========================================
const CONFIG = {
  MAP_FOLDER_ID: "1WfvsLd7vUqreG-NUcPURyX9BIfO-WFT1",
  TEMPLATE_SS_ID: '1OSPT-OX-j0HaAed3tLwoA_7-BoQFwMMB2ZgJmwUXID8', // マスタ（台帳）
  INSPECTION_TEMPLATE_ID: '1OSPT-OX-j0HaAed3tLwoA_7-BoQFwMMB2ZgJmwUXID8', // 雛形
  HANREI_FOLDER_ID: '1iH2GFpAhr7u-6XEvrTpJgsuRJ4aZAicG', // 凡例画像フォルダ
  PULLDOWN_SS_ID: '1GiaLij8MK7CRShxiqkdX3sVGfAKrNTNJRrsDITopY_c',
  INSPECTION_LIST_MASTER_ID: '14FBV3XuMWhv4DcjfjmIWSY5zY5NbxD5gp2E1rqTQPHs'
};

// 点検リスト_マスタから、駅No.・初回点検日・最新点検日を取得します。
// 既存の doPost(e) 内で action === "getInspectionListDates" のときに呼び出してください。

function getInspectionListDates(payload) {
  const masterSpreadsheetId =
    payload.masterSpreadsheetId || "14FBV3XuMWhv4DcjfjmIWSY5zY5NbxD5gp2E1rqTQPHs";
  const routeName = normalizeText_(payload.routeName);
  const stationName = normalizeStationName_(payload.station);
  const year = String(payload.year || "").trim().replace(/年度?$/, "");

  if (!routeName || !stationName || !year) {
    return {
      success: true,
      firstDate: "",
      firstDates: [],
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
      firstDates: [],
      latestDate: "",
      message: "路線名と一致するシートが見つかりません",
    };
  }

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 3) {
    return { success: true, firstDate: "", firstDates: [], latestDate: "" };
  }

  const stationValues = sheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
  const stationIndex = stationValues.findIndex(
    row => normalizeStationName_(row[0]) === stationName
  );
  if (stationIndex === -1) {
    return {
      success: true,
      firstDate: "",
      firstDates: [],
      latestDate: "",
      message: "駅名が見つかりません",
    };
  }

  const targetRow = stationIndex + 2;
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const firstColumns = findFirstInspectionDateColumns_(headers);
  const latestColumn = findInspectionDateColumn_(headers, year);
  const firstDates = uniqueNonEmptyValues_(
    firstColumns.map(column => sheet.getRange(targetRow, column).getDisplayValue())
  );

  return {
    success: true,
    stationNo: sheet.getRange(targetRow, 1).getDisplayValue(),
    firstDate: firstDates[0] || "",
    firstDates: firstDates,
    latestDate: latestColumn ? sheet.getRange(targetRow, latestColumn).getDisplayValue() : "",
    sheetName: sheet.getName(),
    row: targetRow,
    firstHeaders: firstColumns.map(column => headers[column - 1] || ""),
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
  const yearHeaders = headers.slice(3);
  const index = yearHeaders.findIndex(header => {
    const text = normalizeText_(header);
    const match = text.match(/^(\d{4})(?:年|年度)_点検日$/);
    return match && match[1] === targetYear;
  });

  return index === -1 ? null : index + 4;
}

function findFirstInspectionDateColumns_(headers) {
  return headers.reduce((columns, header, index) => {
    if (index >= 2 && normalizeText_(header) === "初回_点検日") {
      columns.push(index + 1);
    }
    return columns;
  }, []);
}

function uniqueNonEmptyValues_(values) {
  return values.reduce((result, value) => {
    const text = String(value || "").trim();
    if (text && result.indexOf(text) === -1) result.push(text);
    return result;
  }, []);
}

function normalizeText_(value) {
  return String(value || "").replace(/\s+/g, "").trim();
}

function normalizeStationName_(value) {
  return normalizeText_(value).replace(/駅$/, "");
}

function formatDate_(value) {
  if (!value) return "";

  if (value instanceof Date) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "yyyy/MM/dd"
    );
  }

  return String(value);
}

// 既存の getRouteList() をこの内容に差し替えてください。
// ルートフォルダ走査は遅くなることがあるため、5分間キャッシュします。
// 路線はフォルダ作成日の古い順に並べます。

function getRouteList() {
  const cache = CacheService.getScriptCache();
  const cacheKey = "route_list_v2";
  const cached = cache.get(cacheKey);

  if (cached) {
    return {
      success: true,
      list: JSON.parse(cached),
      cached: true,
    };
  }

  const ROOT_FOLDER_ID = "1L_a6as-Wxc-BOOojkLo7BDtbx2wSZT30";
  const root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  const folders = root.getFolders();
  const list = [];

  while (folders.hasNext()) {
    const folder = folders.next();
    const name = folder.getName();

    if (name.indexOf("駅構内点検_") === 0) {
      list.push({
        name: name.replace("駅構内点検_", ""),
        folderId: folder.getId(),
        createdAt: folder.getDateCreated().toISOString(),
      });
    }
  }

  list.sort((a, b) => {
    const dateDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return dateDiff || String(a.name).localeCompare(String(b.name), "ja");
  });
  cache.put(cacheKey, JSON.stringify(list), 300);

  return {
    success: true,
    list: list,
    cached: false,
  };
}

function createJsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
// ==========================================
// 2. エントリポイント
// ==========================================

function doGet(e) {

  const action = e.parameter.action;

  switch (action) {

    case "getRouteList":
      return createJsonResponse(getRouteList());

    case "getKarteList":
      return getExistingKarteList(e.parameter.spreadsheetId);

    case "getExistingData":
      return getExistingData(e.parameter.routeFolderId);

    case "getMaps":
      return handleGetMaps(e.parameter.folderId, e.parameter.routeName);

    case "getPulldownLists":
      return getPulldownLists();

    default:
      return createJsonResponse({
        success:false,
        error:"unknown action"
      });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;

    switch (action) {

      case "getRouteList":
      return createJsonResponse(getRouteList());

      case "getPulldownLists":
      return getPulldownLists();

      case "getInspectionListDates":
      return createJsonResponse(getInspectionListDates(body));

      // --- 新規点検シート作成 ---
      case "createNew":
      return createNewInspectionSheet(
      body.stationNo,
      body.station,
      body.year,
      body.routeName,
      body.routeFolderId
      );

      case "getUnavailableKarteNumbers":
        return getUnavailableKarteNumbers(body.spreadsheetId);

      case "addUnavailableKarteNumber":
        return addUnavailableKarteNumber(body.spreadsheetId, body.karteNo);

case "getMapEditorData":
  return createJsonResponse(getMapEditorData(body));

case "getMaps":
  return handleGetMaps(body.folderId, body.routeName);

case "deleteUnavailableKarteNumber":
  return createJsonResponse(
    deleteUnavailableKarteNumber(body)
  );

case "getInspectionReportData":
  return createJsonResponse(getInspectionReportData(body));

case "uploadInspectionReport":
  return createJsonResponse(uploadInspectionReport(body));

case "uploadCover":
  return createJsonResponse(uploadCover(body));

case "updateInspectionListMasterStation":
  return createJsonResponse(updateInspectionListMasterStation(body));

case "startInspectionPdfMerge":
  return createJsonResponse(startInspectionPdfMerge(body));

case "getInspectionPdfMergeStatus":
//   return createJsonResponse(getInspectionPdfMergeStatus(body));

      // --- 既存データ取得 ---
      case "getExistingData":
        return getExistingData(body.routeFolderId);

      // --- 写真カルテリスト取得 ---
      case "getKarteList":
        return getExistingKarteList(body.spreadsheetId);

      // --- 写真カルテデータ取得 ---
      case "getKarteData":
        return handleGetKarteData(body);

      // --- 写真アップロード ---
      case "uploadPhotos":
        return uploadPhotos(body);

      // --- 写真カルテアップロード / 傾斜アップロード ---
      case "uploadKarte":
      return uploadKarte(body, "写真カルテ_マスタ");

      case "uploadInclination":
      return uploadKarte(body, "傾斜測定カルテ_マスタ");

      case "uploadSlopeTable":
      return createJsonResponse(uploadSlopeTable(body));

case "uploadInclinationKarteSheets":
  return createJsonResponse(uploadInclinationKarteSheets(body));

case "uploadInclinationKartePhoto":
  return createJsonResponse(uploadInclinationKartePhoto(body));

case "getInclinationKarteSheets":
  return createJsonResponse(getInclinationKarteSheets(body));

case "getSlopeTableData":
  return createJsonResponse(
    getSlopeTableData(
      body.spreadsheetId,
      body.stationName,
      body.year,
      body.routeName
    )
  );

case "getPdfSheetOptions":
  return createJsonResponse(getPdfSheetOptions(body));
case "createInspectionPdf":
  return createJsonResponse(createInspectionPdf(body));
case "findCompletedInspectionPdf":
  return createJsonResponse(findCompletedInspectionPdf(body));

      // --- ドライブ内のマップ一覧取得 ---
      case "getMaps":
        return handleGetMaps();

      // --- 指定IDのマップをBase64で取得 ---
      case "getMapBase64":
        return handleGetMapBase64(body.id);

      default:
        return createJsonResponse({
          success: false,
          error: "Unknown action"
        });
    }

  } catch (err) {
    return createJsonResponse({
      success: false,
      error: err.toString()
    });
  }
}

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


function readCheckItemsByPlace(ss) {
  const result = {};

  ss.getSheets().forEach(sheet => {
    const sheetName = sheet.getName();

    if (!sheetName.startsWith("点検項目_")) return;

    const key = sheetName.replace("点検項目_", "").trim();
    const values = sheet
      .getDataRange()
      .getDisplayValues()
      .filter(row => row.some(cell => String(cell).trim()));

    result[key] = values;
  });

  return result;
}

function readFinishOptionsByPlace(sheet) {
  if (!sheet) return {};

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow < 2 || lastCol < 3) return {};

  const headers = sheet.getRange(1, 3, 1, lastCol - 2).getDisplayValues()[0];
  const values = sheet.getRange(2, 3, lastRow - 1, lastCol - 2).getDisplayValues();

  const result = {};

  headers.forEach((header, colIndex) => {
    const key = String(header).trim().replace(/_仕上げ$/, "");
    if (!key) return;

    result[key] = values
      .map(row => String(row[colIndex]).trim())
      .filter(Boolean);
  });

  return result;
}

function readPulldownColumn(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();

  // データが2行目以降に存在しない場合
  if (lastRow < 2) return [];

  return sheet
    .getRange(2, 1, lastRow - 1, 1) // ← 2行目から取得
    .getDisplayValues()
    .map(r => String(r[0]).trim())
    .filter(Boolean);
}

// --- ドライブ内のマップ一覧取得 ---
function handleGetMaps() {
  const files = DriveApp.getFolderById(CONFIG.MAP_FOLDER_ID).getFiles();
  const results = [];
  while (files.hasNext()) {
    const f = files.next();
    if (f.getMimeType().includes("image/")) {
      results.push({ 
        id: f.getId(), 
        name: f.getName(), 
        thumbUrl: `https://drive.google.com/thumbnail?id=${f.getId()}&sz=w300` 
      });
    }
  }
  return createJsonResponse({ success: true, list: results });
}

// --- 指定IDのマップをBase64で返す ---
function handleGetMapBase64(id) {
  if (!id) return createJsonResponse({ success: false, error: "No ID provided" });
  const blob = DriveApp.getFileById(id).getBlob();
  const base64 = Utilities.base64Encode(blob.getBytes());
  return ContentService.createTextOutput(base64).setMimeType(ContentService.MimeType.TEXT);
}

// 追加：作成済みカルテ（シート名）の一覧を取得する
function getExistingKarteList(spreadsheetId) {

  try {

    const ss = SpreadsheetApp.openById(spreadsheetId);

    const sheets = ss.getSheets();

    const list = sheets
      .map(s => s.getName())
      .filter(n => !isNaN(n))
      .sort((a,b)=>Number(a)-Number(b));

    return createJsonResponse({
      success:true,
      list:list
    });

  } catch(e) {

    return createJsonResponse({
      success:false,
      error:e.toString()
    });

  }

}

function getExistingData(routeFolderId) {

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

  let list = values.map(r => ({
    stationNo: r[0],          // A
    stationName: r[1],        // B
    year: String(r[2]),       // C
    spreadsheetId: r[3],      // D
    folderId: r[4],           // E
    photoFolderId: r[5],      // F
    routeName: r[8],          // I
    routeFolderId: r[9]       // J
  }));

  if (routeFolderId) {
    list = list.filter(r => String(r.routeFolderId) === String(routeFolderId));
  }

  return createJsonResponse({
    success: true,
    list
  });
}


// --- データの読み取り用関数（末尾などに追加） ---
function handleGetKarteData(params) {

  try {

    const ss = SpreadsheetApp.openById(params.spreadsheetId);

    const sheetName = String(params.karteNo).trim();

    const sheet = ss.getSheetByName(sheetName);

    if (!sheet) {

      return createJsonResponse({
        success: false,
        error: "シート「" + sheetName + "」が見つかりません。"
      });

    }

    // =========================
    // 写真取得
    // =========================

const photos = Array(4).fill(null);
const firstPhotos = Array(4).fill(null);

try {
  const photoFolderId = getPhotoFolderId(
    params.station,
    params.year,
    params.routeFolderId
  );

  if (photoFolderId) {
    const parentFolder = DriveApp.getFolderById(photoFolderId);
    const subFolders = parentFolder.getFoldersByName(sheetName);

    if (subFolders.hasNext()) {
      const files = subFolders.next().getFiles();

      while (files.hasNext()) {
        const f = files.next();
        const name = f.getName();

        if (name.startsWith("初回点検_")) {
          const baseName = name.replace(".jpg", "");
          const parts = baseName.split("_");
          // 初回点検_2026_12_1.jpg
          // [初回点検, 2026, 12, 1]
          const idx = parseInt(parts[3]) - 1;

          if (idx >= 0 && idx < 4) {
            firstPhotos[idx] =
              "data:image/jpeg;base64," +
              Utilities.base64Encode(f.getBlob().getBytes());
          }
        } else {
          const baseName = name.replace(".jpg", "");
          const parts = baseName.split("_");
          // 2026_12_1.jpg
          // [2026, 12, 1]
          const idx = parseInt(parts[2]) - 1;

          if (idx >= 0 && idx < 4) {
            photos[idx] =
              "data:image/jpeg;base64," +
              Utilities.base64Encode(f.getBlob().getBytes());
          }
        }
      }
    }
  }
} catch (e) {
  Logger.log(e);
}


    // =========================
    // データ取得
    // =========================

    const data = {

      karteNo: sheet.getRange("D1").getValue(),
      stationName: sheet.getRange("I1").getValue(),

      structEval: sheet.getRange("F3").getValue(),
      impactEval: sheet.getRange("I3").getValue(),
      totalEval: sheet.getRange("L3").getValue(),
      prevYearEval: sheet.getRange("Q3").getValue(),

      firstKarteNo: sheet.getRange("D8").getDisplayValue(),
      firstDate: sheet.getRange("F5").getDisplayValue(),
      firstInspector: sheet.getRange("F6").getValue(),

      firstFinish: sheet.getRange("J10").getValue(),
      firstSituation: sheet.getRange("J13").getValue(),
      firstDetail: sheet.getRange("J16").getValue(),

      inspectDate: sheet.getRange("R5").getDisplayValue(),

      contractor: sheet.getRange("V3").getValue(),
      buildingCategory: sheet.getRange("L1").getValue(),
      inspectionPlace: sheet.getRange("P1").getValue(),
      locationDetail: sheet.getRange("Q1").getValue(),
      inspector: sheet.getRange("R6").getValue(),

      remarks1: sheet.getRange("V10").getValue(),
      remarks2: sheet.getRange("V13").getValue(),
      remarks3: sheet.getRange("V16").getValue(),

      photos: photos,
      firstPhotos: firstPhotos
    };

    return createJsonResponse({
      success: true,
      data: data
    });

  } catch (err) {

    return createJsonResponse({
      success: false,
      error: err.toString()
    });

  }

}

// ==========================================
// 3. 業務ロジック関数
// ==========================================

function createNewInspectionSheet(
  stationNo,
  stationName,
  year,
  routeName,
  routeFolderId
) {


  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {

    const masterSS = SpreadsheetApp.openById(CONFIG.TEMPLATE_SS_ID);
    const logSheet = masterSS.getSheetByName("現場管理台帳");

    if (!logSheet) {
      throw new Error("現場管理台帳シートがありません");
    }

    const data = logSheet.getDataRange().getValues();

    // ===== 既存チェック =====
for (let i = 1; i < data.length; i++) {

  const sameStation = data[i][1] == stationName;
  const sameYear = String(data[i][2]) == String(year);
  const sameRoute = String(data[i][9]) == String(routeFolderId);

  if (sameStation && sameYear && sameRoute) {
    return createJsonResponse({
      success: true,
      spreadsheetId: data[i][3],
      folderId: data[i][4],
      message: "既存データ使用"
    });
  }
}

    // ===== フォルダ準備 =====
    const parentFolder =
  DriveApp.getFolderById(routeFolderId);

    let stationFolder;
    const folderBaseName = `${stationNo}_${stationName}`;

    const sFolders = parentFolder.getFoldersByName(folderBaseName);

    stationFolder = sFolders.hasNext()
    ? sFolders.next()
    : parentFolder.createFolder(folderBaseName);

    const folderName = `${year}年度_点検資料`;

    let newFolder;
    const existFolders = stationFolder.getFoldersByName(folderName);

    newFolder = existFolders.hasNext()
      ? existFolders.next()
      : stationFolder.createFolder(folderName);

    // ===== スプレッドシートコピー =====
    const templateFile = DriveApp.getFileById(CONFIG.INSPECTION_TEMPLATE_ID);

    const newFileName = `施設点検報告書_${stationName}_${year}`;

    const newFile = templateFile.makeCopy(newFileName, newFolder);

    const newFileId = newFile.getId();

    // ===== 写真フォルダ =====
const photoFolder = getOrCreateStationPhotoFolder_(newFolder);
const photoFolderId = photoFolder.getId();

    // ===== シート準備 =====
    const ss = SpreadsheetApp.openById(newFileId);

    const sheetMapping = {
    "写真カルテ番号_マスタ": "写真カルテ番号",
    "表紙_マスタ": "表紙",
    "点検結果総括表_マスタ": "点検結果総括表",
    "施設点検報告書_マスタ": "施設点検報告書",
    "写真カルテ番号位置図_マスタ": "写真カルテ番号位置",
    "傾斜表_マスタ": "傾斜表"
    };

    for (let masterName in sheetMapping) {

      const masterSheet = ss.getSheetByName(masterName);

      if (masterSheet) {

        const newSheet = masterSheet.copyTo(ss);

        newSheet.setName(sheetMapping[masterName]);

      }

    }

    // ===== 不要シート非表示 =====
    const hideList = [
    "現場管理台帳",
    "写真カルテ番号_マスタ",
    "リスト_マスタ",
    "表紙_マスタ",
    "点検結果総括表_マスタ",
    "施設点検報告書_マスタ",
    "写真カルテ番号位置図_マスタ",
    "写真カルテ_マスタ",
    "傾斜表_マスタ",
    "傾斜測定カルテ_マスタ"
    ];

    ss.getSheets().forEach(s => {
      if (hideList.includes(s.getName())) {
        try { s.hideSheet(); } catch(e){}
      }
    });

    // ===== 台帳登録 =====
    const now = new Date();

logSheet.appendRow([
  stationNo,            // A：駅番号
  stationName,          // B：駅名
  year,                 // C：年度
  newFileId,            // D：スプレッドシートID
  newFolder.getId(),    // E：フォルダID
  photoFolderId,        // F：写真フォルダID
  now,                  // G：作成日
  now,                  // H：最終更新日
  routeName,            // I：路線名
  routeFolderId         // J：路線フォルダID
]);


    return createJsonResponse({
      success: true,
      spreadsheetId: newFileId,
      folderId: newFolder.getId()
    });

  } finally {

    lock.releaseLock();

  }
  
}

function getPhotoNumberSheet(ss) {
  let sheet = ss.getSheetByName("写真カルテ番号");

  if (!sheet) {
    const master = ss.getSheetByName("写真カルテ番号_マスタ");
    if (master) {
      sheet = master.copyTo(ss).setName("写真カルテ番号").showSheet();
    }
  }

  if (!sheet) {
    sheet = ss.insertSheet("写真カルテ番号");
    sheet.getRange("A1").setValue("使用できない写真カルテ番号");
  }

  return sheet;
}

function getUnavailableKarteNumbers(spreadsheetId) {
  try {
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = getPhotoNumberSheet(ss);
    const lastRow = sheet.getLastRow();

    if (lastRow < 2) {
      return createJsonResponse({ success: true, list: [] });
    }

    const list = sheet
      .getRange(2, 1, lastRow - 1, 1)
      .getValues()
      .map(r => String(r[0]).trim())
      .filter(v => v && !isNaN(v));

    return createJsonResponse({
      success: true,
      list: Array.from(new Set(list))
    });
  } catch (e) {
    return createJsonResponse({
      success: false,
      error: e.toString()
    });
  }
}

function addUnavailableKarteNumber(spreadsheetId, karteNo) {
  try {
    const no = String(karteNo).trim();

    if (!no || isNaN(no)) {
      return createJsonResponse({
        success: false,
        error: "番号は数字で入力してください"
      });
    }

    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = getPhotoNumberSheet(ss);

    const existing = getUnavailableKarteNumbersRaw(sheet);

    if (!existing.includes(no)) {
      sheet.appendRow([no]);
    }

    return createJsonResponse({
      success: true,
      karteNo: no
    });
  } catch (e) {
    return createJsonResponse({
      success: false,
      error: e.toString()
    });
  }
}

function getUnavailableKarteNumbersRaw(sheet) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return [];

  return sheet
    .getRange(2, 1, lastRow - 1, 1)
    .getValues()
    .map(r => String(r[0]).trim())
    .filter(v => v && !isNaN(v));
}

const PHOTO_LAYOUT = {
//横写真1枚、offset=左から何pxずらすか、widthFactor=枠に対して何％の幅にするか
  singleLandscape: {
    offset: 8,
    widthFactor: 0.95
  },
//縦写真1枚
  singlePortrait: {
    offset: 28,
    widthFactor: 0.98
  },
//横写真2枚
  doubleLandscape: {
    leftOffset: 8,
    rightOffset: 22,
    widthFactor: 0.98
  },
//縦写真2枚
  doublePortrait: {
    leftOffset: 35,
    rightOffset: 45,
    widthFactor: 0.55
  },
//左が横写真+右が縦写真
  landscapePortrait: {
    leftOffset: 8,
    rightOffset: 45,
    widthFactor: 0.75
  },
//左が縦写真+右が横写真
  portraitLandscape: {
    leftOffset: 35,
    rightOffset: 22,
    widthFactor: 0.75
  }

};

function getPhotoLayout(leftIsPortrait, rightIsPortrait) {

  // 横＋横
  if (!leftIsPortrait && !rightIsPortrait) {
    return PHOTO_LAYOUT.doubleLandscape;
  }

  // 縦＋縦
  if (leftIsPortrait && rightIsPortrait) {
    return PHOTO_LAYOUT.doublePortrait;
  }

  // 横＋縦
  if (!leftIsPortrait && rightIsPortrait) {
    return PHOTO_LAYOUT.landscapePortrait;
  }

  // 縦＋横
  return PHOTO_LAYOUT.portraitLandscape;
}

function applyKarteHeaderTextStyle_(range, value) {
  const text = value === null || value === undefined ? "" : String(value);
  const style = getKarteHeaderTextStyle_(text.length);

  range
    .setValue(text)
    .setFontSize(style.fontSize)
    .setWrap(style.wrap);
}

function getKarteHeaderTextStyle_(length) {
  if (length >= 13) {
    return { fontSize: 5, wrap: true };
  }

  if (length >= 7) {
    return { fontSize: 6, wrap: true };
  }

  if (length === 6) {
    return { fontSize: 6, wrap: false };
  }

  if (length === 5) {
    return { fontSize: 7, wrap: false };
  }

  if (length === 4) {
    return { fontSize: 9, wrap: false };
  }

  if (length === 3) {
    return { fontSize: 10, wrap: false };
  }

  return { fontSize: 11, wrap: false };
}

function uploadKarte(data, templateName) {
  const ss = SpreadsheetApp.openById(data.spreadsheetId);
  const templateSheet = ss.getSheetByName(templateName);

  if (!templateSheet) {
    throw new Error(templateName + "が見つかりません");
  }

  const newSheetName = (data.karteNo || data.no || "1").toString(); 
  let sheet = ss.getSheetByName(newSheetName);

  if (sheet) {
    sheet.getImages().forEach(img => img.remove());
  } else {
    sheet = templateSheet.copyTo(ss).setName(newSheetName).showSheet();
  }

  sheet.getRange("F1").setValue(data.station.replace("駅", ""));

const structCell = sheet.getRange("F3");

structCell.setValue(data.structEval);
structCell.setFontColor("black");

  sheet.getRange("I3").setValue(data.impactEval);   // ② 影響
  const totalCell = sheet.getRange("L3");

totalCell.setValue(data.totalEval);

// 赤字条件
if (data.totalEval === "AA" || data.totalEval === "A1" || data.totalEval === "A2" || data.totalEval === "B") {
  totalCell.setFontColor("#dc2626");
} else {
  totalCell.setFontColor("black");
}

  sheet.getRange("Q3").setValue(data.prevYearEval); // 前年度
  if (templateName === "写真カルテ_マスタ") {
  sheet.getRange("D8").setValue(
    data.firstKarteNo ? Number(data.firstKarteNo) : ""
  );
}
  sheet.getRange("F5").setValue(toSheetDate(data.firstDate)); // 初回日
  sheet.getRange("F6").setValue(data.firstInspector); // 初回者
  sheet.getRange("J10").setValue(data.firstFinish);
  sheet.getRange("J13").setValue(data.firstSituation);
  sheet.getRange("J16").setValue(data.firstDetail);

  // --- 【既存の反映項目】 ---
  sheet.getRange("D1").setValue(data.karteNo);
  sheet.getRange("R5").setValue(toSheetDate(data.inspectDate));
  sheet.getRange("V3").setValue(data.contractor);
  sheet.getRange("R6").setValue(data.inspector);
  sheet.getRange("L1").setValue(data.buildingCategory || "");
  applyKarteHeaderTextStyle_(sheet.getRange("P1"), data.inspectionPlace || "");
  applyKarteHeaderTextStyle_(sheet.getRange("Q1"), data.locationDetail || "");
  sheet.getRange("V10").setValue(data.remarks1);
  sheet.getRange("V13").setValue(data.remarks2);
  sheet.getRange("V16").setValue(data.remarks3);

  // 2. 写真保存エリア内の写真カルテ番号フォルダを準備
  const hasPhotoFiles =
    (data.photoFiles && data.photoFiles.length > 0) ||
    (data.firstPhotoFiles && data.firstPhotoFiles.length > 0);
  let karteSubFolder = null;

  if (templateName === "写真カルテ_マスタ" || hasPhotoFiles) {

    const photoFolderId = getPhotoFolderId(
    data.station,
    data.year,
    data.routeFolderId
    );

    if (!photoFolderId) throw new Error("写真フォルダIDが台帳に見つかりません");
    
    const parentPhotoFolder = DriveApp.getFolderById(photoFolderId);
    const subFolders = parentPhotoFolder.getFoldersByName(newSheetName);
    
    if (subFolders.hasNext()) {
      karteSubFolder = subFolders.next();
    } else {
      karteSubFolder = parentPhotoFolder.createFolder(newSheetName);
    }
  }

  // 3. 写真の保存と配置処理
  if (hasPhotoFiles) {
    if (!karteSubFolder) {
      throw new Error("写真カルテ番号フォルダを作成できませんでした");
    }

    const files = karteSubFolder.getFiles();
    while (files.hasNext()) files.next().setTrashed(true);

const savedBlobs = {};

(data.photoFiles || []).forEach((fileObj) => {

  if (!fileObj.base64) return;

  const index = fileObj.no;

  // ファイル名
  const newFileName =
    `${data.year}_${newSheetName}_${index}.jpg`;

  Logger.log(newFileName);

  // Base64取り出し
  const base64Data = fileObj.base64.includes(",")
    ? fileObj.base64.split(",")[1]
    : fileObj.base64;

  // Blob化
  const blob = Utilities.newBlob(
    Utilities.base64Decode(base64Data),
    "image/jpeg",
    newFileName
  );

  // Drive保存
  karteSubFolder.createFile(blob);

  // 後で貼り付けに使う
  savedBlobs[index] = blob;

});

const savedFirstBlobs = {};

(data.firstPhotoFiles || []).forEach((fileObj) => {

  if (!fileObj.base64) return;

  const index = fileObj.no;

  const newFileName =
    `初回点検_${data.year}_${newSheetName}_${index}.jpg`;

  Logger.log(newFileName);

  const base64Data = fileObj.base64.includes(",")
    ? fileObj.base64.split(",")[1]
    : fileObj.base64;

  const blob = Utilities.newBlob(
    Utilities.base64Decode(base64Data),
    "image/jpeg",
    newFileName
  );

  karteSubFolder.createFile(blob);

  savedFirstBlobs[index] = blob;

});

// ========================================
// 初回点検写真 上段（1・2）
// ========================================

const firstUpperPhotos = [
  savedFirstBlobs[1],
  savedFirstBlobs[2]
].filter(Boolean);

if (firstUpperPhotos.length === 1) {

  insertImageToRange(
    sheet,
    firstUpperPhotos[0],
    "B8:I25"
  );

} else if (firstUpperPhotos.length === 2) {

  insertImageToRangeFixedWidth(
    sheet,
    firstUpperPhotos[0],
    "B8:F25",
    getRangePixelWidth(sheet, "B8:F25"),
    0.95,
    8
  );

  insertImageToRangeFixedWidth(
    sheet,
    firstUpperPhotos[1],
    "F8:I25",
    getRangePixelWidth(sheet, "F8:I25"),
    0.95,
    8
  );
}


// ========================================
// 初回点検写真 下段（3・4）
// ========================================

const firstLowerPhotos = [
  savedFirstBlobs[3],
  savedFirstBlobs[4]
].filter(Boolean);

if (firstLowerPhotos.length === 1) {

  insertImageToRange(
    sheet,
    firstLowerPhotos[0],
    "B26:K43"
  );

} else if (firstLowerPhotos.length === 2) {

  insertImageToRangeFixedWidth(
    sheet,
    firstLowerPhotos[0],
    "B26:F43",
    getRangePixelWidth(sheet, "B26:F43"),
    0.95,
    8
  );

  insertImageToRangeFixedWidth(
    sheet,
    firstLowerPhotos[1],
    "G26:K43",
    getRangePixelWidth(sheet, "G26:K43"),
    0.95,
    8
  );
}

// ========================================
// 今回写真 上段（1・2）
// ========================================

const upperPhotos = [
  savedBlobs[1],
  savedBlobs[2]
].filter(Boolean);

if (upperPhotos.length === 1) {

  insertImageToRange(
    sheet,
    upperPhotos[0],
    "N8:U25"
  );

} else if (upperPhotos.length === 2) {

  insertImageToRangeFixedWidth(
    sheet,
    upperPhotos[0],
    "N8:R25",
    getRangePixelWidth(sheet, "N8:R25"),
    0.95,
    8
  );

  insertImageToRangeFixedWidth(
    sheet,
    upperPhotos[1],
    "R8:U25",
    getRangePixelWidth(sheet, "R8:U25"),
    0.95,
    8
  );
}


// ========================================
// 今回写真 下段（3・4）
// ========================================

const lowerPhotos = [
  savedBlobs[3],
  savedBlobs[4]
].filter(Boolean);

if (lowerPhotos.length === 1) {

  insertImageToRange(
    sheet,
    lowerPhotos[0],
    "N26:W43"
  );

} else if (lowerPhotos.length === 2) {

  insertImageToRangeFixedWidth(
    sheet,
    lowerPhotos[0],
    "N26:R43",
    getRangePixelWidth(sheet, "N26:R43"),
    0.95,
    8
  );

  insertImageToRangeFixedWidth(
    sheet,
    lowerPhotos[1],
    "S26:W43",
    getRangePixelWidth(sheet, "S26:W43"),
    0.95,
    8
  );
}

  }

  if (templateName === "写真カルテ_マスタ") {
    const firstKarteCell = sheet.getRange("D8");
    const mergedRanges = firstKarteCell.getMergedRanges();
    const fontRange = mergedRanges.length
      ? mergedRanges[0]
      : firstKarteCell;

    fontRange
      .setFontFamily("MS Mincho")
      .setFontSize(8);
  }

  SpreadsheetApp.flush();

  // 戻り値を JSON 形式で返す（React 側の判定に合わせる）
  const result = { success: true, message: "Success: No." + newSheetName };
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function getRangePixelWidth(sheet, rangeA1) {
  const range = sheet.getRange(rangeA1);
  const startCol = range.getColumn();

  let width = 0;
  for (let i = 0; i < range.getNumColumns(); i++) {
    width += sheet.getColumnWidth(startCol + i);
  }

  return width;
}

function insertImageToRangeFixedWidth(sheet, blob, rangeA1, fixedWidth, widthFactor, xOffset) {
  const range = sheet.getRange(rangeA1);
  const startCol = range.getColumn();
  const startRow = range.getRow();

  let targetHeight = 0;
  for (let i = 0; i < range.getNumRows(); i++) {
    targetHeight += sheet.getRowHeight(startRow + i);
  }

  const img = sheet.insertImage(blob, startCol, startRow);

// 縦写真判定
const isPortrait = img.getHeight() > img.getWidth();

let newW;

// 横写真
if (!isPortrait) {

  newW = fixedWidth * widthFactor;

} else {

newW =
  fixedWidth *
  PHOTO_LAYOUT.doublePortrait.widthFactor;

}

const newH = img.getHeight() * (newW / img.getWidth());

img.setWidth(newW).setHeight(newH);

  img.setAnchorCellXOffset(xOffset);
  img.setAnchorCellYOffset((targetHeight - newH) / 2);
}

/**
 * 写真サイズ微調整用関数
 */
function insertImageToRange(sheet, blob, rangeA1) {

  const range = sheet.getRange(rangeA1);
  const startCol = range.getColumn();
  const startRow = range.getRow();

  let targetWidth = 0;
  for (let i = 0; i < range.getNumColumns(); i++) {
    targetWidth += sheet.getColumnWidth(startCol + i);
  }

  let targetHeight = 0;
  for (let i = 0; i < range.getNumRows(); i++) {
    targetHeight += sheet.getRowHeight(startRow + i);
  }

  // まず画像生成
  const img = sheet.insertImage(blob, startCol, startRow);

  // 縦横判定
  const isPortrait =
    img.getHeight() > img.getWidth();

  // サイズ倍率
  const factor = isPortrait
    ? PHOTO_LAYOUT.singlePortrait.widthFactor
    : PHOTO_LAYOUT.singleLandscape.widthFactor;

  const maxWidth = targetWidth * factor;
  const maxHeight = targetHeight * factor;

  const ratio = Math.min(
    maxWidth / img.getWidth(),
    maxHeight / img.getHeight()
  );

  const newW = img.getWidth() * ratio;
  const newH = img.getHeight() * ratio;

  img.setWidth(newW).setHeight(newH);

  // オフセット
  const xOffset = isPortrait
    ? PHOTO_LAYOUT.singlePortrait.offset
    : PHOTO_LAYOUT.singleLandscape.offset;

  // 左寄せ
  img.setAnchorCellXOffset(xOffset);

  // 縦中央
  img.setAnchorCellYOffset(
    (targetHeight - newH) / 2
  );
}

// ==========================================
// 4. サポート関数
// ==========================================

function getPhotoFolderId(stationName, year, routeFolderId) {
  const rows = SpreadsheetApp
    .openById(CONFIG.TEMPLATE_SS_ID)
    .getSheetByName("現場管理台帳")
    .getDataRange()
    .getValues();

  for (let i = 1; i < rows.length; i++) {
    const sameStation = rows[i][1].toString() === stationName;
    const sameYear = rows[i][2].toString() === String(year);
    const sameRoute = !routeFolderId || rows[i][9].toString() === String(routeFolderId);

    if (sameStation && sameYear && sameRoute) {
      return rows[i][5];
    }
  }

  return null;
}

function getSpreadsheetId(station, year) {
  const rows = SpreadsheetApp.openById(CONFIG.TEMPLATE_SS_ID).getSheetByName("現場管理台帳").getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1].toString() === station && rows[i][2].toString() === year) return rows[i][3];
  }
  return null;
}

function handleGetKarteDetail(station, year, no) {
  const ssId = getSpreadsheetId(station, year);
  const sheet = SpreadsheetApp.openById(ssId).getSheetByName(no);
  if (!sheet) return createJsonResponse({});

  const photos = Array(4).fill(null);
  const photoFolderId = getPhotoFolderId(station, year);
  if (photoFolderId) {
    try {
      const parentFolder = DriveApp.getFolderById(photoFolderId);
      const subFolders = parentFolder.getFoldersByName(no.toString());
      if (subFolders.hasNext()) {
        const files = subFolders.next().getFiles();
        while (files.hasNext()) {
          const f = files.next();
          const idx = parseInt(f.getName().split('.')[0]) - 1;
          if (idx >= 0 && idx < 4) photos[idx] = "data:image/jpeg;base64," + Utilities.base64Encode(f.getBlob().getBytes());
        }
      }
    } catch (e) {}
  }

  return createJsonResponse({
  no: sheet.getRange("D1").getValue(),
  date: sheet.getRange("R5").getValue(),
  contractor: sheet.getRange("V3").getValue(),
  inspector: sheet.getRange("R6").getValue(),
  locationDetail: sheet.getRange("L1").getValue(),

  // ★ここを修正
  remarks1: sheet.getRange("V10").getValue(),
  remarks2: sheet.getRange("V13").getValue(),
  remarks3: sheet.getRange("V16").getValue(),

  photos: photos
});
}

function handleGetKarteList(station, year) {
  try {
    const ssId = getSpreadsheetId(station, year);
    if (!ssId) return createJsonResponse([]);
    const ss = SpreadsheetApp.openById(ssId);
    const karteNumbers = ss.getSheets()
      .map(s => s.getName())
      .filter(name => !isNaN(name) && name.trim() !== "" && !name.includes("マスタ"));
    return createJsonResponse(karteNumbers.sort((a, b) => a - b));
  } catch (e) { return createJsonResponse([]); }
}

function handleGetStationListData() {
  const sheet = SpreadsheetApp.openById(CONFIG.TEMPLATE_SS_ID).getSheetByName("現場管理台帳");
  const rows = sheet.getDataRange().getValues();
  return createJsonResponse(rows.slice(1).filter(r => r[0]).map(r => ({
    stationNo: r[0].toString(),
stationName: r[1].toString(),
year: r[2].toString(),
spreadsheetId: r[3] ? r[3].toString() : ""
  })));
}

function getPdfSheetOptions(data) {
  const ss = SpreadsheetApp.openById(data.spreadsheetId);
  const groups = {
    photo: [],
    slope: [],
    inclination: [],
  };

  ss.getSheets().forEach(sheet => {
    if (sheet.isSheetHidden()) return;

    const name = sheet.getName();

    if (/^\d+$/.test(name)) {
      groups.photo.push({
        name,
        label: name,
        group: "photo",
      });
      return;
    }

    if (name === "傾斜表") {
      groups.slope.push({
        name,
        label: name,
        group: "slope",
      });
      return;
    }

    if (isPdfInclinationSheet_(sheet)) {
      groups.inclination.push({
        name,
        label: sheet.getRange("D1").getDisplayValue() || name,
        group: "inclination",
      });
    }
  });

  groups.photo.sort((a, b) => Number(a.name) - Number(b.name));
  groups.inclination.sort((a, b) => a.label.localeCompare(b.label, "ja"));

  return {
    success: true,
    groups,
  };
}

function createInspectionPdf(data) {
  const spreadsheetId = data.spreadsheetId;
  const selectedSheetNames = Array.isArray(data.sheetNames)
    ? data.sheetNames.map(name => String(name || "").trim()).filter(Boolean)
    : [];

  if (!spreadsheetId) {
    throw new Error("spreadsheetId がありません");
  }

  if (selectedSheetNames.length === 0) {
    throw new Error("PDF化するシートが選択されていません");
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);
  const selectedSheets = selectedSheetNames.map(name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) {
      throw new Error("シートが見つかりません: " + name);
    }
    if (sheet.isSheetHidden()) {
      throw new Error("非表示シートはPDF化できません: " + name);
    }
    if (!isPdfExportTargetSheet_(sheet)) {
      throw new Error("PDF化対象外のシートです: " + name);
    }
    return sheet;
  });
  const exportGroups = buildPdfExportGroups_(selectedSheets);

  const originalVisibility = ss.getSheets().map(sheet => ({
    sheet,
    hidden: sheet.isSheetHidden(),
  }));

  const activeSheet = ss.getActiveSheet();
  const folder = getSpreadsheetParentFolder_(spreadsheetId);
  const multipleFiles = exportGroups.length > 1;
  const files = [];

  try {
    exportGroups.forEach(group => {
      const groupSet = new Set(group.sheets.map(sheet => sheet.getName()));

      group.sheets.forEach(sheet => {
        if (sheet.isSheetHidden()) sheet.showSheet();
      });
      SpreadsheetApp.flush();

      ss.setActiveSheet(group.sheets[0]);

      originalVisibility.forEach(item => {
        if (groupSet.has(item.sheet.getName())) {
          item.sheet.showSheet();
        } else if (!item.hidden) {
          item.sheet.hideSheet();
        }
      });

      SpreadsheetApp.flush();
      Utilities.sleep(1000);

      const pdfName = buildInspectionPdfName_(
        data.stationName,
        data.year,
        data.fileSuffix || (multipleFiles ? group.fileSuffix : "")
      );
      const url = buildSpreadsheetPdfExportUrl_(spreadsheetId, group.portrait);
      const response = UrlFetchApp.fetch(url, {
        headers: {
          Authorization: "Bearer " + ScriptApp.getOAuthToken(),
        },
        muteHttpExceptions: true,
      });

      const statusCode = response.getResponseCode();
      if (statusCode < 200 || statusCode >= 300) {
        throw new Error("PDF出力に失敗しました: HTTP " + statusCode);
      }

      const blob = response.getBlob().setName(pdfName);
      const existingFiles = folder.getFilesByName(pdfName);
      while (existingFiles.hasNext()) {
        existingFiles.next().setTrashed(true);
      }

      const file = folder.createFile(blob);

      files.push({
        fileId: file.getId(),
        fileName: file.getName(),
        url: file.getUrl(),
        orientation: group.portrait ? "portrait" : "landscape",
      });
    });

    return {
      success: true,
      files,
      fileId: files[0] ? files[0].fileId : "",
      fileName: files[0] ? files[0].fileName : "",
      url: files[0] ? files[0].url : "",
    };
  } finally {
    originalVisibility.forEach(item => {
      if (item.hidden) {
        if (!item.sheet.isSheetHidden()) item.sheet.hideSheet();
      } else {
        if (item.sheet.isSheetHidden()) item.sheet.showSheet();
      }
    });

    if (activeSheet) {
      ss.setActiveSheet(activeSheet);
    }

    SpreadsheetApp.flush();
  }
}

function buildPdfExportGroups_(sheets) {
  const photoSheets = [];
  const slopeSheets = [];
  const inclinationSheets = [];

  sheets.forEach(sheet => {
    const name = sheet.getName();

    if (/^\d+$/.test(name)) {
      photoSheets.push(sheet);
    } else if (name === "傾斜表") {
      slopeSheets.push(sheet);
    } else if (isPdfInclinationSheet_(sheet)) {
      inclinationSheets.push(sheet);
    }
  });

  const groups = [];

  if (photoSheets.length > 0) {
    groups.push({
      sheets: photoSheets,
      portrait: false,
      fileSuffix: "写真カルテ",
    });
  }

  if (slopeSheets.length > 0) {
    groups.push({
      sheets: slopeSheets,
      portrait: true,
      fileSuffix: "傾斜表",
    });
  }

  if (inclinationSheets.length > 0) {
    groups.push({
      sheets: inclinationSheets,
      portrait: false,
      fileSuffix: "傾斜測定カルテ",
    });
  }

  return groups;
}

function isPdfExportTargetSheet_(sheet) {
  const name = sheet.getName();
  return /^\d+$/.test(name) || name === "傾斜表" || isPdfInclinationSheet_(sheet);
}

function isPdfInclinationSheet_(sheet) {
  const name = sheet.getName();
  if (!name || name === "傾斜測定カルテ_マスタ") return false;
  if (name.indexOf("_マスタ") !== -1) return false;
  if (/^\d+$/.test(name)) return false;
  if ([
    "現場管理台帳",
    "写真カルテ番号",
    "表紙",
    "点検結果総括表",
    "施設点検報告書",
    "写真カルテ番号位置",
    "写真カルテ番号位置図",
    "傾斜表",
    "リスト",
  ].indexOf(name) !== -1) return false;

  const rangeLabel = sheet.getRange("D1").getDisplayValue();
  return name.indexOf("傾斜測定カルテ") !== -1 || (!!rangeLabel && name === sanitizeSheetName_(rangeLabel));
}

function buildInspectionPdfName_(stationName, year, suffix) {
  const station = String(stationName || "").trim() || "駅名未設定";
  const targetYear = String(year || "").trim() || "年度未設定";
  const suffixText = String(suffix || "").trim();
  return suffixText
    ? `施設点検報告書_${station}_${targetYear}_${suffixText}.pdf`
    : `施設点検報告書_${station}_${targetYear}.pdf`;
}

function buildSpreadsheetPdfExportUrl_(spreadsheetId, portrait) {
  const params = [
    "format=pdf",
    "size=A4",
    `portrait=${portrait ? "true" : "false"}`,
    "scale=4",
    "fitw=true",
    "sheetnames=false",
    "printtitle=false",
    "pagenumbers=false",
    "gridlines=false",
    `top_margin=${2.5 / 2.54}`,
    `bottom_margin=${2.0 / 2.54}`,
    `left_margin=${1.7 / 2.54}`,
    `right_margin=${1.7 / 2.54}`,
    "fzr=false",
  ];

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?${params.join("&")}`;
}

function getSpreadsheetParentFolder_(spreadsheetId) {
  const file = DriveApp.getFileById(spreadsheetId);
  const parents = file.getParents();
  return parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
}

function toSheetDate(value) {
  if (!value) return "";

  // Reactの date input から来る yyyy-MM-dd を yyyy/MM/dd に変換
  if (typeof value === "string" && value.includes("-")) {
    return value.replace(/-/g, "/");
  }

  return value;
}

function deleteUnavailableKarteNumber(data){

  const ss = SpreadsheetApp.openById(data.spreadsheetId);

  const sheet = getPhotoNumberSheet(ss);

  const values = sheet.getRange("A2:A").getValues();

  for(let i = values.length - 1; i >= 0; i--){

    if(String(values[i][0]).trim() === String(data.karteNo).trim()){

      sheet.deleteRow(i + 2);
      break;
    }
  }

  return { success:true };
}

function getStationMasterData_(stationName, year, routeName){

  const ss = SpreadsheetApp.openById(
    CONFIG.INSPECTION_LIST_MASTER_ID
  );

const sheet = ss.getSheetByName(routeName);

  if (!sheet) {
    throw new Error(
      "点検リスト_マスタ シートが見つかりません"
    );
  }

  const values = sheet.getDataRange().getValues();
  const header = values[0];

  Logger.log(JSON.stringify(header));

  const yearCol = header.findIndex(
    h => String(h).trim() === `${year}_点検日`
  );

  Logger.log("yearCol=" + yearCol);

  for (let i = 1; i < values.length; i++) {

    const row = values[i];

    if (String(row[1]).trim() === String(stationName).trim()) {

      Logger.log("駅発見");
      Logger.log("stationNo=" + row[0]);

      return {
        stationNo: String(row[0] || ""),
        firstDate: row[2] || "",
        inspectDate:
          yearCol >= 0
            ? row[yearCol] || ""
            : ""
      };
    }
  }

  Logger.log("駅が見つからない");

  return {
    stationNo: "",
    firstDate: "",
    inspectDate: ""
  };
}

function getOrCreateStationPhotoFolder_(stationYearFolder) {
  const folders = stationYearFolder.getFoldersByName("写真保存エリア");

  if (folders.hasNext()) {
    const folder = folders.next();

    while (folders.hasNext()) {
      const duplicate = folders.next();
      duplicate.setName(
        "写真保存エリア_重複_" +
        Utilities.formatDate(
          new Date(),
          Session.getScriptTimeZone(),
          "yyyyMMdd_HHmmss"
        )
      );
    }

    return folder;
  }

  return stationYearFolder.createFolder("写真保存エリア");
}
