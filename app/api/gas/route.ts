const GAS_URL = process.env.NEXT_PUBLIC_GAS_URL!;

// ===============================
// GET (一覧取得など)
// ===============================
export async function GET(req: Request) {

  const { searchParams } = new URL(req.url);

  const url = `${GAS_URL}?${searchParams.toString()}`;

  const res = await fetch(url);

  return Response.json(await res.json());

}

// ===============================
// POST (作成・保存)
// ===============================
export async function POST(req: Request) {

  const body = await req.json();

  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return Response.json(await res.json());

}