import type { Config } from "@netlify/functions";
import { asc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { fieldOptions } from "../../db/schema.js";
import { FIELD_KEYS } from "../../shared/constants.js";
import { resolveUser, unauthorized } from "./_shared/auth.js";
import { badRequest, json } from "./_shared/http.js";

export default async (req: Request) => {
  const user = await resolveUser();
  if (!user) return unauthorized();

  const url = new URL(req.url);
  const field = url.searchParams.get("field");

  if (field && !FIELD_KEYS.includes(field as (typeof FIELD_KEYS)[number])) {
    return badRequest(`Ukjent felt: ${field}`);
  }

  const rows = await db
    .select()
    .from(fieldOptions)
    .where(field ? eq(fieldOptions.fieldKey, field as (typeof FIELD_KEYS)[number]) : undefined)
    .orderBy(asc(fieldOptions.fieldKey), asc(fieldOptions.sortOrder), asc(fieldOptions.value));

  return json({ items: rows });
};

export const config: Config = {
  path: "/api/field-options",
  method: "GET",
};
