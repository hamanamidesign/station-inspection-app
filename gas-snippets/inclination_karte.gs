// 傾斜測定カルテ用です。
// doPost などの action 分岐に以下を追加してください。
//
// case "uploadInclinationKarteSheets":
//   return createJsonResponse(uploadInclinationKarteSheets(body));
// case "uploadInclinationKartePhoto":
//   return createJsonResponse(uploadInclinationKartePhoto(body));
// case "getInclinationKarteSheets":
//   return createJsonResponse(getInclinationKarteSheets(body));

const INCLINATION_MASTER_SPREADSHEET_ID_ =
  typeof INSPECTION_LIST_MASTER_ID !== "undefined"
    ? INSPECTION_LIST_MASTER_ID
    : "14FBV3XuMWhv4DcjfjmIWSY5zY5NbxD5gp2E1rqTQPHs";

function uploadInclinationKarteSheets(data) {
  const ss = SpreadsheetApp.openById(data.spreadsheetId);
  const template = getOrCreateInclinationTemplateSheet_(ss);

  const rows = Array.isArray(data.rows)
    ? data.rows.filter(row => String(row.point || "").trim())
    : [];

  if (rows.length === 0) {
    return { success: true, sheetNames: [] };
  }

  const groups = chunk_(rows, 4);
  const sheetNames = [];

  groups.forEach(group => {
    const sheetName = sanitizeSheetName_(buildInclinationRangeLabel_(group));
    const existing = ss.getSheetByName(sheetName);
    const sheet = existing || template.copyTo(ss).setName(sheetName);
    sheet.showSheet();
    sheetNames.push(sheetName);

    clearInclinationBlocks_(sheet, group);
    writeInclinationHeader_(sheet, data, sheetName);
    writeInclinationRows_(sheet, group, data);
  });

  return { success: true, sheetNames };
}

function getOrCreateInclinationTemplateSheet_(ss) {
  const existing = ss.getSheetByName("傾斜測定カルテ_マスタ");
  if (existing) return existing;

  const masterTemplate = SpreadsheetApp
    .openById(INCLINATION_MASTER_SPREADSHEET_ID_)
    .getSheetByName("傾斜測定カルテ_マスタ");

  if (!masterTemplate) {
    throw new Error("傾斜測定カルテ_マスタ シートが見つかりません");
  }

  const template = masterTemplate.copyTo(ss).setName("傾斜測定カルテ_マスタ");
  template.hideSheet();
  return template;
}

function uploadInclinationKartePhoto(data) {
  const ss = SpreadsheetApp.openById(data.spreadsheetId);
  const sheet =
    ss.getSheetByName(data.sheetName) ||
    ss.getSheetByName(sanitizeSheetName_(data.sheetName));

  if (!sheet) {
    throw new Error(`傾斜測定カルテシートが見つかりません: ${data.sheetName}`);
  }

  if (sheet.isSheetHidden()) {
    sheet.showSheet();
  }

  const block = findInclinationBlockByPoint_(sheet, data.point);
  if (!block) {
    throw new Error(`測点が見つかりません: ${data.point}`);
  }

  const photoFolder = getOrCreateInclinationPhotoFolder_(data.folderId, data.year);
  const box = data.kind === "first" ? block.firstPhoto : block.currentPhoto;

  if (data.clear) {
    removeImagesInBox_(sheet, box);
    const fileName = data.kind === "first"
      ? `初回_${data.point}.jpg`
      : `${data.year || ""}_${data.point}.jpg`;
    trashFilesByName_(photoFolder, fileName, "");

    return {
      success: true,
      sheetName: sheet.getName(),
      point: data.point,
      kind: data.kind,
      cleared: true,
    };
  }

  const photoResult = insertInclinationPhoto_(sheet, box, data.photoFile, photoFolder);

  return {
    success: true,
    sheetName: sheet.getName(),
    point: data.point,
    kind: data.kind,
    photo: photoResult,
  };
}

function getInclinationKarteSheets(data) {
  const ss = SpreadsheetApp.openById(data.spreadsheetId);
  const photoFolder = data.folderId ? getExistingInclinationPhotoFolder_(data.folderId, data.year) : null;
  const photoUrls = photoFolder ? buildInclinationPhotoUrlMap_(photoFolder) : {};
  const rows = [];
  let header = null;

  ss.getSheets().forEach(sheet => {
    const sheetName = sheet.getName();
    if (shouldSkipInclinationSheet_(sheetName)) return;

    const rangeLabel = sheet.getRange("D1").getDisplayValue();
    const isNamedKarteSheet = sheetName.indexOf("傾斜測定カルテ") !== -1;
    const isRangeSheet = !!rangeLabel && sheetName === sanitizeSheetName_(rangeLabel);
    if (!isRangeSheet && !isNamedKarteSheet) return;

    const firstContractor = sheet.getRange("I5").getDisplayValue();
    const firstInspector = sheet.getRange("I6").getDisplayValue();
    const contractor = sheet.getRange("U5").getDisplayValue();
    const inspector = sheet.getRange("U6").getDisplayValue();

    const sheetHeader = {
      rangeLabel,
      stationNo: sheet.getRange("F1").getDisplayValue(),
      station: sheet.getRange("G1").getDisplayValue(),
      evalType: sheet.getRange("D3").getDisplayValue(),
      firstDate: sheet.getRange("F5").getDisplayValue(),
      firstContractor,
      firstInspector,
      inspectDate: sheet.getRange("P5").getDisplayValue(),
      contractor,
      inspector,
    };

    if (!header) {
      header = sheetHeader;
    } else if (firstContractor || firstInspector) {
      header = {
        ...header,
        firstContractor: firstContractor || header.firstContractor || "",
        firstInspector: firstInspector || header.firstInspector || "",
        contractor: contractor || header.contractor || "",
        inspector: inspector || header.inspector || "",
      };
    }

    INCLINATION_BLOCKS_.forEach(block => {
      const point = sheet.getRange(block.firstPoint).getDisplayValue();
      if (!point) return;

      rows.push({
        point,
        pointColor: sheet.getRange(block.firstPoint).getFontColor(),
        place: sheet.getRange(block.firstPlace).getDisplayValue(),
        firstEwDirection: sheet.getRange(block.firstEwDirection).getDisplayValue(),
        firstEwValue: sheet.getRange(block.firstEwValue).getDisplayValue(),
        firstNsDirection: sheet.getRange(block.firstNsDirection).getDisplayValue(),
        firstNsValue: sheet.getRange(block.firstNsValue).getDisplayValue(),
        currentEwDirection: sheet.getRange(block.currentEwDirection).getDisplayValue(),
        currentEwValue: sheet.getRange(block.currentEwValue).getDisplayValue(),
        currentNsDirection: sheet.getRange(block.currentNsDirection).getDisplayValue(),
        currentNsValue: sheet.getRange(block.currentNsValue).getDisplayValue(),
        photo1: photoUrls[`初回_${point}.jpg`] || "",
        photo2: photoUrls[`${data.year || ""}_${point}.jpg`] || "",
      });
    });
  });

  return { success: true, header: header || {}, rows };
}

function shouldSkipInclinationSheet_(sheetName) {
  if (!sheetName) return true;
  if (sheetName === "傾斜測定カルテ_マスタ") return true;
  if (/^\d+$/.test(sheetName)) return true;
  if (sheetName.indexOf("_マスタ") !== -1) return true;

  return [
    "現場管理台帳",
    "写真カルテ番号",
    "表紙",
    "点検結果総括表",
    "施設点検報告書",
    "写真カルテ番号位置",
    "写真カルテ番号位置図",
    "傾斜表",
    "リスト",
  ].indexOf(sheetName) !== -1;
}

const INCLINATION_BLOCKS_ = [
  {
    firstPoint: "A9", currentPoint: "G9", firstDate: "C9", firstPlace: "E9", currentDate: "H9", currentPlace: "J9",
    firstEwDirection: "C10", firstEwValue: "D10", firstNsDirection: "E10", firstNsValue: "F10",
    currentEwDirection: "H10", currentEwValue: "I10", currentNsDirection: "J10", currentNsValue: "K10",
    firstPhoto: { startRow: 11, endRow: 26, startCol: 1, endCol: 6 },
    currentPhoto: { startRow: 11, endRow: 26, startCol: 7, endCol: 11 },
  },
  {
    firstPoint: "M9", currentPoint: "S9", firstDate: "O9", firstPlace: "Q9", currentDate: "T9", currentPlace: "V9",
    firstEwDirection: "O10", firstEwValue: "P10", firstNsDirection: "Q10", firstNsValue: "R10",
    currentEwDirection: "T10", currentEwValue: "U10", currentNsDirection: "V10", currentNsValue: "W10",
    firstPhoto: { startRow: 11, endRow: 26, startCol: 13, endCol: 18 },
    currentPhoto: { startRow: 11, endRow: 26, startCol: 19, endCol: 23 },
  },
  {
    firstPoint: "A28", currentPoint: "G28", firstDate: "C28", firstPlace: "E28", currentDate: "H28", currentPlace: "J28",
    firstEwDirection: "C29", firstEwValue: "D29", firstNsDirection: "E29", firstNsValue: "F29",
    currentEwDirection: "H29", currentEwValue: "I29", currentNsDirection: "J29", currentNsValue: "K29",
    firstPhoto: { startRow: 30, endRow: 45, startCol: 1, endCol: 6 },
    currentPhoto: { startRow: 30, endRow: 45, startCol: 7, endCol: 11 },
  },
  {
    firstPoint: "M28", currentPoint: "S28", firstDate: "O28", firstPlace: "Q28", currentDate: "T28", currentPlace: "V28",
    firstEwDirection: "O29", firstEwValue: "P29", firstNsDirection: "Q29", firstNsValue: "R29",
    currentEwDirection: "T29", currentEwValue: "U29", currentNsDirection: "V29", currentNsValue: "W29",
    firstPhoto: { startRow: 30, endRow: 45, startCol: 13, endCol: 18 },
    currentPhoto: { startRow: 30, endRow: 45, startCol: 19, endCol: 23 },
  },
];

const INCLINATION_CURRENT_BG_ = "#dbeafe";

function writeInclinationHeader_(sheet, data, rangeLabel) {
  const values = [
    ["D1", rangeLabel],
    ["F1", data.stationNo || ""],
    ["G1", data.station || ""],
    ["D3", data.evalType || ""],
    ["F5", data.firstDate || ""],
    ["I5", data.firstContractor || ""],
    ["I6", data.firstInspector || ""],
    ["P5", data.inspectDate || ""],
    ["U5", data.contractor || ""],
    ["U6", data.inspector || ""],
  ];

  values.forEach(([a1, value]) => sheet.getRange(a1).setNumberFormat("@").setValue(inclinationText_(value)));
}

function writeInclinationRows_(sheet, rows, data) {
  rows.forEach((row, index) => {
    const block = INCLINATION_BLOCKS_[index];
    if (!block) return;

    writePointValue_(sheet, block.firstPoint, row);
    writePointValue_(sheet, block.currentPoint, row);
    sheet.getRange(block.currentPoint).setBackground(INCLINATION_CURRENT_BG_);
    sheet.getRange(block.firstDate).setNumberFormat("@").setValue(inclinationText_(data.firstDate));
    writeInclinationPlace_(sheet, [block.firstPlace, block.currentPlace], row.place, getInclinationCellStyle_(row, "place"));
    sheet.getRange(block.currentPlace).setBackground(INCLINATION_CURRENT_BG_);
    sheet.getRange(block.currentDate)
      .setNumberFormat("@")
      .setValue(inclinationText_(data.inspectDate))
      .setBackground(INCLINATION_CURRENT_BG_);

    writeSlopeValue_(sheet, block.firstEwDirection, row.firstEwDirection, undefined, getInclinationCellStyle_(row, "firstEwDirection"));
    writeSlopeValue_(sheet, block.firstEwValue, inclinationNumberText_(row.firstEwValue), undefined, getInclinationCellStyle_(row, "firstEwValue"), true);
    writeSlopeValue_(sheet, block.firstNsDirection, row.firstNsDirection, undefined, getInclinationCellStyle_(row, "firstNsDirection"));
    writeSlopeValue_(sheet, block.firstNsValue, inclinationNumberText_(row.firstNsValue), undefined, getInclinationCellStyle_(row, "firstNsValue"), true);
    writeSlopeValue_(sheet, block.currentEwDirection, row.currentEwDirection, undefined, getInclinationCellStyle_(row, "currentEwDirection"));
    writeSlopeValue_(sheet, block.currentEwValue, inclinationNumberText_(row.currentEwValue), inclinationNumberText_(row.firstEwValue), getInclinationCellStyle_(row, "currentEwValue"), true);
    writeSlopeValue_(sheet, block.currentNsDirection, row.currentNsDirection, undefined, getInclinationCellStyle_(row, "currentNsDirection"));
    writeSlopeValue_(sheet, block.currentNsValue, inclinationNumberText_(row.currentNsValue), inclinationNumberText_(row.firstNsValue), getInclinationCellStyle_(row, "currentNsValue"), true);

  });
}

function findInclinationBlockByPoint_(sheet, point) {
  const target = String(point || "").trim();
  return INCLINATION_BLOCKS_.find(block => {
    return (
      sheet.getRange(block.firstPoint).getDisplayValue().trim() === target ||
      sheet.getRange(block.currentPoint).getDisplayValue().trim() === target
    );
  });
}

function setSameValue_(sheet, ranges, value, style) {
  ranges.forEach(a1 => {
    const range = sheet.getRange(a1);
    range.setValue(inclinationText_(value));
    applyInclinationCellStyle_(range, style);
  });
}

function writeInclinationPlace_(sheet, ranges, value, style) {
  const text = inclinationText_(value);
  const fontSize = getInclinationPlaceFontSize_(text);

  ranges.forEach(a1 => {
    const range = sheet.getRange(a1);
    range
      .setValue(text)
      .setFontSize(fontSize)
      .setWrap(false)
      .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP)
      .setVerticalAlignment("middle");

    applyInclinationCellStyle_(range, style);
  });
}

function getInclinationPlaceFontSize_(value) {
  const length = Array.from(String(value || "").replace(/\s+/g, "")).length;

  if (length >= 16) return 3;
  if (length >= 14) return 4;
  if (length >= 12) return 5;
  if (length >= 10) return 6;
  if (length >= 8) return 7;
  if (length >= 7) return 8;
  return 9;
}

function writePointValue_(sheet, a1, row) {
  const range = sheet.getRange(a1);
  range.setValue(inclinationText_(row.point));
  range.setFontSize(10);
  applyInclinationCellStyle_(range, getInclinationCellStyle_(row, "point"));
  range.setFontColor("#000000");
}

function writeSlopeValue_(sheet, a1, value, compareValue, style, isNumberCell) {
  const range = sheet.getRange(a1);
  const text = inclinationText_(value);
  if (isNumberCell) {
    range.setNumberFormat("0.0");
    range.setValue(inclinationNumberCellValue_(text));
  } else {
    range.setValue(text);
  }

  range.setFontColor("#000000");

  if (style && style.backgroundColor) {
    range.setBackground(style.backgroundColor);
  } else if (compareValue !== undefined && inclinationText_(compareValue).trim() !== text.trim()) {
    range.setBackground("#d1d5db");
  } else {
    range.setBackground("#ffffff");
  }
}

function inclinationText_(value) {
  return value === null || value === undefined ? "" : String(value);
}

function inclinationNumberText_(value) {
  const text = inclinationText_(value).trim();
  if (text === "") return "";

  const number = Number(text);
  return Number.isFinite(number) ? number.toFixed(1) : text;
}

function inclinationNumberCellValue_(value) {
  const text = inclinationText_(value).trim();
  if (text === "") return "";

  const number = Number(text);
  return Number.isFinite(number) ? number : text;
}

function getInclinationCellStyle_(row, field) {
  return row.cellStyles && row.cellStyles[field] ? row.cellStyles[field] : {};
}

function applyInclinationCellStyle_(range, style) {
  if (!style) return;
  range.setFontColor("#000000");
  if (style.backgroundColor) range.setBackground(style.backgroundColor);
}

function insertInclinationPhoto_(sheet, box, photoFile, folder) {
  if (!photoFile || (!photoFile.base64 && !photoFile.fileId)) return;

  const fileName = photoFile.fileName || "傾斜写真.jpg";

  removeImagesInBox_(sheet, box);

  const image = photoFile.base64
    ? insertInclinationBase64Photo_(sheet, box, photoFile, folder, fileName)
    : insertInclinationDrivePhoto_(sheet, box, photoFile.fileId, folder, fileName);

  fitImageToBox_(sheet, image, box);

  return {
    fileName,
    fileId: photoFile.fileId || "",
    width: image.getWidth(),
    height: image.getHeight(),
    anchor: image.getAnchorCell().getA1Notation(),
  };
}

function insertInclinationBase64Photo_(sheet, box, photoFile, folder, fileName) {
  const blob = Utilities.newBlob(
    Utilities.base64Decode(photoFile.base64),
    "image/jpeg",
    fileName
  );

  trashFilesByName_(folder, fileName, "");
  const file = folder.createFile(blob);

  return sheet.insertImage(file.getBlob(), box.startCol, box.startRow);
}

function insertInclinationDrivePhoto_(sheet, box, fileId, folder, fileName) {
  const sourceFile = DriveApp.getFileById(fileId);
  const blob = sourceFile.getBlob().setName(fileName);

  trashFilesByName_(folder, fileName, "");
  const savedFile = folder.createFile(blob);

  return sheet.insertImage(savedFile.getBlob(), box.startCol, box.startRow);
}

function clearInclinationBlocks_(sheet, rows) {
  INCLINATION_BLOCKS_.forEach((block, index) => {
    const nextPoint = rows[index] ? inclinationText_(rows[index].point).trim() : "";
    const currentPoint = sheet.getRange(block.firstPoint).getDisplayValue().trim();

    if (!nextPoint || (currentPoint && currentPoint !== nextPoint)) {
      removeImagesInBox_(sheet, block.firstPhoto);
      removeImagesInBox_(sheet, block.currentPhoto);
    }

    [
      block.firstPoint,
      block.currentPoint,
      block.firstDate,
      block.firstPlace,
      block.currentDate,
      block.currentPlace,
      block.firstEwDirection,
      block.firstEwValue,
      block.firstNsDirection,
      block.firstNsValue,
      block.currentEwDirection,
      block.currentEwValue,
      block.currentNsDirection,
      block.currentNsValue,
    ].forEach(a1 => {
      sheet.getRange(a1)
        .clearContent()
        .setFontColor("#000000")
        .setBackground("#ffffff")
        .setFontSize(9)
        .setWrap(false)
        .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
    });
  });
}

function removeImagesInBox_(sheet, box) {
  sheet.getImages().forEach(image => {
    const cell = image.getAnchorCell();
    const row = cell.getRow();
    const col = cell.getColumn();
    if (row >= box.startRow && row <= box.endRow && col >= box.startCol && col <= box.endCol) {
      image.remove();
    }
  });
}

function fitImageToBox_(sheet, image, box) {
  const padding = 8;

  const boxWidth = rangeWidthPx_(sheet, box.startCol, box.endCol) - padding * 2;
  const boxHeight = rangeHeightPx_(sheet, box.startRow, box.endRow) - padding * 2;

  const originalWidth = image.getWidth();
  const originalHeight = image.getHeight();
  const scale = Math.min(boxWidth / originalWidth, boxHeight / originalHeight);

  image.setWidth(Math.floor(originalWidth * scale));
  image.setHeight(Math.floor(originalHeight * scale));

  image.setAnchorCell(sheet.getRange(box.startRow, box.startCol));
  image.setAnchorCellXOffset(padding);
  image.setAnchorCellYOffset(padding);
}

function rangeWidthPx_(sheet, startCol, endCol) {
  let width = 0;
  for (let col = startCol; col <= endCol; col++) width += sheet.getColumnWidth(col);
  return width;
}

function rangeHeightPx_(sheet, startRow, endRow) {
  let height = 0;
  for (let row = startRow; row <= endRow; row++) height += sheet.getRowHeight(row);
  return height;
}

function getOrCreateInclinationPhotoFolder_(stationFolderId, year) {
  const stationFolder = DriveApp.getFolderById(stationFolderId);
  const photoRoot = findChildFolderByPattern_(stationFolder, /写真|photo/i) || stationFolder;
  return getOrCreateChildFolder_(photoRoot, `${year || ""}_傾斜`);
}

function getExistingInclinationPhotoFolder_(stationFolderId, year) {
  try {
    const stationFolder = DriveApp.getFolderById(stationFolderId);
    const photoRoot = findChildFolderByPattern_(stationFolder, /写真|photo/i) || stationFolder;
    const folders = photoRoot.getFoldersByName(`${year || ""}_傾斜`);
    return folders.hasNext() ? folders.next() : null;
  } catch (e) {
    return null;
  }
}

function findChildFolderByPattern_(parent, pattern) {
  const folders = parent.getFolders();
  while (folders.hasNext()) {
    const folder = folders.next();
    if (pattern.test(folder.getName())) return folder;
  }
  return null;
}

function getOrCreateChildFolder_(parent, name) {
  const folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}

function trashAllFilesInFolder_(folder) {
  const files = folder.getFiles();
  while (files.hasNext()) {
    files.next().setTrashed(true);
  }
}

function trashFilesByName_(folder, fileName, exceptFileId) {
  const files = folder.getFilesByName(fileName);
  while (files.hasNext()) {
    const file = files.next();
    if (exceptFileId && file.getId() === exceptFileId) continue;
    file.setTrashed(true);
  }
}

function findInclinationPhotoUrl_(folder, fileName) {
  const files = folder.getFilesByName(fileName);
  if (!files.hasNext()) return "";
  const file = files.next();
  return `https://drive.google.com/thumbnail?id=${file.getId()}&sz=w900`;
}

function buildInclinationPhotoUrlMap_(folder) {
  const result = {};
  const files = folder.getFiles();

  while (files.hasNext()) {
    const file = files.next();
    result[file.getName()] =
      `https://drive.google.com/thumbnail?id=${file.getId()}&sz=w900`;
  }

  return result;
}

function buildInclinationRangeLabel_(rows) {
  const points = rows.map(row => String(row.point || "").trim()).filter(Boolean);
  if (points.length === 0) return "";
  if (points.length === 1) return points[0];
  if (points.length === 2) return `${points[0]},${points[1]}`;
  if (points.length === 3) return `${points[0]}-${points[2]}`;
  return `${points[0]}-${points[3]}`;
}

function chunk_(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function sanitizeSheetName_(name) {
  return String(name || "傾斜")
    .replace(/[\\/?*\[\]:]/g, "_")
    .slice(0, 99);
}
