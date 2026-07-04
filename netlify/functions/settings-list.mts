import type { Config } from "@netlify/functions";
import { db } from "../../db/index.js";
import { appSettings } from "../../db/schema.js";
import { resolveUser, unauthorized } from "./_shared/auth.js";
import { json } from "./_shared/http.js";

export default async () => {
  const user = await resolveUser();
  if (!user) return unauthorized();

  const rows = await db.select().from(appSettings);

  return json({ items: rows });
};

export const config: Config = {
  path: "/api/settings",
  method: "GET",
};
