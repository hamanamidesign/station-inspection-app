// 写真カルテ保存後に評価欄の文字色を整えるための追加スニペットです。
// uploadKarte / uploadInclination の中で画像挿入を含む全処理が終わった後に、
// applyPhotoKarteEvalFontColors_(sheet, data); を呼び出してください。
//
// ルール:
// - ① 形状評価(F3): 常に黒
// - 総合評価(L3): AA / A1 / A2 / B のとき赤、それ以外は黒
// - 初回カルテ番号(D8): MS Mincho（ＭＳ 明朝）、8pt

function applyPhotoKarteEvalFontColors_(sheet, data) {
  SpreadsheetApp.flush();

  const totalEval = normalizePhotoKarteEval_(data && data.totalEval);
  const requestedColor = normalizePhotoKarteFontColor_(
    data && data.evalFontColors && data.evalFontColors.totalEval
  );
  const totalEvalColor = requestedColor ||
    (["AA", "A1", "A2", "B"].indexOf(totalEval) === -1 ? "#000000" : "#dc2626");

  getPhotoKarteStyleRange_(sheet, "F3")
    .setFontColor("#000000")
    .setFontWeight("bold");
  getPhotoKarteStyleRange_(sheet, "L3")
    .setFontColor(totalEvalColor)
    .setFontWeight(
    totalEvalColor === "#dc2626" ? "bold" : "normal"
  );
  getPhotoKarteStyleRange_(sheet, "D8")
    .setFontFamily("MS Mincho")
    .setFontSize(8);

  SpreadsheetApp.flush();
}

function normalizePhotoKarteEval_(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function normalizePhotoKarteFontColor_(value) {
  const color = String(value || "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(color) ? color : "";
}

function getPhotoKarteStyleRange_(sheet, a1Notation) {
  const range = sheet.getRange(a1Notation);
  const mergedRanges = range.getMergedRanges();
  return mergedRanges.length ? mergedRanges[0] : range;
}
