import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

const GUILD_ID = "1438620348928229608";
const ATIVO_ROLE_ID = "1469440446542512293";

client.once("ready", async () => {
  const guild = await client.guilds.fetch(GUILD_ID);
  const members = await guild.members.fetch();

  let count = 0;
  for (const [, member] of members) {
    if (member.user.bot) continue;

    if (!member.roles.cache.has(ATIVO_ROLE_ID)) {
      try {
        await member.roles.add(ATIVO_ROLE_ID);
        console.log(`Ativo atribuído: ${member.user.tag}`);
        count++;
      } catch (err) {
        console.log(`Falha: ${member.user.tag} — ${err}`);
      }
    } else {
      console.log(`Já possui: ${member.user.tag}`);
    }
  }

  console.log(`\n${count} membros atualizados.`);
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
