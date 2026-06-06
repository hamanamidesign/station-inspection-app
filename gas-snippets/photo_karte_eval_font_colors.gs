// 写真カルテ保存後に評価欄の文字色を整えるための追加スニペットです。
// uploadKarte / uploadInclination の中で対象シートへ値を書き込んだ後に、
// applyPhotoKarteEvalFontColors_(sheet, data); を呼び出してください。
//
// ルール:
// - ① 構造度評価(F3): 常に黒
// - 総合評価(L3): AA / A1 / A2 / B のとき赤、それ以外は黒

function applyPhotoKarteEvalFontColors_(sheet, data) {
  const totalEval = String(data && data.totalEval ? data.totalEval : "").trim();
  const totalEvalColor = ["AA", "A1", "A2", "B"].indexOf(totalEval) === -1
    ? "#000000"
    : "#dc2626";

  sheet.getRange("F3").setFontColor("#000000").setFontWeight("bold");
  sheet.getRange("L3").setFontColor(totalEvalColor).setFontWeight(
    totalEvalColor === "#dc2626" ? "bold" : "normal"
  );
}
