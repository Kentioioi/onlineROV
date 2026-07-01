import { getUser } from "@netlify/identity";
// Pulls in the ambient `declare global { var Netlify: NetlifyGlobal }` from
// @netlify/functions so `Netlify.env` below type-checks.
import type {} from "@netlify/functions";

export type AuthedUser = {
  id: string;
  email: string;
};

/**
 * Resolves the current Identity user for a Function request, with a
 * local-dev-only bypass: DEV_AUTH_BYPASS must be explicitly set AND absent
 * from every real Netlify deploy context, so there is no runtime flag to
 * accidentally leave on in production - only an env var that must be
 * deliberately added to a hosted environment for the bypass to activate there.
 */
export async function resolveUser(): Promise<AuthedUser | null> {
  if (Netlify.env.get("DEV_AUTH_BYPASS") === "true") {
    return { id: "dev-user", email: "dev@local" };
  }

  const user = await getUser();
  if (!user) return null;
  return { id: user.id, email: user.email ?? "" };
}

export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

/** Convenience for handlers: returns the user or throws a Response to return early. */
export async function requireUser(): Promise<AuthedUser> {
  const user = await resolveUser();
  if (!user) throw unauthorized();
  return user;
}
