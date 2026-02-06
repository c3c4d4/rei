import { env } from "./env.js";
import { client, commands } from "./client.js";
import { loadCommands } from "./commands/index.js";
import { registerReadyEvent } from "./events/ready.js";
import { registerInteractionCreateEvent } from "./events/interaction-create.js";
import { registerGuildCreateEvent } from "./events/guild-create.js";

const allCommands = loadCommands();
for (const cmd of allCommands) {
  commands.set(cmd.data.name, cmd);
}

registerReadyEvent();
registerInteractionCreateEvent();
registerGuildCreateEvent();

client.login(env.BOT_TOKEN);
