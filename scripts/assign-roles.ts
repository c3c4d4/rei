import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

const GUILD_ID = "1438620348928229608";
const ACTIVE_ROLE_ID = "1469440446542512293";

client.once("ready", async () => {
  const guild = await client.guilds.fetch(GUILD_ID);
  const members = await guild.members.fetch();

  let count = 0;
  for (const [, member] of members) {
    if (member.user.bot) continue;

    if (!member.roles.cache.has(ACTIVE_ROLE_ID)) {
      try {
        await member.roles.add(ACTIVE_ROLE_ID);
        console.log(`Active role assigned: ${member.user.tag}`);
        count++;
      } catch (err) {
        console.log(`Failed: ${member.user.tag} - ${err}`);
      }
    } else {
      console.log(`Already has role: ${member.user.tag}`);
    }
  }

  console.log(`\n${count} members updated.`);
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
