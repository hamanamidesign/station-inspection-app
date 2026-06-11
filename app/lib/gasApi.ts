const RETRYABLE_ACTIONS = new Set([
  "getRouteList",
  "getExistingData",
  "getPulldownLists",
  "getInspectionListDates",
  "getKarteList",
  "getUnavailableKarteNumbers",
  "getPdfSheetOptions",
  "getInspectionPdfMergeStatus",
  "getMaps",
  "getKarteData",
  "getSlopeTableData",
  "getInclinationKarteSheets",
  "getInspectionReportData",
  "getMapBase64",
  "getMapEditorData",
]);

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isRetryableGasError = (message: string) =>
  /タイムアウト|一時的|HTTP 429|HTTP 5\d\d|Gateway Timeout|FUNCTION_INVOCATION_TIMEOUT/i.test(message);

async function gasApiOnce(action: string, data: any = {}) {

  const res = await fetch("/api/gas", {

    method: "POST",

    body: JSON.stringify({
      action,
      ...data
    })

  });

  const text = await res.text();
  let json: any;

  try {
    json = JSON.parse(text);
  } catch {
    const message = /<!DOCTYPE html|<html|Google Drive|Page Not Found/i.test(text)
      ? `GASへの接続が一時的に失敗しました。少し待ってからもう一度お試しください。HTTP ${res.status}`
      : text || `GAS proxy error (${res.status})`;

    throw new Error(message);
  }

  if (!json.success) {
    const message = json.error || "GAS Error";
    throw new Error(String(message).includes("action=") ? message : `${message} action=${action}`);
  }

  return json;
}

export async function gasApi(action: string, data: any = {}) {
  try {
    return await gasApiOnce(action, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!RETRYABLE_ACTIONS.has(action) || !isRetryableGasError(message)) {
      throw error;
    }

    await wait(1200);
    return gasApiOnce(action, data);
  }
}

