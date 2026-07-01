import { drizzle } from "drizzle-orm/netlify-db";
import * as schema from "./schema.js";

// Connection is configured automatically by Netlify (NETLIFY_DB_URL) - no
// connection string needed here, works the same across build/functions/local dev.
export const db = drizzle({ schema });
