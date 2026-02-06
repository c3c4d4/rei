import "dotenv/config";
import { Client, GatewayIntentBits, ChannelType } from "discord.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async (c) => {
  const guild = c.guilds.cache.get("1438620348928229608");
  if (!guild) {
    console.log("Guild nao encontrada");
    process.exit(0);
  }

  const channels = await guild.channels.fetch();
  const all = [...channels.values()].filter(
    (ch): ch is NonNullable<typeof ch> => ch !== null
  );

  const cats = all
    .filter((ch) => ch.type === ChannelType.GuildCategory)
    .sort((a, b) => a.rawPosition - b.rawPosition);

  for (const cat of cats) {
    console.log(`== ${cat.name.toUpperCase()} ==`);
    const kids = all
      .filter((ch) => ch.parentId === cat.id)
      .sort((a, b) => a.rawPosition - b.rawPosition);
    for (const k of kids) {
      const prefix = k.type === ChannelType.GuildVoice ? "v" : "#";
      console.log(`  ${prefix} ${k.name} (${k.id})`);
    }
  }

  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
