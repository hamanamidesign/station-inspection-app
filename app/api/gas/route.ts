const GAS_URL = process.env.NEXT_PUBLIC_GAS_URL!;

// ===============================
// GET (一覧取得など)
// ===============================
export async function GET(req: Request) {

  const { searchParams } = new URL(req.url);

  const params = new URLSearchParams(searchParams);

  const url = `${GAS_URL}?${params.toString()}`;

  const res = await fetch(url);

  const text = await res.text();

  return new Response(text, {
    headers: {
      "Content-Type": "application/json",
    },
  });

}


// ===============================
// POST (作成・保存)
// ===============================
export async function POST(req: Request) {

  const body = await req.text();

  const res = await fetch(GAS_URL, {
    method: "POST",
    body,
  });

  const text = await res.text();

  return new Response(text, {
    headers: {
      "Content-Type": "application/json",
    },
  });

}