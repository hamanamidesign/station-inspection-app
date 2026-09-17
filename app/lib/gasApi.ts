const RETRYABLE_ACTIONS = new Set([
  "getRouteList",
  "getExistingData",
  "getPulldownLists",
  "getInspectionListDates",
  "getKarteList",
  "getUnavailableKarteNumbers",
  "getReservedPhotoKarteNumbers",
  "getPdfSheetOptions",
  "getInspectionPdfMergeStatus",
  "getAdobeInspectionPdfMergeStatus",
  "findCompletedInspectionPdf",
  "findCompletedInspectionPdfFile",
  "getMaps",
  "getKarteData",
  "getSlopeTableData",
  "getInclinationKarteSheets",
  "getInspectionReportData",
  "getInspectionSummaryComment",
  "getMapBase64",
  "getMapEditorData",
]);

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isRetryableGasError = (message: string) =>
  /タイムアウト|一時的|HTTP 404|HTTP 429|HTTP 5\d\d|Gateway Timeout|FUNCTION_INVOCATION_TIMEOUT/i.test(message);

async function gasApiOnce(action: string, data: any = {}) {

  const res = await fetch("/api/gas", {

    method: "POST",

    body: JSON.stringify({
      ...data,
      action
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

    throw new Error(`${message} action=${action}`);
  }

  if (!res.ok || !json?.success) {
    const message = json?.error || `GAS Error HTTP ${res.status}`;
    throw new Error(String(message).includes("action=") ? message : `${message} action=${action}`);
  }

  return json;
}

async function requestGas(action: string, data: any = {}) {
  try {
    return await gasApiOnce(action, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    const retryable = isRetryableGasError(message) || /Failed to fetch|fetch failed|NetworkError|Load failed/i.test(message);
    const timedOutPhoto = ['getKarteData', 'getMapBase64'].includes(action) && /タイムアウト|HTTP 504|Gateway Timeout|FUNCTION_INVOCATION_TIMEOUT/i.test(message);
    if (!RETRYABLE_ACTIONS.has(action) || !retryable || timedOutPhoto) {
      throw new Error(message.includes("action=") ? message : `${message} action=${action}`);
    }

    await wait(1200);
    return gasApiOnce(action, data).catch(error => {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(detail.includes("action=") ? detail : `${detail} action=${action}`);
    });
  }
}


// Share in-flight reads only; never cache results or deduplicate writes.
const pendingReads = new Map<string, Promise<any>>();
export function gasApi(action: string, data: any = {}): Promise<any> {
  if (!RETRYABLE_ACTIONS.has(action)) return requestGas(action, data);
  const key = JSON.stringify([action, data]);
  const pending = pendingReads.get(key);
  if (pending) return pending;
  const request = requestGas(action, data).finally(() => { pendingReads.delete(key); });
  pendingReads.set(key, request);
  return request;
}
