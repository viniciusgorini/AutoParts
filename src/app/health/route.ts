export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(
    { status: "ok", service: "autoparts", time: new Date().toISOString() },
    { headers: { "cache-control": "no-store" } },
  );
}
