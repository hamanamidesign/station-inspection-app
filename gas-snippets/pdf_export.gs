// PDF作成用です。
// コード.gs の doPost(e) 内の switch (action) に、以下を追加して再デプロイしてください。
// case "getPdfSheetOptions":
//   return createJsonResponse(getPdfSheetOptions(body));
// case "createInspectionPdf":
//   return createJsonResponse(createInspectionPdf(body));
// case "startInspectionPdfMerge":
//   return createJsonResponse(startInspectionPdfMerge(body));
// case "getInspectionPdfMergeStatus":
//   return createJsonResponse(getInspectionPdfMergeStatus(body));
// case "findCompletedInspectionPdf":
//   return createJsonResponse(findCompletedInspectionPdf(body));
// case "findCompletedInspectionPdfFile":
//   return createJsonResponse(findCompletedInspectionPdfFile(body));
// case "startAdobeInspectionPdfMerge":
//   return createJsonResponse(startAdobeInspectionPdfMerge(body));
// case "getAdobeInspectionPdfMergeStatus":
//   return createJsonResponse(getAdobeInspectionPdfMergeStatus(body));
//
// Adobe無料APIを使う場合は、GASの「プロジェクトの設定」>「スクリプト プロパティ」に
// ADOBE_PDF_SERVICES_CLIENT_ID と ADOBE_PDF_SERVICES_CLIENT_SECRET を設定してください。
//
// PDF結合には、GASプロジェクトへPDFAppライブラリを追加してください。
// Script ID: 1Xmtr5XXEakVql7N6FqwdCNdpdijsJOxgqH173JSB0UOwdb0GJYJbnJLk

const INSPECTION_PDF_MARGIN_TOP_INCHES_ = 2.5 / 2.54;
const INSPECTION_PDF_MARGIN_BOTTOM_INCHES_ = 2.0 / 2.54;
const INSPECTION_PDF_MARGIN_LEFT_INCHES_ = 1.7 / 2.54;
const INSPECTION_PDF_MARGIN_RIGHT_INCHES_ = 1.7 / 2.54;

function getPdfSheetOptions(data) {
  const ss = SpreadsheetApp.openById(data.spreadsheetId);
  const sheets = ss.getSheets();

  const groups = {
    cover: [],
    photo: [],
    photoPositionMap: [],
    inspectionSummary: [],
    slope: [],
    inclination: [],
    inspectionReport: [],
  };
  let hasInspectionReportPdfPages = false;
  let hasInspectionSummaryPdfPages = false;

  sheets.forEach(sheet => {
    const name = sheet.getName();
    const normalizedName = String(name || "").trim();

    if (/^施設点検報告書_\d+$/.test(normalizedName)) {
      hasInspectionReportPdfPages = true;
      return;
    }

    if (/^点検結果総括表_\d+$/.test(normalizedName)) {
      hasInspectionSummaryPdfPages = true;
      return;
    }

    if (normalizedName === "表紙") {
      groups.cover.push({ name: name, label: normalizedName, group: "cover" });
      return;
    }

    if (/^\d+$/.test(normalizedName)) {
      groups.photo.push({ name: name, label: normalizedName, group: "photo" });
      return;
    }

    if (isPhotoPositionMapPdfSheetName_(normalizedName)) {
      groups.photoPositionMap.push({ name: name, label: normalizedName, group: "photoPositionMap" });
      return;
    }

    if (isSlopeTablePdfSheetName_(normalizedName)) {
      groups.slope.push({ name: name, label: normalizedName, group: "slope" });
      return;
    }

    if (isInclinationPdfSheetName_(normalizedName)) {
      groups.inclination.push({ name: name, label: normalizedName, group: "inclination" });
      return;
    }
  });

  groups.photo.sort((a, b) => Number(a.name) - Number(b.name));
  groups.slope.sort((a, b) => getSlopeTablePdfPageNumber_(a.name) - getSlopeTablePdfPageNumber_(b.name));
  groups.inclination.sort((a, b) => a.name.localeCompare(b.name, "ja", { numeric: true }));
  if (hasInspectionReportPdfPages) {
    groups.inspectionReport.push({ name: "施設点検報告書", label: "施設点検報告書", group: "inspectionReport" });
  }
  if (hasInspectionSummaryPdfPages) {
    groups.inspectionSummary.push({ name: "点検結果総括表", label: "点検結果総括表", group: "inspectionSummary" });
  }

  return {
    success: true,
    groups: groups,
  };
}

function createInspectionPdf(data) {
  const sheetNames = Array.isArray(data.sheetNames)
    ? data.sheetNames.map(name => String(name || "")).filter(Boolean)
    : [];

  if (sheetNames.length === 0) {
    throw new Error("PDF化するシートが選択されていません");
  }

  if (data.pdfKind === "inspectionReport" || (sheetNames.length === 1 && sheetNames[0] === "施設点検報告書")) {
    return createInspectionReportPdf_(data);
  }

  if (data.pdfKind === "inspectionSummary" || (sheetNames.length === 1 && sheetNames[0] === "点検結果総括表")) {
    return createInspectionSummaryPdf_(data);
  }

  return createGenericInspectionPdf_(data, sheetNames);
}

const INSPECTION_PDF_MERGE_JOB_PREFIX_ = "inspectionPdfMergeJob:";
const INSPECTION_PDF_MERGE_TRIGGER_HANDLER_ = "runPendingInspectionPdfMerges";
const INSPECTION_PDF_MERGE_ORDER_ = [
  "表紙",
  "写真カルテ番号位置図",
  "点検結果総括表",
  "施設点検報告書",
  "写真カルテ",
  "傾斜表",
  "傾斜測定カルテ",
];
const ADOBE_PDF_MERGE_JOB_PREFIX_ = "adobeInspectionPdfMergeJob:";
const ADOBE_PDF_SERVICES_BASE_URL_ = "https://pdf-services.adobe.io";
const ADOBE_PDF_MERGE_MAX_FILES_ = 20;
const ADOBE_PDF_MERGE_MAX_TOTAL_BYTES_ = 45 * 1024 * 1024;

function startAdobeInspectionPdfMerge(data) {
  const spreadsheetId = String(data.spreadsheetId || "").trim();
  const stationName = String(data.stationName || "").trim();
  const year = String(data.year || "").trim();
  const requestedJobId = String(data.jobId || "").trim();

  if (!spreadsheetId) throw new Error("スプレッドシートIDがありません");
  if (!stationName) throw new Error("駅名がありません");
  if (!year) throw new Error("年度がありません");

  getAdobePdfServicesCredentials_();

  if (requestedJobId) {
    const existingJob = loadAdobeInspectionPdfMergeJob_(requestedJobId);
    if (existingJob) return buildAdobeInspectionPdfMergeResponse_(existingJob);
  }

  const folder = getInspectionPdfFolder_(spreadsheetId, data.folderId);
  const pdfFiles = [];
  const missing = [];
  const mergeOrder = getInspectionPdfMergeOrder_(data);

  mergeOrder.forEach(suffix => {
    const foundFiles = getInspectionPdfFilesForMerge_(folder, {
      stationName: stationName,
      year: year,
    }, suffix);

    if (foundFiles.length === 0) {
      missing.push(suffix);
      return;
    }

    foundFiles.forEach(item => pdfFiles.push(item));
  });

  if (missing.length > 0) {
    throw new Error(
      "すべてのファイルがありません。" +
      missing.map(name => name + "のPDFが未作成です").join("、")
    );
  }

  if (pdfFiles.length > ADOBE_PDF_MERGE_MAX_FILES_) {
    throw new Error(
      "Adobe無料APIで一度に結合できるPDFは20ファイルまでです。現在: " +
      pdfFiles.length +
      "ファイル"
    );
  }

  let totalBytes = 0;
  pdfFiles.forEach(item => {
    const file = DriveApp.getFileById(item.fileId);
    item.size = file.getSize();
    totalBytes += item.size;
  });

  if (totalBytes > ADOBE_PDF_MERGE_MAX_TOTAL_BYTES_) {
    throw new Error(
      "結合元PDFの合計が45MBを超えています（現在: " +
      formatAdobePdfBytes_(totalBytes) +
      "）。Acrobatで高速結合をご利用ください"
    );
  }

  const job = {
    jobId: requestedJobId || Utilities.getUuid(),
    status: "starting",
    createdAt: new Date().toISOString(),
    folderId: folder.getId(),
    outputFileName: buildInspectionPdfFileName_({
      stationName: stationName,
      year: year,
    }, "報告書") + ".pdf",
    files: pdfFiles,
    totalBytes: totalBytes,
    message: "AdobeへPDFを送信しています",
  };

  saveAdobeInspectionPdfMergeJob_(job);

  try {
    const token = getAdobePdfServicesAccessToken_();
    const assets = job.files.map(item => ({
      assetID: uploadAdobePdfAsset_(DriveApp.getFileById(item.fileId).getBlob(), token),
    }));
    const statusUrl = submitAdobePdfCombineJob_(assets, token);

    job.status = "processing";
    job.statusUrl = statusUrl;
    job.message = "AdobeでPDFを結合しています";
    job.submittedAt = new Date().toISOString();
    saveAdobeInspectionPdfMergeJob_(job);
    return buildAdobeInspectionPdfMergeResponse_(job);
  } catch (error) {
    job.status = "failed";
    job.message = error instanceof Error ? error.message : String(error);
    job.completedAt = new Date().toISOString();
    saveAdobeInspectionPdfMergeJob_(job);
    throw error;
  }
}

function getAdobeInspectionPdfMergeStatus(data) {
  const jobId = String(data.jobId || "").trim();
  if (!jobId) throw new Error("Adobe PDF結合ジョブIDがありません");

  const job = loadAdobeInspectionPdfMergeJob_(jobId);
  if (!job) throw new Error("Adobe PDF結合の処理状況が見つかりません");
  if (job.status !== "processing") {
    return buildAdobeInspectionPdfMergeResponse_(job);
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    return buildAdobeInspectionPdfMergeResponse_(job);
  }

  try {
    const token = getAdobePdfServicesAccessToken_();
    const response = fetchAdobePdfServices_(job.statusUrl, {
      method: "get",
      headers: buildAdobePdfServicesHeaders_(token),
    }, [200]);
    const result = parseAdobePdfJson_(response, "Adobe PDF結合状況");
    const adobeStatus = String(result.status || "").toLowerCase();

    if (adobeStatus === "in progress" || adobeStatus === "in_progress") {
      job.message = "AdobeでPDFを結合しています";
      saveAdobeInspectionPdfMergeJob_(job);
      return buildAdobeInspectionPdfMergeResponse_(job);
    }

    if (adobeStatus === "failed") {
      job.status = "failed";
      job.message = getAdobePdfErrorMessage_(result) || "AdobeでPDF結合に失敗しました";
      job.completedAt = new Date().toISOString();
      saveAdobeInspectionPdfMergeJob_(job);
      return buildAdobeInspectionPdfMergeResponse_(job);
    }

    if (adobeStatus !== "done") {
      throw new Error("Adobe PDF結合の状態を確認できませんでした: " + (result.status || "不明"));
    }

    const downloadUri = getAdobePdfDownloadUri_(result);
    if (!downloadUri) throw new Error("Adobeの完成PDFダウンロードURLがありません");

    const downloadResponse = fetchAdobePdfServices_(downloadUri, {
      method: "get",
    }, [200]);
    const mergedBlob = downloadResponse.getBlob()
      .setContentType(MimeType.PDF)
      .setName(job.outputFileName);
    const folder = DriveApp.getFolderById(job.folderId);
    const file = overwriteOrCreatePdfFile_(folder, mergedBlob);

    job.status = "completed";
    job.message = "すべての資料をAdobeで結合しました";
    job.fileName = file.getName();
    job.url = file.getUrl();
    job.completedAt = new Date().toISOString();
    saveAdobeInspectionPdfMergeJob_(job);
    return buildAdobeInspectionPdfMergeResponse_(job);
  } catch (error) {
    job.status = "failed";
    job.message = error instanceof Error ? error.message : String(error);
    job.completedAt = new Date().toISOString();
    saveAdobeInspectionPdfMergeJob_(job);
    return buildAdobeInspectionPdfMergeResponse_(job);
  } finally {
    lock.releaseLock();
  }
}

function getAdobePdfServicesCredentials_() {
  const properties = PropertiesService.getScriptProperties();
  const clientId = String(properties.getProperty("ADOBE_PDF_SERVICES_CLIENT_ID") || "").trim();
  const clientSecret = String(properties.getProperty("ADOBE_PDF_SERVICES_CLIENT_SECRET") || "").trim();

  if (!clientId || !clientSecret) {
    throw new Error(
      "Adobe PDF Servicesの認証情報が未設定です。GASのスクリプトプロパティに" +
      "ADOBE_PDF_SERVICES_CLIENT_ID と ADOBE_PDF_SERVICES_CLIENT_SECRET を設定してください"
    );
  }

  return { clientId: clientId, clientSecret: clientSecret };
}

function getAdobePdfServicesAccessToken_() {
  const cache = CacheService.getScriptCache();
  const cachedToken = cache.get("adobePdfServicesAccessToken");
  if (cachedToken) return cachedToken;

  const credentials = getAdobePdfServicesCredentials_();
  const response = fetchAdobePdfServices_(ADOBE_PDF_SERVICES_BASE_URL_ + "/token", {
    method: "post",
    contentType: "application/x-www-form-urlencoded",
    payload:
      "client_id=" + encodeURIComponent(credentials.clientId) +
      "&client_secret=" + encodeURIComponent(credentials.clientSecret),
  }, [200]);
  const result = parseAdobePdfJson_(response, "Adobe認証");
  const token = String(result.access_token || "");
  if (!token) throw new Error("Adobeのアクセストークンを取得できませんでした");

  const expiresIn = Number(result.expires_in || 21600);
  cache.put("adobePdfServicesAccessToken", token, Math.max(60, Math.min(21600, expiresIn - 120)));
  return token;
}

function uploadAdobePdfAsset_(blob, token) {
  const response = fetchAdobePdfServices_(ADOBE_PDF_SERVICES_BASE_URL_ + "/assets", {
    method: "post",
    contentType: "application/json",
    headers: buildAdobePdfServicesHeaders_(token),
    payload: JSON.stringify({ mediaType: "application/pdf" }),
  }, [200]);
  const result = parseAdobePdfJson_(response, "Adobeアップロード準備");
  const uploadUri = String(result.uploadUri || "");
  const assetId = String(result.assetID || "");
  if (!uploadUri || !assetId) throw new Error("AdobeのPDFアップロード先を取得できませんでした");

  fetchAdobePdfServices_(uploadUri, {
    method: "put",
    contentType: "application/pdf",
    payload: blob.getBytes(),
  }, [200, 201]);
  return assetId;
}

function submitAdobePdfCombineJob_(assets, token) {
  const response = fetchAdobePdfServices_(ADOBE_PDF_SERVICES_BASE_URL_ + "/operation/combinepdf", {
    method: "post",
    contentType: "application/json",
    headers: buildAdobePdfServicesHeaders_(token),
    payload: JSON.stringify({ assets: assets }),
  }, [201, 202]);
  const headers = response.getAllHeaders();
  const location = String(headers.Location || headers.location || "");
  if (!location) throw new Error("Adobe PDF結合の状態確認URLがありません");
  return location;
}

function buildAdobePdfServicesHeaders_(token) {
  const credentials = getAdobePdfServicesCredentials_();
  return {
    Authorization: "Bearer " + token,
    "x-api-key": credentials.clientId,
  };
}

function fetchAdobePdfServices_(url, options, expectedStatusCodes) {
  const requestOptions = Object.assign({}, options || {}, { muteHttpExceptions: true });
  const response = UrlFetchApp.fetch(url, requestOptions);
  const statusCode = response.getResponseCode();

  if (expectedStatusCodes.indexOf(statusCode) === -1) {
    throw new Error(
      "Adobe PDF Services APIエラー: HTTP " +
      statusCode +
      " " +
      response.getContentText().slice(0, 500)
    );
  }

  return response;
}

function parseAdobePdfJson_(response, label) {
  try {
    return JSON.parse(response.getContentText() || "{}");
  } catch (error) {
    throw new Error(label + "の応答を読み取れませんでした");
  }
}

function getAdobePdfDownloadUri_(result) {
  const asset = result && result.asset ? result.asset : {};
  return String(
    result.downloadUri ||
    result.dowloadUri ||
    asset.downloadUri ||
    asset.dowloadUri ||
    ""
  );
}

function getAdobePdfErrorMessage_(result) {
  if (!result) return "";
  if (typeof result.error === "string") return result.error;
  if (result.error && result.error.message) return String(result.error.message);
  if (result.message) return String(result.message);
  return "";
}

function saveAdobeInspectionPdfMergeJob_(job) {
  PropertiesService.getScriptProperties().setProperty(
    ADOBE_PDF_MERGE_JOB_PREFIX_ + job.jobId,
    JSON.stringify(job)
  );
}

function loadAdobeInspectionPdfMergeJob_(jobId) {
  const value = PropertiesService.getScriptProperties().getProperty(
    ADOBE_PDF_MERGE_JOB_PREFIX_ + jobId
  );
  return value ? JSON.parse(value) : null;
}

function buildAdobeInspectionPdfMergeResponse_(job) {
  return {
    success: true,
    jobId: job.jobId,
    status: job.status,
    message: job.message || "",
    fileName: job.fileName || "",
    url: job.url || "",
    fileCount: Array.isArray(job.files) ? job.files.length : 0,
    totalBytes: Number(job.totalBytes || 0),
  };
}

function formatAdobePdfBytes_(bytes) {
  return (Number(bytes || 0) / 1024 / 1024).toFixed(1) + "MB";
}

// PDF結合機能を初めて導入したときに、GASエディタから1回実行してください。
// appsscript.jsonでoauthScopesを明示している場合は、script.scriptappも追加が必要です。
function authorizeInspectionPdfMerge() {
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, [
    "https://www.googleapis.com/auth/script.scriptapp",
  ]);
  ScriptApp.getProjectTriggers();
  return "PDF結合用トリガーの権限を確認しました";
}

function startInspectionPdfMerge(data) {
  const spreadsheetId = String(data.spreadsheetId || "").trim();
  const stationName = String(data.stationName || "").trim();
  const year = String(data.year || "").trim();

  if (!spreadsheetId) throw new Error("スプレッドシートIDがありません");
  if (!stationName) throw new Error("駅名がありません");
  if (!year) throw new Error("年度がありません");

  const folder = getInspectionPdfFolder_(spreadsheetId, data.folderId);
  const pdfFiles = [];
  const missing = [];
  const mergeOrder = getInspectionPdfMergeOrder_(data);

  mergeOrder.forEach(suffix => {
    const foundFiles = getInspectionPdfFilesForMerge_(folder, {
      stationName: stationName,
      year: year,
    }, suffix);

    if (foundFiles.length === 0) {
      missing.push(suffix);
      return;
    }

    foundFiles.forEach(item => pdfFiles.push(item));
  });

  if (missing.length > 0) {
    throw new Error(
      "すべてのファイルがありません。" +
      missing.map(name => name + "のPDFが未作成です").join("、")
    );
  }

  const jobId = Utilities.getUuid();
  const job = {
    jobId: jobId,
    status: "pending",
    createdAt: new Date().toISOString(),
    folderId: folder.getId(),
    outputFileName: buildInspectionPdfFileName_({
      stationName: stationName,
      year: year,
    }, "報告書") + ".pdf",
    previousOutputFileIds: getFileIdsByName_(
      folder,
      buildInspectionPdfFileName_({
        stationName: stationName,
        year: year,
      }, "報告書") + ".pdf"
    ),
    files: pdfFiles,
  };

  saveInspectionPdfMergeJob_(job);
  ensureInspectionPdfMergeTrigger_();

  return {
    success: true,
    jobId: jobId,
    status: job.status,
    createdAt: job.createdAt,
    previousOutputFileIds: job.previousOutputFileIds,
    message: "PDF結合を開始しました",
  };
}

function getInspectionPdfMergeOrder_(data) {
  const allowed = {};
  INSPECTION_PDF_MERGE_ORDER_.forEach(suffix => {
    allowed[suffix] = true;
  });

  const requested = Array.isArray(data.mergeOrder)
    ? data.mergeOrder.map(suffix => String(suffix || "").trim()).filter(suffix => allowed[suffix])
    : [];

  if (requested.length === 0) {
    return INSPECTION_PDF_MERGE_ORDER_.slice();
  }

  return requested.filter((suffix, index) => requested.indexOf(suffix) === index);
}

function getInspectionPdfFilesForMerge_(folder, data, suffix) {
  if (suffix === "写真カルテ") {
    return getInspectionPhotoPdfFilesForMerge_(folder, data);
  }

  const fileName = buildInspectionPdfFileName_(data, suffix) + ".pdf";
  const files = folder.getFilesByName(fileName);

  if (!files.hasNext()) return [];

  const file = files.next();
  if (file.getMimeType() !== MimeType.PDF) return [];

  return [{
    suffix: suffix,
    fileName: fileName,
    fileId: file.getId(),
  }];
}

function getInspectionPhotoPdfFilesForMerge_(folder, data) {
  const baseFileName = buildInspectionPdfFileName_(data, "写真カルテ") + ".pdf";
  const baseFiles = folder.getFilesByName(baseFileName);
  const result = [];

  if (baseFiles.hasNext()) {
    const file = baseFiles.next();
    if (file.getMimeType() === MimeType.PDF) {
      result.push({
        suffix: "写真カルテ",
        fileName: file.getName(),
        fileId: file.getId(),
        sortKey: 0,
      });
    }
  }

  const prefix = buildInspectionPdfFileName_(data, "写真カルテ_");
  const allFiles = folder.getFiles();

  while (allFiles.hasNext()) {
    const file = allFiles.next();
    const name = file.getName();
    if (file.getMimeType() !== MimeType.PDF) continue;
    if (name.indexOf(prefix) !== 0 || !/\.pdf$/i.test(name)) continue;

    result.push({
      suffix: "写真カルテ",
      fileName: name,
      fileId: file.getId(),
      sortKey: getInspectionPhotoPdfSortKey_(name),
    });
  }

  return result
    .sort((a, b) => a.sortKey - b.sortKey || String(a.fileName).localeCompare(String(b.fileName), "ja", { numeric: true }))
    .map(item => ({
      suffix: item.suffix,
      fileName: item.fileName,
      fileId: item.fileId,
    }));
}

function getInspectionPhotoPdfSortKey_(fileName) {
  const match = String(fileName || "").match(/写真カルテ_(\d+)(?:-\d+)?\.pdf$/);
  return match ? Number(match[1]) : 999999;
}

function getInspectionPdfMergeStatus(data) {
  const jobId = String(data.jobId || "").trim();
  if (!jobId) throw new Error("PDF結合ジョブIDがありません");

  const job = loadInspectionPdfMergeJob_(jobId);
  if (!job) throw new Error("PDF結合の処理状況が見つかりません");
  reconcileInspectionPdfMergeJob_(job);

  return {
    success: true,
    jobId: job.jobId,
    status: job.status,
    message: job.message || "",
    fileName: job.fileName || "",
    url: job.url || "",
  };
}

function findCompletedInspectionPdf(data) {
  const spreadsheetId = String(data.spreadsheetId || "").trim();
  const stationName = String(data.stationName || "").trim();
  const year = String(data.year || "").trim();
  const startedAt = String(data.startedAt || "").trim();

  if (!spreadsheetId || !stationName || !year) {
    throw new Error("完成PDFの確認条件が不足しています");
  }

  const folder = getInspectionPdfFolder_(spreadsheetId, data.folderId);
  const fileName = buildInspectionPdfFileName_({
    stationName: stationName,
    year: year,
  }, "報告書") + ".pdf";
  const files = folder.getFilesByName(fileName);
  const startedTime = startedAt ? new Date(startedAt).getTime() : 0;

  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType() !== MimeType.PDF) continue;
    if (startedTime && file.getLastUpdated().getTime() < startedTime - 5000) continue;

    return {
      success: true,
      completed: true,
      fileName: file.getName(),
      url: file.getUrl(),
    };
  }

  return {
    success: true,
    completed: false,
  };
}

function findCompletedInspectionPdfFile(data) {
  const spreadsheetId = String(data.spreadsheetId || "").trim();
  const stationName = String(data.stationName || "").trim();
  const year = String(data.year || "").trim();
  const fileSuffix = String(data.fileSuffix || "").trim();
  const startedAt = String(data.startedAt || "").trim();

  if (!spreadsheetId || !stationName || !year || !fileSuffix) {
    throw new Error("完成PDFの確認条件が不足しています");
  }

  const folder = getInspectionPdfFolder_(spreadsheetId, data.folderId);
  const fileName = buildInspectionPdfFileName_({
    stationName: stationName,
    year: year,
  }, fileSuffix) + ".pdf";
  const files = folder.getFilesByName(fileName);
  const startedTime = startedAt ? new Date(startedAt).getTime() : 0;
  let latestFile = null;

  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType() !== MimeType.PDF) continue;
    if (startedTime && file.getLastUpdated().getTime() < startedTime - 5000) continue;
    if (!latestFile || file.getLastUpdated().getTime() > latestFile.getLastUpdated().getTime()) {
      latestFile = file;
    }
  }

  if (!latestFile) {
    return {
      success: true,
      completed: false,
      fileName: fileName,
    };
  }

  return {
    success: true,
    completed: true,
    fileName: latestFile.getName(),
    url: latestFile.getUrl(),
  };
}

function reconcileInspectionPdfMergeJob_(job) {
  if (job.status !== "pending" && job.status !== "processing") return;
  if (!job.folderId || !job.outputFileName) return;

  const folder = DriveApp.getFolderById(job.folderId);
  const files = folder.getFilesByName(job.outputFileName);
  let file = null;

  while (files.hasNext()) {
    const candidate = files.next();
    if (candidate.getMimeType() !== MimeType.PDF) continue;
    const startedTime = job.createdAt ? new Date(job.createdAt).getTime() : 0;
    if (startedTime && candidate.getLastUpdated().getTime() < startedTime - 5000) continue;
    file = candidate;
    break;
  }

  if (!file) return;

  job.status = "completed";
  job.message = "すべての資料を結合しました";
  job.fileName = file.getName();
  job.url = file.getUrl();
  job.completedAt = job.completedAt || new Date().toISOString();
  saveInspectionPdfMergeJob_(job);
}

function runPendingInspectionPdfMerges() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  let job = null;

  try {
    const properties = PropertiesService.getScriptProperties().getProperties();
    const pendingJobs = Object.keys(properties)
      .filter(key => key.indexOf(INSPECTION_PDF_MERGE_JOB_PREFIX_) === 0)
      .map(key => JSON.parse(properties[key]))
      .filter(job => job && job.status === "pending")
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

    if (pendingJobs.length === 0) {
      deleteInspectionPdfMergeTriggers_();
      lock.releaseLock();
      return;
    }

    job = pendingJobs[0];
    job.status = "processing";
    job.message = "PDFを結合しています";
    saveInspectionPdfMergeJob_(job);

    const pdfBlobs = job.files.map(item => DriveApp.getFileById(item.fileId).getBlob());

    return PDFApp.mergePDFs(pdfBlobs)
      .then(mergedBlob => {
        const folder = DriveApp.getFolderById(job.folderId);
        const file = overwriteOrCreatePdfFile_(
          folder,
          mergedBlob.setName(job.outputFileName)
        );

        job.status = "completed";
        job.message = "すべての資料を結合しました";
        job.fileName = file.getName();
        job.url = file.getUrl();
        job.completedAt = new Date().toISOString();
        saveInspectionPdfMergeJob_(job);
        scheduleNextInspectionPdfMerge_();
      })
      .catch(error => {
        job.status = "failed";
        job.message = error instanceof Error ? error.message : String(error);
        job.completedAt = new Date().toISOString();
        saveInspectionPdfMergeJob_(job);
        scheduleNextInspectionPdfMerge_();
      })
      .finally(() => {
        lock.releaseLock();
      });
  } catch (error) {
    if (job) {
      job.status = "failed";
      job.message = error instanceof Error ? error.message : String(error);
      job.completedAt = new Date().toISOString();
      saveInspectionPdfMergeJob_(job);
    }
    scheduleNextInspectionPdfMerge_();
    lock.releaseLock();
  }
}

function getInspectionPdfFolder_(spreadsheetId, folderId) {
  const explicitFolderId = String(folderId || "").trim();
  if (explicitFolderId) {
    return DriveApp.getFolderById(explicitFolderId);
  }

  const spreadsheetFile = DriveApp.getFileById(spreadsheetId);
  const parents = spreadsheetFile.getParents();
  if (!parents.hasNext()) {
    throw new Error("PDF保存先フォルダが見つかりません。駅を選び直してからPDF作成を実行してください。");
  }
  return parents.next();
}

function getFileIdsByName_(folder, fileName) {
  const ids = [];
  const files = folder.getFilesByName(fileName);
  while (files.hasNext()) {
    ids.push(files.next().getId());
  }
  return ids;
}

function saveInspectionPdfMergeJob_(job) {
  PropertiesService.getScriptProperties().setProperty(
    INSPECTION_PDF_MERGE_JOB_PREFIX_ + job.jobId,
    JSON.stringify(job)
  );
}

function loadInspectionPdfMergeJob_(jobId) {
  const value = PropertiesService.getScriptProperties().getProperty(
    INSPECTION_PDF_MERGE_JOB_PREFIX_ + jobId
  );
  return value ? JSON.parse(value) : null;
}

function ensureInspectionPdfMergeTrigger_() {
  let triggers;

  try {
    triggers = ScriptApp.getProjectTriggers();
  } catch (error) {
    if (/permissions are not sufficient|script\.scriptapp|Authorization is required/i.test(String(error))) {
      throw new Error(
        "PDF結合用トリガーの権限がありません。GASエディタでauthorizeInspectionPdfMergeを1回実行し、権限を許可してから再デプロイしてください。"
      );
    }
    throw error;
  }

  const exists = triggers.some(
    trigger => trigger.getHandlerFunction() === INSPECTION_PDF_MERGE_TRIGGER_HANDLER_
  );

  if (!exists) {
    ScriptApp.newTrigger(INSPECTION_PDF_MERGE_TRIGGER_HANDLER_)
      .timeBased()
      .after(1000)
      .create();
  }
}

function deleteInspectionPdfMergeTriggers_() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === INSPECTION_PDF_MERGE_TRIGGER_HANDLER_) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function scheduleNextInspectionPdfMerge_() {
  deleteInspectionPdfMergeTriggers_();

  const properties = PropertiesService.getScriptProperties().getProperties();
  const hasPendingJob = Object.keys(properties)
    .filter(key => key.indexOf(INSPECTION_PDF_MERGE_JOB_PREFIX_) === 0)
    .some(key => {
      try {
        const job = JSON.parse(properties[key]);
        return job && job.status === "pending" && job.jobId;
      } catch (error) {
        return false;
      }
    });

  if (hasPendingJob) {
    ScriptApp.newTrigger(INSPECTION_PDF_MERGE_TRIGGER_HANDLER_)
      .timeBased()
      .after(1000)
      .create();
  }
}

function createInspectionSummaryPdf_(data) {
  const ss = SpreadsheetApp.openById(data.spreadsheetId);
  const pageSheetNames = ss
    .getSheets()
    .map(sheet => sheet.getName())
    .filter(name => /^点検結果総括表_\d+$/.test(name))
    .sort((a, b) => Number(a.replace("点検結果総括表_", "")) - Number(b.replace("点検結果総括表_", "")));

  if (pageSheetNames.length === 0) {
    throw new Error("PDF用の点検結果総括表ページが見つかりません。先に点検結果総括表をスプレッドシートへ反映してください。");
  }

  return createGenericInspectionPdf_({
    ...data,
    pdfKind: "inspectionSummary",
    fileSuffix: "点検結果総括表",
  }, pageSheetNames);
}

function createInspectionReportPdf_(data) {
  const ss = SpreadsheetApp.openById(data.spreadsheetId);
  const pageSheetNames = ss
    .getSheets()
    .map(sheet => sheet.getName())
    .filter(name => /^施設点検報告書_\d+$/.test(name))
    .sort((a, b) => Number(a.replace("施設点検報告書_", "")) - Number(b.replace("施設点検報告書_", "")));

  if (pageSheetNames.length === 0) {
    throw new Error("PDF用の施設点検報告書ページが見つかりません。先に施設点検報告書をスプレッドシートへ反映してください。");
  }

  pageSheetNames.forEach(name => {
    applyInspectionReportPdfFinishTypeLineBreaks_(ss.getSheetByName(name));
  });
  SpreadsheetApp.flush();

  return createGenericInspectionPdf_({
    ...data,
    pdfKind: "inspectionReport",
    fileSuffix: "施設点検報告書",
  }, pageSheetNames);
}

function applyInspectionReportPdfFinishTypeLineBreaks_(sheet) {
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return;

  const startRow = sheet.getName() === "施設点検報告書_1" ? 9 : 3;
  if (lastRow < startRow) return;

  const rowCount = lastRow - startRow + 1;
  const range = sheet.getRange(startRow, 6, rowCount, 1);
  const values = range.getDisplayValues().map(row => [String(row[0] || "")]);

  range
    .setNumberFormat("@")
    .setValues(values)
    .setWrap(true)
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP)
    .setVerticalAlignment("middle");
}

function buildInspectionReportPdfSheet_(source, output) {
  output.setHiddenGridlines(true);
  copyColumnWidths_(source, output, 1, 17);

  const lastRow = Math.max(source.getLastRow(), 8);
  copyRows_(source, output, 1, lastRow, 1);
  applyInspectionReportPdfHeaderAlignment_(output, 4);
  trimSheet_(output, lastRow, 17);
}

function applyInspectionReportPdfHeaderAlignment_(sheet, headerStartRow) {
  sheet
    .getRange(headerStartRow, 1, 2, 6)
    .setVerticalAlignment("middle");
}

function collectRowsByHeight_(sheet, startRow, lastRow, maxHeightPx) {
  let height = 0;
  let count = 0;

  for (let row = startRow; row <= lastRow; row++) {
    const rowHeight = sheet.getRowHeight(row);
    if (count > 0 && height + rowHeight > maxHeightPx) break;
    height += rowHeight;
    count += 1;
  }

  return Math.max(1, count);
}

function copyRows_(source, target, sourceStartRow, rowCount, targetStartRow) {
  const maxRows = target.getMaxRows();
  const requiredRows = targetStartRow + rowCount - 1;

  if (requiredRows > maxRows) {
    target.insertRowsAfter(maxRows, requiredRows - maxRows);
  }

  source
    .getRange(sourceStartRow, 1, rowCount, 17)
    .copyTo(target.getRange(targetStartRow, 1, rowCount, 17), { contentsOnly: false });

  for (let offset = 0; offset < rowCount; offset += 1) {
    target.setRowHeight(targetStartRow + offset, source.getRowHeight(sourceStartRow + offset));
  }

  return targetStartRow + rowCount;
}

function copyColumnWidths_(source, target, startColumn, columnCount) {
  for (let offset = 0; offset < columnCount; offset += 1) {
    const column = startColumn + offset;
    target.setColumnWidth(column, source.getColumnWidth(column));
  }
}

function getRowsHeight_(sheet, startRow, rowCount) {
  let height = 0;

  for (let offset = 0; offset < rowCount; offset += 1) {
    height += sheet.getRowHeight(startRow + offset);
  }

  return height;
}

function trimSheet_(sheet, lastRow, lastColumn) {
  const maxRows = sheet.getMaxRows();
  const maxColumns = sheet.getMaxColumns();

  if (maxRows > lastRow) {
    sheet.deleteRows(lastRow + 1, maxRows - lastRow);
  }

  if (maxColumns > lastColumn) {
    sheet.deleteColumns(lastColumn + 1, maxColumns - lastColumn);
  }
}

function createGenericInspectionPdf_(data, sheetNames) {
  const ss = SpreadsheetApp.openById(data.spreadsheetId);
  const settings = getGenericPdfSettings_(data, sheetNames);
  const selected = {};
  sheetNames.forEach(name => {
    selected[name] = true;
  });
  const sheets = ss.getSheets();
  const hiddenStates = sheets.map(sheet => ({
    sheet: sheet,
    hidden: sheet.isSheetHidden(),
  }));
  let selectedCount = 0;
  let firstSelectedSheet = null;

  try {
    sheets.forEach(sheet => {
      if (selected[sheet.getName()]) {
        sheet.showSheet();
        if (!firstSelectedSheet) firstSelectedSheet = sheet;
        selectedCount += 1;
      }
    });

    if (selectedCount === 0) {
      throw new Error("PDF化できるシートが見つかりません");
    }

    firstSelectedSheet.activate();
    SpreadsheetApp.flush();

    sheets.forEach(sheet => {
      if (!selected[sheet.getName()]) {
        sheet.hideSheet();
      }
    });

    SpreadsheetApp.flush();

    const fileName = buildInspectionPdfFileName_(data, settings.fileSuffix);
    const exportOptions = {
      portrait: settings.portrait,
      size: "A4",
      fitw: true,
      horizontal_alignment: settings.horizontalAlignment || "LEFT",
      gridlines: false,
      printtitle: false,
      sheetnames: false,
      pagenumbers: false,
      attachment: false,
    };

    Object.assign(exportOptions, getInspectionPdfMarginOptions_());
    if (settings.scale) {
      exportOptions.scale = settings.scale;
    }

    ["top_margin", "bottom_margin", "left_margin", "right_margin"].forEach(key => {
      if (settings[key] !== undefined) {
        exportOptions[key] = settings[key];
      }
    });

    const blob = exportSheetPdfBlob_(ss.getId(), null, fileName, exportOptions);
    const file = savePdfBlob_(data.spreadsheetId, blob, data.folderId);

    return {
      success: true,
      files: [{
        fileName: file.getName(),
        url: file.getUrl(),
      }],
    };
  } finally {
    hiddenStates.forEach(state => {
      if (!state.hidden) {
        state.sheet.showSheet();
      }
    });
    SpreadsheetApp.flush();
    hiddenStates.forEach(state => {
      if (state.hidden) {
        state.sheet.hideSheet();
      }
    });
    SpreadsheetApp.flush();
  }
}

function isInclinationPdfSheetName_(sheetName) {
  if (!sheetName) return false;
  if (sheetName === "傾斜測定カルテ_マスタ") return false;
  if (sheetName.indexOf("_マスタ") !== -1) return false;
  if (/^\d+$/.test(sheetName)) return false;
  if (/^傾斜測定カルテ/.test(sheetName)) return false;

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
  ].indexOf(sheetName) !== -1) {
    return false;
  }

  return /^[A-Za-zＡ-Ｚａ-ｚ]+(?:[,-][A-Za-zＡ-Ｚａ-ｚ]+)*$/.test(sheetName);
}

function isPhotoPositionMapPdfSheetName_(sheetName) {
  return sheetName === "写真カルテ番号位置図" || sheetName === "写真カルテ番号位置";
}

function isSlopeTablePdfSheetName_(sheetName) {
  return /^傾斜表(?:_\d+)?$/.test(sheetName);
}

function getSlopeTablePdfPageNumber_(sheetName) {
  const name = String(sheetName || "").trim();
  if (name === "傾斜表") return 1;
  const match = name.match(/^傾斜表_(\d+)$/);
  return match ? Number(match[1]) : 9999;
}

function getGenericPdfSettings_(data, sheetNames) {
  const kind = String(data.pdfKind || "");
  const suffix = String(data.fileSuffix || "").trim();
  const normalizedSheetNames = sheetNames.map(name => String(name || "").trim());

  if (kind === "cover" || suffix === "表紙" || sheetNames.indexOf("表紙") !== -1) {
    return { fileSuffix: "表紙", portrait: false, horizontalAlignment: "CENTER" };
  }

  if (kind === "inspectionReport" || suffix === "施設点検報告書") {
    const settings = {
      fileSuffix: "施設点検報告書",
      portrait: false,
      scale: 4,
    };

    if (shouldUseInspectionReportTightBottomMargin_(data.spreadsheetId)) {
      settings.bottom_margin = 1.2 / 2.54;
    }

    return settings;
  }

  if (kind === "inspectionSummary" || suffix === "点検結果総括表") {
    return {
      fileSuffix: "点検結果総括表",
      portrait: false,
      horizontalAlignment: "CENTER",
      // 現場ごとの列幅・行高差でフッターだけが次ページへ送られないよう、
      // PDF用に分割済みの各シートを必ず1ページへ収める。
      scale: 4,
      top_margin: 1.5 / 2.54,
      bottom_margin: 1.2 / 2.54,
      left_margin: 1.7 / 2.54,
      right_margin: 1.7 / 2.54,
    };
  }

  if (
    kind === "photoPositionMap" ||
    suffix === "写真カルテ番号位置図" ||
    normalizedSheetNames.some(isPhotoPositionMapPdfSheetName_)
  ) {
    return {
      fileSuffix: "写真カルテ番号位置図",
      portrait: false,
      scale: 4,
      top_margin: 2.2 / 2.54,
      bottom_margin: 2.0 / 2.54,
      left_margin: 1.7 / 2.54,
      right_margin: 1.7 / 2.54,
    };
  }

  if (kind === "slope" || suffix === "傾斜表" || normalizedSheetNames.some(isSlopeTablePdfSheetName_)) {
    return {
      fileSuffix: "傾斜表",
      portrait: false,
      horizontalAlignment: "CENTER",
      scale: 4,
      top_margin: 2.2 / 2.54,
      bottom_margin: 2.0 / 2.54,
      left_margin: 1.7 / 2.54,
      right_margin: 1.7 / 2.54,
    };
  }

  if (kind === "inclination" || suffix === "傾斜測定カルテ") {
    return {
      fileSuffix: "傾斜測定カルテ",
      portrait: false,
      scale: 4,
      top_margin: 2.2 / 2.54,
      bottom_margin: 2.0 / 2.54,
      left_margin: 1.7 / 2.54,
      right_margin: 1.7 / 2.54,
    };
  }

  if (kind === "photo" || suffix === "写真カルテ" || normalizedSheetNames.every(name => /^\d+$/.test(name))) {
    return {
      fileSuffix: suffix || "写真カルテ",
      portrait: false,
      scale: 4,
      top_margin: 2.2 / 2.54,
      bottom_margin: 2.0 / 2.54,
      left_margin: 1.7 / 2.54,
      right_margin: 1.7 / 2.54,
    };
  }

  return { fileSuffix: suffix || "写真カルテ", portrait: false };
}

function getInspectionPdfMarginOptions_() {
  return {
    top_margin: INSPECTION_PDF_MARGIN_TOP_INCHES_,
    bottom_margin: INSPECTION_PDF_MARGIN_BOTTOM_INCHES_,
    left_margin: INSPECTION_PDF_MARGIN_LEFT_INCHES_,
    right_margin: INSPECTION_PDF_MARGIN_RIGHT_INCHES_,
  };
}

function shouldUseInspectionReportTightBottomMargin_(spreadsheetId) {
  if (!spreadsheetId) return false;
  return PropertiesService
    .getScriptProperties()
    .getProperty("inspectionReportTightBottomMargin:" + spreadsheetId) === "1";
}

function exportSheetPdfBlob_(spreadsheetId, sheetId, fileName, options) {
  const params = Object.keys(options)
    .map(key => key + "=" + encodeURIComponent(String(options[key])))
    .join("&");
  const gidParam = sheetId === null || sheetId === undefined ? "" : "&gid=" + sheetId;
  const url = "https://docs.google.com/spreadsheets/d/" + spreadsheetId + "/export?format=pdf" + gidParam + "&" + params;
  let response = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = UrlFetchApp.fetch(url, {
      headers: {
        Authorization: "Bearer " + ScriptApp.getOAuthToken(),
      },
      muteHttpExceptions: true,
    });

    const code = response.getResponseCode();
    if (code >= 200 && code < 300) break;
    if (code !== 429 && code < 500) {
      throw new Error("PDF export failed: HTTP " + code + " " + response.getContentText().slice(0, 300));
    }

    Utilities.sleep(1200 * (attempt + 1));
  }

  const finalCode = response.getResponseCode();
  if (finalCode < 200 || finalCode >= 300) {
    throw new Error("PDF export failed: HTTP " + finalCode + " " + response.getContentText().slice(0, 300));
  }

  return response.getBlob().setName(fileName + ".pdf");
}

function savePdfBlob_(spreadsheetId, blob, folderId) {
  const folder = getInspectionPdfFolder_(spreadsheetId, folderId);
  return overwriteOrCreatePdfFile_(folder, blob);
}

function overwriteOrCreatePdfFile_(folder, blob) {
  const fileName = blob.getName();
  const files = folder.getFilesByName(fileName);
  let existingFile = null;

  while (files.hasNext()) {
    const candidate = files.next();
    if (candidate.getMimeType() !== MimeType.PDF) continue;
    if (
      !existingFile ||
      candidate.getLastUpdated().getTime() > existingFile.getLastUpdated().getTime()
    ) {
      existingFile = candidate;
    }
  }

  if (!existingFile) {
    return folder.createFile(blob);
  }

  const response = UrlFetchApp.fetch(
    "https://www.googleapis.com/upload/drive/v3/files/" +
      encodeURIComponent(existingFile.getId()) +
      "?uploadType=media&supportsAllDrives=true",
    {
      method: "patch",
      contentType: blob.getContentType() || MimeType.PDF,
      payload: blob.getBytes(),
      headers: {
        Authorization: "Bearer " + ScriptApp.getOAuthToken(),
      },
      muteHttpExceptions: true,
    }
  );
  const statusCode = response.getResponseCode();

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(
      "既存PDFの上書きに失敗しました: HTTP " +
        statusCode +
        " " +
        response.getContentText().slice(0, 300)
    );
  }

  return DriveApp.getFileById(existingFile.getId());
}

function buildInspectionPdfFileName_(data, suffix) {
  const station = String(data.stationName || "駅名未設定").trim();
  const year = String(data.year || "").trim();
  const suffixText = String(suffix || "PDF").trim();
  const parts = [station, year ? year + "年度" : "", suffixText].filter(Boolean);
  const numberPrefix = getInspectionPdfNumberPrefix_(suffixText);

  return numberPrefix + parts.join("_");
}

function getInspectionPdfNumberPrefix_(suffix) {
  const suffixText = String(suffix || "").trim();

  if (suffixText === "表紙") return "00.";
  if (suffixText === "写真カルテ番号位置図") return "01.";
  if (suffixText === "点検結果総括表") return "02.";
  if (suffixText === "施設点検報告書") return "03.";
  if (suffixText === "写真カルテ" || suffixText.indexOf("写真カルテ_") === 0) {
    return "03-1.";
  }
  if (suffixText === "傾斜表") return "04.";
  if (suffixText === "傾斜測定カルテ") return "04-1.";

  return "";
}

