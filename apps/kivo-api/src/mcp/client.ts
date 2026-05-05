export async function internalFetch(path: string, authHeader: string, options: RequestInit = {}) {
  const port = process.env.PORT || 4000;
  const baseUrl = `http://127.0.0.1:${port}`;
  
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": authHeader,
      ...(options.headers || {}),
    }
  });
  
  const data = await res.text();
  let parsed;
  try {
    parsed = data ? JSON.parse(data) : null;
  } catch (e) {
    parsed = data;
  }

  if (!res.ok) {
    throw new Error(`[${res.status}] ${typeof parsed === "object" ? JSON.stringify(parsed) : parsed}`);
  }
  return parsed;
}
