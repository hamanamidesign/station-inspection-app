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
    const message = /<!DOCTYPE html|<html|Google Drive|Page Not Found/i.test(text)
      ? `GASへの接続が一時的に失敗しました。少し待ってからもう一度お試しください。HTTP ${res.status}`
      : text || `GAS proxy error (${res.status})`;

    throw new Error(message);
  }

  if (!json.success) {
    throw new Error(json.error || "GAS Error");
  }

  return json;
}

