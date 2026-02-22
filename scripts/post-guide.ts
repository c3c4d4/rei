import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client, GatewayIntentBits } from "discord.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const DEFAULT_CHANNEL_ID = "1438633619139723494";
const channelId = process.env.GUIDE_CHANNEL_ID ?? DEFAULT_CHANNEL_ID;

function splitIntoChunks(content: string, maxLength = 1900): string[] {
  if (content.length <= maxLength) return [content];

  const chunks: string[] = [];
  const blocks = content.split("\n\n");
  let current = "";

  for (const block of blocks) {
    const candidate = current.length === 0 ? block : `${current}\n\n${block}`;
    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current.length > 0) {
      chunks.push(current);
      current = "";
    }

    if (block.length <= maxLength) {
      current = block;
      continue;
    }

    let index = 0;
    while (index < block.length) {
      chunks.push(block.slice(index, index + maxLength));
      index += maxLength;
    }
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

client.once("ready", async () => {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || !("send" in channel)) {
    console.error("Channel not found or missing permission.");
    process.exit(1);
    return;
  }

  const introPath = resolve(process.cwd(), "introduction.md");
  const content = await readFile(introPath, "utf-8");
  const chunks = splitIntoChunks(content);

  for (const chunk of chunks) {
    await channel.send({ content: chunk });
  }

  console.log(`Posted intro guide in ${chunks.length} message(s).`);
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
