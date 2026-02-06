import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1),
  CLIENT_ID: z.string().min(1),
  DEV_GUILD_ID: z.string().optional(),
  DATABASE_PATH: z.string().default("./data/rei.db"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export const env = envSchema.parse(process.env);
