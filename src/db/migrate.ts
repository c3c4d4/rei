import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "./index.js";
import { logger } from "../utils/logger.js";

export async function runMigrations(): Promise<void> {
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    logger.info("Migrations applied.");
  } catch (error) {
    logger.error("Failed to apply migrations.", { error: String(error) });
    throw error;
  }
}
