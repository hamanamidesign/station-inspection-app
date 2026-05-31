export async function gasApi(action: string, data: any = {}) {

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
    throw new Error(text || `GAS proxy error (${res.status})`);
  }

  if (!json.success) {
    throw new Error(json.error || "GAS Error");
  }

  return json;
}

