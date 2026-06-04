const GAS_URL = process.env.NEXT_PUBLIC_GAS_URL!;

export const runtime = "nodejs";
export const maxDuration = 60;

const GAS_TIMEOUT_MS = 55000;
const GAS_RETRY_COUNT = 2;
const GAS_RETRY_DELAY_MS = 900;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const fetchGas = async (url: string, init?: RequestInit) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GAS_TIMEOUT_MS);

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

const fetchGasTextWithRetry = async (url: string, init?: RequestInit) => {
  let lastStatus = 0;
  let lastText = "";

  for (let attempt = 0; attempt <= GAS_RETRY_COUNT; attempt += 1) {
    const res = await fetchGas(url, init);
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

// ===============================
// GET (一覧取得など)
// ===============================
export async function GET(req: Request) {

  const { searchParams } = new URL(req.url);

  const params = new URLSearchParams(searchParams);

  const url = `${GAS_URL}?${params.toString()}`;

  try {
    const { status, text } = await fetchGasTextWithRetry(url);

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
        ? "GASの応答が遅く、Vercelの中継APIがタイムアウトしました。写真枚数を減らすか、もう一度保存してください。"
        : error instanceof Error
          ? error.message
          : String(error),
    }, 504);
  }

}

// ===============================
// POST (作成・保存)
// ===============================
export async function POST(req: Request) {

  const body = await req.text();

  try {
    const { status, text } = await fetchGasTextWithRetry(GAS_URL, {
      method: "POST",
      body,
    });

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
        ? "GASの応答が遅く、Vercelの中継APIがタイムアウトしました。写真枚数を減らすか、もう一度保存してください。"
        : error instanceof Error
          ? error.message
          : String(error),
    }, 504);
  }

}

