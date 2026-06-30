// 写真カルテ番号位置図: 画像サイズ制限に対応した保存関数です。
// 既存の uploadPhotos(data) をこの内容に差し替えてください。
// doPost に以下も追加してください。
//
// case "getMapEditorData":
//   return createJsonResponse(getMapEditorData(body));

function uploadPhotos(data) {
  const ss = SpreadsheetApp.openById(data.spreadsheetId);
  const sheet =
    ss.getSheetByName("写真カルテ番号位置") ||
    ss.getSheetByName("写真カルテ番号位置図");

  if (!sheet) throw new Error("貼り付け先シートが見つかりません");
  if (!data.imageData) throw new Error("位置図画像データがありません");

  if (sheet.isSheetHidden()) {
    sheet.showSheet();
  }

  const stationNo = getMapStationNo_(data);
  if (stationNo) {
    sheet.getRange("D2").setValue(stationNo);
  }

  sheet.getImages().forEach(function(img) {
    img.remove();
  });

  const mimeType = String(data.imageMimeType || "image/jpeg");
  const fileName = String(data.imageFileName || "marked_map.jpg");
  const mapBlob = Utilities.newBlob(
    Utilities.base64Decode(data.imageData),
    mimeType,
    fileName
  );

  const mapStartColumn = 4; // D列
  const mapStartRow = 3;
  const mapEndColumn = 31; // AE列
  const mapEndRow = 34;
  const mapExtraXOffset = 0;
  const mapExtraYOffset = -12;
  const mapScale = 0.94;

  const mapImage = sheet.insertImage(mapBlob, mapStartColumn, mapStartRow);

  let targetWidth = 0;
  for (let c = mapStartColumn; c <= mapEndColumn; c++) targetWidth += sheet.getColumnWidth(c);

  let targetHeight = 0;
  for (let r = mapStartRow; r <= mapEndRow; r++) targetHeight += sheet.getRowHeight(r);

  const ratio = Math.min(
    targetWidth / mapImage.getWidth(),
    targetHeight / mapImage.getHeight()
  ) * mapScale;
  const width = mapImage.getWidth() * ratio;
  const height = mapImage.getHeight() * ratio;

  mapImage
    .setWidth(width)
    .setHeight(height)
    .setAnchorCellXOffset((targetWidth - width) / 2 + mapExtraXOffset)
    .setAnchorCellYOffset(Math.max(0, (targetHeight - height) / 2 + mapExtraYOffset));

  const hanreiFiles = DriveApp
    .getFolderById(CONFIG.HANREI_FOLDER_ID)
    .getFilesByName("凡例.png");

  if (hanreiFiles.hasNext()) {
    const hanreiImage = sheet.insertImage(hanreiFiles.next().getBlob(), 26, 28);
    hanreiImage
      .setWidth(hanreiImage.getWidth() * 0.65)
      .setHeight(hanreiImage.getHeight() * 0.65);
  }

  if (data.editorData) {
    saveMapEditorData_(ss, data.editorData);
  }

  SpreadsheetApp.flush();
  return createJsonResponse({
    success: true,
  });
}

function getMapEditorData(data) {
  const ss = SpreadsheetApp.openById(data.spreadsheetId);
  const sheet = ss.getSheetByName("_位置図編集データ");

  if (!sheet) {
    return {
      success: true,
      data: null,
    };
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return {
      success: true,
      data: null,
    };
  }

  const values = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  const json = values.map(function(row) {
    return row[0] || "";
  }).join("");

  if (!json) {
    return {
      success: true,
      data: null,
    };
  }

  return {
    success: true,
    data: JSON.parse(json),
  };
}

function saveMapEditorData_(ss, editorData) {
  const sheet = getOrCreateMapEditorDataSheet_(ss);
  const json = JSON.stringify(editorData);
  const chunkSize = 40000;
  const chunks = [];

  for (let i = 0; i < json.length; i += chunkSize) {
    chunks.push([json.slice(i, i + chunkSize)]);
  }

  sheet.clear();
  sheet.getRange("A1").setValue("json_chunks");

  if (chunks.length > 0) {
    sheet.getRange(2, 1, chunks.length, 1).setValues(chunks);
  }

  try {
    sheet.hideSheet();
  } catch (e) {
    Logger.log(e);
  }
}

function getOrCreateMapEditorDataSheet_(ss) {
  const name = "_位置図編集データ";
  const existing = ss.getSheetByName(name);
  if (existing) return existing;

  return ss.insertSheet(name);
}

function getMapStationNo_(data) {
  const stationNo = String(data.stationNo || "").trim();
  if (stationNo) return stationNo;

  if (!data.routeName || !data.station || !data.year) return "";

  try {
    const result = getInspectionListDates({
      masterSpreadsheetId: data.masterSpreadsheetId || CONFIG.INSPECTION_LIST_MASTER_ID,
      routeName: data.routeName,
      station: data.station,
      year: data.year,
    });

    return String(result.stationNo || "").trim();
  } catch (e) {
    Logger.log(e);
    return "";
  }
}
