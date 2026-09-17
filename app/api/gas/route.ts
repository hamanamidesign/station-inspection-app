const GAS_URL = (process.env.GAS_URL || process.env.NEXT_PUBLIC_GAS_URL || "").trim();

export const runtime = "nodejs";
export const maxDuration = 300;

const DEFAULT_GAS_TIMEOUT_MS = 30000;
const GAS_RETRY_COUNT = 0;
const GAS_RETRY_DELAY_MS = 900;
const GAS_TIMEOUT_MESSAGE =
  "GASの応答が遅く、Vercelの中継APIがタイムアウトしました。処理対象が多い場合は少し待ってからもう一度お試しください。";
const GAS_SAVE_TIMEOUT_MESSAGE =
  "GASの応答が遅く、Vercelの中継APIがタイムアウトしました。スプレッドシート側では処理が完了している可能性があります。反映結果を確認してから再実行してください。";

const LONG_RUNNING_SAVE_ACTIONS = new Set([
  "uploadKarte",
  "uploadInclination",
  "uploadSlopeTable",
  "uploadInclinationKarteSheets",
  "uploadInclinationKartePhoto",
  "uploadCover",
  "updateInspectionListMasterStation",
  "uploadInspectionReport",
  "uploadInspectionSummary",
  "uploadPhotos",
  "saveMarkers",
]);

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getGasTimeoutMs = (action?: string | null) => {
  switch (action) {
    case "getRouteList":
      // GAS再デプロイ直後はキャッシュが空になり、Driveの路線フォルダ走査に時間がかかる。
      return 90000;
    case "getExistingData":
      // 現場管理台帳の初回読み込みは、GAS側キャッシュ作成まで時間がかかる場合がある。
      return 90000;
    case "getPulldownLists":
    case "getInspectionListDates":
    case "getKarteList":
    case "getUnavailableKarteNumbers":
    case "getPdfSheetOptions":
    case "getMaps":
      return 30000;
    case "getKarteData":
      return 120000;
    case "getMapBase64":
      return 90000;
    case "getSlopeTableData":
    case "getInclinationKarteSheets":
    case "getInspectionReportData":
    case "getMapEditorData":
      return 45000;
    case "createNew":
    case "uploadInclination":
    case "uploadSlopeTable":
    case "uploadInclinationKarteSheets":
    case "uploadInclinationKartePhoto":
    case "uploadCover":
    case "updateInspectionListMasterStation":
    case "uploadInspectionReport":
    case "uploadPhotos":
    case "saveMarkers":
      return 45000;
    case "uploadInspectionSummary":
      return 240000;
    case "uploadKarte":
      // Photo and Drive processing in GAS can take longer than one minute.
      return 240000;
    case "createInspectionPdf":
      return 55000;
    case "startInspectionPdfMerge":
    case "getInspectionPdfMergeStatus":
    case "findCompletedInspectionPdf":
    case "findCompletedInspectionPdfFile":
      return 30000;
    case "startAdobeInspectionPdfMerge":
      return 240000;
    case "getAdobeInspectionPdfMergeStatus":
      return 120000;
    default:
      return DEFAULT_GAS_TIMEOUT_MS;
  }
};

const fetchGas = async (url: string, init: RequestInit | undefined, timeoutMs: number) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await response.text();
    return { status: response.status, text };
  } finally {
    clearTimeout(timeoutId);
  }
};

const isTransientGasResponse = (status: number, text: string) =>
  status === 404 ||
  status === 429 ||
  status >= 500 ||
  /Sorry, unable to open the file at this time|Google Drive|Page Not Found/i.test(text);

const normalizeGasErrorText = (status: number, text: string) => {
  if (/Sorry, unable to open the file at this time|Google Drive|Page Not Found/i.test(text)) {
    return `GASへの接続が一時的に失敗しました。少し待ってからもう一度お試しください。HTTP ${status}`;
  }

  return text || `GAS proxy error (${status})`;
};

const fetchGasTextWithRetry = async (url: string, init: RequestInit | undefined, timeoutMs: number) => {
  let lastStatus = 0;
  let lastText = "";

  for (let attempt = 0; attempt <= GAS_RETRY_COUNT; attempt += 1) {
    const res = await fetchGas(url, init, timeoutMs);
    const text = res.text;

    lastStatus = res.status;
    lastText = text;

    if (!isTransientGasResponse(res.status, text)) {
      return { status: res.status, text };
    }

    if (attempt < GAS_RETRY_COUNT) {
      await sleep(GAS_RETRY_DELAY_MS * (attempt + 1));
    }
  }

  return {
    status: lastStatus || 502,
    text: JSON.stringify({
      success: false,
      error: normalizeGasErrorText(lastStatus || 502, lastText),
    }),
  };
};

const jsonResponse = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });

const withActionLabel = (message: string, action?: string | null) =>
  action ? `${message} action=${action}` : message;

const getGasTimeoutMessage = (action?: string | null) =>
  action && LONG_RUNNING_SAVE_ACTIONS.has(action)
    ? GAS_SAVE_TIMEOUT_MESSAGE
    : GAS_TIMEOUT_MESSAGE;

const detectImageMimeTypeFromBase64 = (base64: string) => {
  const value = base64.trim();

  if (value.startsWith("iVBORw0KGgo")) return "image/png";
  if (value.startsWith("/9j/")) return "image/jpeg";
  if (value.startsWith("R0lGOD")) return "image/gif";
  if (value.startsWith("UklGR")) return "image/webp";

  return "image/png";
};

const normalizeMapBase64Response = (text: string, status: number) => {
  const trimmed = text.trim();

  if (!trimmed) {
    return jsonResponse({
      success: false,
      error: `位置図画像の取得結果が空でした。HTTP ${status}`,
    }, status || 502);
  }

  try {
    const parsed = JSON.parse(trimmed);

    if (parsed?.success === false) {
      return jsonResponse(parsed, status);
    }

    if (typeof parsed?.base64 === "string") {
      return jsonResponse({
        success: true,
        base64: parsed.base64,
        mimeType: parsed.mimeType || detectImageMimeTypeFromBase64(parsed.base64),
      }, status);
    }

    return jsonResponse({
      success: false,
      error: parsed?.error || "位置図画像のBase64データが取得できませんでした",
    }, status || 502);
  } catch {
    return jsonResponse({
      success: status >= 200 && status < 300,
      base64: trimmed,
      mimeType: detectImageMimeTypeFromBase64(trimmed),
    }, status);
  }
};

const LEGACY_GET_ACTIONS = new Set(['getRouteList', 'getExistingData', 'getKarteList', 'getPulldownLists', 'getMaps']);
const validateGasUrl = () => {
  if (!GAS_URL) throw new Error('GAS_URL または NEXT_PUBLIC_GAS_URL が未設定です。');
  const url = new URL(GAS_URL);
  if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' || !url.pathname.endsWith('/exec')) throw new Error('GASの接続先にはWebアプリの /exec URLを設定してください。');
};
const upstreamResponse = (result: {status: number; text: string}, action: string | null) => {
  let parsed;
  try { parsed = JSON.parse(result.text); } catch { /* image responses may be raw base64 */ }
  if (/unknown action/i.test(String(parsed?.error || ''))) return jsonResponse({success: false, code: 'GAS_DEPLOYMENT_MISMATCH', error: withActionLabel('接続先GASがこの処理に対応していません。GASのデプロイ版と接続先URLを確認してください。', action)}, 502);
  if (result.status >= 400 || /<!doctype html|<html/i.test(result.text)) {
    console.warn('GAS upstream failure', {action, upstreamStatus: result.status});
    return jsonResponse({success: false, code: 'GAS_UPSTREAM_ERROR', upstreamStatus: result.status, error: withActionLabel('GAS接続先から正常な応答を取得できませんでした。HTTP ' + result.status + '。繰り返す場合はGASのデプロイURLとアクセス設定を確認してください。', action)}, 502);
  }
  if (action === 'getMapBase64') return normalizeMapBase64Response(result.text, result.status);
  return new Response(result.text, {status: result.status, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}});
};

// ===============================
// GET (一覧取得など)
// ===============================
export async function GET(req: Request) {

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  const params = new URLSearchParams(searchParams);

  const url = `${GAS_URL}?${params.toString()}`;

  try {
    validateGasUrl();
    const result = await fetchGasTextWithRetry(url, undefined, getGasTimeoutMs(action));
    return upstreamResponse(result, action);
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error instanceof Error && error.name === "AbortError"
        ? withActionLabel(getGasTimeoutMessage(action), action)
        : error instanceof Error
          ? withActionLabel(error.message, action)
          : String(error),
    }, error instanceof Error && error.name === "AbortError" ? 504 : 502);
  }

}

// ===============================
// POST (作成・保存)
// ===============================
export async function POST(req: Request) {

  const body = await req.text();
  let action: string | null = null;

  try {
    const parsed = JSON.parse(body);
    action = typeof parsed?.action === "string" ? parsed.action : null;
  } catch {
    action = null;
  }

  try {
    validateGasUrl();
    const startedAt = Date.now();
    const timeoutMs = getGasTimeoutMs(action);
    let result = await fetchGasTextWithRetry(GAS_URL, { method: "POST", body }, timeoutMs);
    // Only known read-only actions may fall back to GET. Never resend a save.
    if (action && LEGACY_GET_ACTIONS.has(action) && (result.status === 404 || result.status >= 500 || /unknown action/i.test(result.text))) {
      const remainingMs = timeoutMs - (Date.now() - startedAt);
      if (remainingMs > 1000) {
        const url = new URL(GAS_URL);
        for (const [key, value] of Object.entries(JSON.parse(body))) {
          if (value !== null && value !== undefined) url.searchParams.set(key, String(value));
        }
        result = await fetchGasTextWithRetry(url.toString(), undefined, remainingMs);
      }
    }
    return upstreamResponse(result, action);
  } catch (error) {
    if (
      action === "uploadInspectionReport" &&
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      return jsonResponse({
        success: true,
        pending: true,
        message: "施設点検報告書はスプレッドシート側で処理を継続しています。",
      }, 202);
    }

    return jsonResponse({
      success: false,
      error: error instanceof Error && error.name === "AbortError"
        ? withActionLabel(getGasTimeoutMessage(action), action)
        : error instanceof Error
          ? withActionLabel(error.message, action)
          : String(error),
    }, error instanceof Error && error.name === "AbortError" ? 504 : 502);
  }

}

