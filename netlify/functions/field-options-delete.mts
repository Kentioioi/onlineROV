import type { Config, Context } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { fieldOptions } from "../../db/schema.js";
import { resolveUser, unauthorized } from "./_shared/auth.js";
import { badRequest, json } from "./_shared/http.js";

export default async (req: Request, context: Context) => {
  const user = await resolveUser();
  if (!user) return unauthorized();

  const id = Number(context.params.id);
  if (!Number.isInteger(id)) return badRequest("Ugyldig id");

  // Seeded and user-added values are identical rows - deleting either one
  // works exactly the same way, per the plan's unified field_options design.
  await db.delete(fieldOptions).where(eq(fieldOptions.id, id));

  return json({ ok: true });
};

export const config: Config = {
  path: "/api/field-options/:id",
  method: "DELETE",
};
