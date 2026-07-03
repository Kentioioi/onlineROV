export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
}

export function badRequest(message: string, details?: unknown): Response {
  return json({ error: message, details }, { status: 400 });
}

export function notFound(message = "Not found"): Response {
  return json({ error: message }, { status: 404 });
}

// Path params go straight into Postgres uuid comparisons - a non-UUID value
// there raises a DB error that surfaced as a 500. Validate first so garbage
// ids are a clean 404 instead.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | undefined): value is string {
  return !!value && UUID_RE.test(value);
}
