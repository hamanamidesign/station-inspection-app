const GAS_URL = process.env.NEXT_PUBLIC_GAS_URL!;

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
    case "getPulldownLists":
    case "getInspectionListDates":
    case "getKarteList":
    case "getUnavailableKarteNumbers":
    case "getPdfSheetOptions":
    case "getMaps":
      return 30000;
    case "getKarteData":
    case "getSlopeTableData":
    case "getInclinationKarteSheets":
    case "getMapBase64":
    case "getMapEditorData":
      return 45000;
    case "getInspectionReportData":
      // 複数の写真カルテを集約するため、Google側が混雑すると45秒を超えることがある。
      return 120000;
    case "createNew":
    case "uploadInclination":
    case "uploadSlopeTable":
    case "uploadInclinationKarteSheets":
    case "uploadInclinationKartePhoto":
    case "uploadCover":
    case "updateInspectionListMasterStation":
    case "uploadPhotos":
    case "saveMarkers":
      return 45000;
    case "uploadInspectionReport":
      // 行高計算とPDF用ページシート作成まで同期実行するため、件数が多い現場では45秒を超える。
      return 240000;
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
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
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
    const text = await res.text();

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

// ===============================
// GET (一覧取得など)
// ===============================
export async function GET(req: Request) {

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  const params = new URLSearchParams(searchParams);

  const url = `${GAS_URL}?${params.toString()}`;

  try {
    const { status, text } = await fetchGasTextWithRetry(url, undefined, getGasTimeoutMs(action));

    return new Response(text, {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error instanceof Error && error.name === "AbortError"
        ? withActionLabel(getGasTimeoutMessage(action), action)
        : error instanceof Error
          ? withActionLabel(error.message, action)
          : String(error),
    }, 504);
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
    const { status, text } = await fetchGasTextWithRetry(GAS_URL, {
      method: "POST",
      body,
    }, getGasTimeoutMs(action));

    if (action === "getMapBase64") {
      return normalizeMapBase64Response(text, status);
    }

    return new Response(text, {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error instanceof Error && error.name === "AbortError"
        ? withActionLabel(getGasTimeoutMessage(action), action)
        : error instanceof Error
          ? withActionLabel(error.message, action)
          : String(error),
    }, 504);
  }

}

