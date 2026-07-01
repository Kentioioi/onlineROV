import type { Config } from "@netlify/functions";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { fieldOptions } from "../../db/schema.js";
import { fieldOptionInputSchema } from "../../shared/schema.js";
import { resolveUser, unauthorized } from "./_shared/auth.js";
import { badRequest, json } from "./_shared/http.js";

export default async (req: Request) => {
  const user = await resolveUser();
  if (!user) return unauthorized();

  const body = await req.json().catch(() => null);
  const parsed = fieldOptionInputSchema.safeParse(body);
  if (!parsed.success) return badRequest("Ugyldig verdi", parsed.error.flatten());
  const { fieldKey, value } = parsed.data;

  await db.insert(fieldOptions).values({ fieldKey, value }).onConflictDoNothing({
    target: [fieldOptions.fieldKey, fieldOptions.value],
  });

  // A 409 on the unique constraint (another inspector/device added the same
  // value concurrently, incl. an offline sync racing a live add) is treated
  // as success - the option exists either way, which is all the caller needs.
  const [row] = await db
    .select()
    .from(fieldOptions)
    .where(and(eq(fieldOptions.fieldKey, fieldKey), eq(fieldOptions.value, value)))
    .limit(1);

  return json(row, { status: 201 });
};

export const config: Config = {
  path: "/api/field-options",
  method: "POST",
};
