import { REST, Routes } from "discord.js";
import { env } from "./env.js";
import { loadCommands } from "./commands/index.js";
import { logger } from "./utils/logger.js";

const commands = loadCommands();
const commandData = commands.map((cmd) => cmd.data.toJSON());

const rest = new REST().setToken(env.BOT_TOKEN);

async function deploy() {
  try {
    logger.info(`Registering ${commandData.length} commands...`);

    if (env.DEV_GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(env.CLIENT_ID, env.DEV_GUILD_ID), {
        body: commandData,
      });
      logger.info("Commands registered (guild).");
    } else {
      await rest.put(Routes.applicationCommands(env.CLIENT_ID), {
        body: commandData,
      });
      logger.info("Commands registered (global).");
    }
  } catch (error) {
    logger.error("Failed to register commands.", { error: String(error) });
    process.exit(1);
  }
}

deploy();
