import { Client, Collection, GatewayIntentBits } from "discord.js";
import type { Command } from "./types/commands.js";

export const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

export const commands = new Collection<string, Command>();
