import type { Config, Context } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { appSettings } from "../../db/schema.js";
import { appSettingInputSchema, appSettingKeyRegex } from "../../shared/schema.js";
import { resolveUser, unauthorized } from "./_shared/auth.js";
import { badRequest, json } from "./_shared/http.js";

export default async (req: Request, context: Context) => {
  const user = await resolveUser();
  if (!user) return unauthorized();

  const key = context.params.key;
  if (!key || !appSettingKeyRegex.test(key)) return badRequest("Ugyldig nøkkel");

  const body = await req.json().catch(() => null);
  const parsed = appSettingInputSchema.safeParse(body);
  if (!parsed.success) return badRequest("Ugyldig verdi", parsed.error.flatten());
  const { value } = parsed.data;

  // Empty string means "use the built-in default" - clear the override
  // rather than storing an empty row, so builtinInspectionDefault() is what
  // resolves it on the client.
  if (value.trim() === "") {
    await db.delete(appSettings).where(eq(appSettings.key, key));
    return json({ key, value: null });
  }

  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });

  return json({ key, value });
};

export const config: Config = {
  path: "/api/settings/:key",
  method: "PUT",
};
