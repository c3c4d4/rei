import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const GUILD_ID = "1438620348928229608";

client.once("ready", async () => {
  const guild = await client.guilds.fetch(GUILD_ID);

  const active = await guild.roles.create({
    name: "Active",
    color: 0x2f3136,
    reason: "REI: role for active members.",
  });
  console.log(`Role created: Active (${active.id})`);

  const observer = await guild.roles.create({
    name: "Observer",
    color: 0x95a5a6,
    reason: "REI: role for observers.",
  });
  console.log(`Role created: Observer (${observer.id})`);

  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
