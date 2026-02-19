import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { formatDate } from "../utils/time.js";
import { MemberState, EventType } from "../utils/constants.js";
import { logEvent } from "./event-log.service.js";
import { rei } from "../utils/embeds.js";
import type { EmbedBuilder } from "discord.js";

function splitField(
  name: string,
  lines: string[],
  emptyText: string
): Array<{ name: string; value: string; inline: boolean }> {
  if (lines.length === 0) {
    return [{ name, value: emptyText, inline: false }];
  }

  const fields: Array<{ name: string; value: string; inline: boolean }> = [];
  let current = "";
  let part = 0;

  for (const line of lines) {
    if (current.length + line.length + 1 > 1000) {
      fields.push({
        name: part === 0 ? name : `${name} (continuação)`,
        value: current,
        inline: false,
      });
      current = line;
      part++;
    } else {
      current += (current ? "\n" : "") + line;
    }
  }

  if (current) {
    fields.push({
      name: part === 0 ? name : `${name} (continuação)`,
      value: current,
      inline: false,
    });
  }

  return fields;
}

export async function generateWeeklyReport(cycleId: number): Promise<EmbedBuilder> {
  const cycles = await db.select().from(schema.cycles).where(eq(schema.cycles.id, cycleId));
  const cycle = cycles[0];
  if (!cycle) return rei.error("Ciclo não encontrado.");

  const projects = await db.select().from(schema.projects).where(eq(schema.projects.cycleId, cycleId));
  const deliveries = await db.select().from(schema.deliveries).where(eq(schema.deliveries.cycleId, cycleId));
  const reviews = await db.select().from(schema.reviews).where(eq(schema.reviews.cycleId, cycleId));
  const teachbackRows = await db.select().from(schema.teachbacks).where(eq(schema.teachbacks.cycleId, cycleId));
  const members = await db.select().from(schema.members).where(eq(schema.members.guildId, cycle.guildId));

  const activeCount = members.filter((m) => m.state === MemberState.ACTIVE).length;
  const observerCount = members.filter((m) => m.state === MemberState.OBSERVER).length;

  const deliveryMap = new Map(deliveries.map((d) => [d.projectId, d]));
  const deliveredProjects = projects.filter((p) => deliveryMap.has(p.id));

  const period = `${formatDate(cycle.startedAt)} - ${formatDate(cycle.closedAt ?? cycle.reviewDeadline)}`;
  const embed = rei.report(`Relatório -- Ciclo ${cycle.cycleNumber}`).setDescription(`${period} (horário de Brasília)`);

  const entregaLines = deliveredProjects.map((p) => `<@${p.userId}>: ${p.title}`);
  embed.addFields(...splitField(`Entregas (${deliveredProjects.length})`, entregaLines, "Nenhuma."));

  const reviewerIds = [...new Set(reviews.map((r) => r.reviewerUserId))];
  const reviewLines = reviewerIds.map((uid) => {
    const count = reviews.filter((r) => r.reviewerUserId === uid).length;
    return `<@${uid}>: ${count} revisão(ões)`;
  });
  embed.addFields(...splitField(`Revisões (${reviews.length})`, reviewLines, "Nenhuma."));

  const ensinoLines = teachbackRows.map((t) => `<@${t.userId}>: ${t.topic}`);
  embed.addFields(...splitField(`Ensinos (${teachbackRows.length})`, ensinoLines, "Nenhum."));

  embed.addFields(
    { name: "Membros Ativos", value: String(activeCount), inline: true },
    { name: "Membros Observadores", value: String(observerCount), inline: true },
  );

  await logEvent(cycle.guildId, EventType.REPORT_GENERATED, { cycleId });

  return embed;
}
