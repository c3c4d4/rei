import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const GUILD_ID = "1438620348928229608";

client.once("ready", async () => {
  const guild = await client.guilds.fetch(GUILD_ID);

  const ativo = await guild.roles.create({
    name: "Ativo",
    color: 0x2f3136,
    reason: "REI: role para membros ativos.",
  });
  console.log(`Role criada: Ativo (${ativo.id})`);

  const observador = await guild.roles.create({
    name: "Observador",
    color: 0x95a5a6,
    reason: "REI: role para observadores.",
  });
  console.log(`Role criada: Observador (${observador.id})`);

  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
