import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { formatDate } from "../utils/time.js";
import { MemberState, EventType } from "../utils/constants.js";
import { logEvent } from "./event-log.service.js";

export async function generateWeeklyReport(cycleId: number): Promise<string> {
  const cycles = await db.select().from(schema.cycles).where(eq(schema.cycles.id, cycleId));
  const cycle = cycles[0];
  if (!cycle) return "Ciclo não encontrado.";

  const projects = await db.select().from(schema.projects).where(eq(schema.projects.cycleId, cycleId));
  const deliveries = await db.select().from(schema.deliveries).where(eq(schema.deliveries.cycleId, cycleId));
  const reviews = await db.select().from(schema.reviews).where(eq(schema.reviews.cycleId, cycleId));
  const teachbackRows = await db.select().from(schema.teachbacks).where(eq(schema.teachbacks.cycleId, cycleId));
  const members = await db.select().from(schema.members).where(eq(schema.members.guildId, cycle.guildId));

  const activeCount = members.filter((m) => m.state === MemberState.ACTIVE).length;
  const observerCount = members.filter((m) => m.state === MemberState.OBSERVER).length;

  const deliveryMap = new Map(deliveries.map((d) => [d.projectId, d]));
  const deliveredProjects = projects.filter((p) => deliveryMap.has(p.id));

  const lines: string[] = [];
  lines.push(`--- RELATÓRIO CICLO ${cycle.cycleNumber} ---`);
  lines.push(
    `Período: ${formatDate(cycle.startedAt)} - ${formatDate(cycle.closedAt ?? cycle.reviewDeadline)}`
  );
  lines.push("");

  if (deliveredProjects.length > 0) {
    lines.push("Entregas:");
    for (const p of deliveredProjects) {
      lines.push(`- <@${p.userId}>: ${p.title}`);
    }
  } else {
    lines.push("Entregas: nenhuma.");
  }
  lines.push("");

  if (reviews.length > 0) {
    lines.push("Reviews concluídas:");
    for (const r of reviews) {
      const proj = projects.find((p) => deliveryMap.get(p.id)?.id === r.deliveryId);
      lines.push(`- <@${r.reviewerUserId}> -> ${proj?.title ?? "?"}`);
    }
  } else {
    lines.push("Reviews concluídas: nenhuma.");
  }
  lines.push("");

  if (teachbackRows.length > 0) {
    lines.push("Ensinos:");
    for (const t of teachbackRows) {
      lines.push(`- <@${t.userId}>: ${t.topic}`);
    }
  } else {
    lines.push("Ensinos: nenhum.");
  }
  lines.push("");

  lines.push(`Membros ativos: ${activeCount}`);
  lines.push(`Membros observadores: ${observerCount}`);
  lines.push("---");

  await logEvent(cycle.guildId, EventType.REPORT_GENERATED, { cycleId });

  return lines.join("\n");
}
