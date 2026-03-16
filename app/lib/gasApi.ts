export async function gasApi(action: string, data: any = {}) {

  const res = await fetch("/api/gas", {

    method: "POST",

    body: JSON.stringify({
      action,
      ...data
    })

  });

  const json = await res.json();

  if (!json.success) {
    throw new Error(json.error || "GAS Error");
  }

  return json;
}

