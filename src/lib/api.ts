export function apiError(code: string, message: string, status: number, requestId = `req_${crypto.randomUUID()}`) {
  return Response.json({ error: { code, message, requestId } }, { status });
}

export async function readJson(request: Request, maximumBytes = 32_768) {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) {
    throw new Error("BODY_TOO_LARGE");
  }
  return JSON.parse(text) as unknown;
}
