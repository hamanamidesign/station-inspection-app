const GAS_URL = process.env.NEXT_PUBLIC_GAS_URL!;

export const runtime = "nodejs";
export const maxDuration = 60;

const GAS_TIMEOUT_MS = 55000;

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
    const res = await fetchGas(url);

    const text = await res.text();

    return new Response(text, {
      status: res.status,
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
    const res = await fetchGas(GAS_URL, {
      method: "POST",
      body,
    });

    const text = await res.text();

    return new Response(text, {
      status: res.status,
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

