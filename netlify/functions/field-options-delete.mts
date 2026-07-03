import type { Config, Context } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { fieldOptions } from "../../db/schema.js";
import { resolveUser, unauthorized } from "./_shared/auth.js";
import { badRequest, json } from "./_shared/http.js";

export default async (req: Request, context: Context) => {
  const user = await resolveUser();
  if (!user) return unauthorized();

  // Bounds check as well as integer check - an id beyond int4 range would
  // pass Number.isInteger but blow up in Postgres as a 500.
  const id = Number(context.params.id);
  if (!Number.isInteger(id) || id < 1 || id > 2_147_483_647) return badRequest("Ugyldig id");

  // Seeded and user-added values are identical rows - deleting either one
  // works exactly the same way, per the plan's unified field_options design.
  await db.delete(fieldOptions).where(eq(fieldOptions.id, id));

  return json({ ok: true });
};

export const config: Config = {
  path: "/api/field-options/:id",
  method: "DELETE",
};
