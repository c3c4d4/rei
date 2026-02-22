import "dotenv/config";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema.js";

const client = createClient({ url: "file:./data/rei.db" });
const db = drizzle(client, { schema });

async function main() {
  await db
    .update(schema.guilds)
    .set({
      activeRoleId: "1469440446542512293",
      observerRoleId: "1469440448052461609",
    })
    .where(eq(schema.guilds.guildId, "1438620348928229608"));

  const rows = await db.select().from(schema.guilds);
  console.log("Config updated:", rows[0]);
  process.exit(0);
}

main();
