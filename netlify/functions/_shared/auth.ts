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
 * local-dev-only bypass. The bypass fails closed: it requires BOTH the
 * explicit DEV_AUTH_BYPASS flag AND `netlify dev`'s own NETLIFY_DEV marker.
 * The second condition can never be true in production, deploy-preview, or
 * branch-deploy contexts, so even accidentally importing a local .env file
 * into the hosted site's environment (Netlify UI / `netlify env:import`
 * both default to all contexts) cannot disable auth in a real deploy.
 */
export async function resolveUser(): Promise<AuthedUser | null> {
  if (Netlify.env.get("DEV_AUTH_BYPASS") === "true" && Netlify.env.get("NETLIFY_DEV") === "true") {
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
