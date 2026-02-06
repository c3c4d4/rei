import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { env } from "../env.js";
import * as schema from "./schema.js";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });

const client = createClient({
  url: `file:${env.DATABASE_PATH}`,
});

export const db = drizzle(client, { schema });
export { schema };
