import { db, schema } from "../db/index.js";
import { eq, and, gte, lte } from "drizzle-orm";

export async function generateMonthlyExport(
  guildId: string,
  year: number,
  month: number
): Promise<string> {
  const startOfMonth = new Date(year, month - 1, 1).toISOString();
  const endOfMonth = new Date(year, month, 0, 23, 59, 59).toISOString();

  const cycles = await db
    .select()
    .from(schema.cycles)
    .where(
      and(
        eq(schema.cycles.guildId, guildId),
        gte(schema.cycles.startedAt, startOfMonth),
        lte(schema.cycles.startedAt, endOfMonth)
      )
    );

  if (cycles.length === 0) return `Nenhum ciclo encontrado em ${month}/${year}.`;

  const monthNames = [
    "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];

  const lines: string[] = [];
  lines.push(`# Registro Mensal - ${monthNames[month - 1]} ${year}`);
  lines.push("");

  for (const cycle of cycles) {
    const projects = await db.select().from(schema.projects).where(eq(schema.projects.cycleId, cycle.id));
    const deliveries = await db.select().from(schema.deliveries).where(eq(schema.deliveries.cycleId, cycle.id));
    const reviews = await db.select().from(schema.reviews).where(eq(schema.reviews.cycleId, cycle.id));
    const teachbackRows = await db.select().from(schema.teachbacks).where(eq(schema.teachbacks.cycleId, cycle.id));
    const stateChanges = await db
      .select()
      .from(schema.memberStateHistory)
      .where(eq(schema.memberStateHistory.cycleId, cycle.id));

    const startDate = new Date(cycle.startedAt).toLocaleDateString("pt-BR");
    const endDate = cycle.closedAt
      ? new Date(cycle.closedAt).toLocaleDateString("pt-BR")
      : new Date(cycle.reviewDeadline).toLocaleDateString("pt-BR");

    lines.push(`## Ciclo ${cycle.cycleNumber} (${startDate} - ${endDate})`);
    lines.push("");

    if (projects.length > 0) {
      lines.push("### Projetos Declarados");
      lines.push("| Membro | Titulo | Artefato Esperado |");
      lines.push("|--------|--------|-------------------|");
      for (const p of projects) {
        lines.push(`| ${p.userId} | ${p.title} | ${p.expectedArtifact} |`);
      }
      lines.push("");
    }

    if (deliveries.length > 0) {
      lines.push("### Entregas");
      lines.push("| Membro | Projeto | Link |");
      lines.push("|--------|---------|------|");
      for (const d of deliveries) {
        const proj = projects.find((p) => p.id === d.projectId);
        lines.push(`| ${d.userId} | ${proj?.title ?? "?"} | ${d.link ?? d.attachmentUrl ?? "-"} |`);
      }
      lines.push("");
    }

    if (reviews.length > 0) {
      lines.push("### Reviews");
      lines.push("| Revisor | Projeto Revisado |");
      lines.push("|---------|-----------------|");
      for (const r of reviews) {
        const delivery = deliveries.find((d) => d.id === r.deliveryId);
        const proj = delivery ? projects.find((p) => p.id === delivery.projectId) : undefined;
        lines.push(`| ${r.reviewerUserId} | ${proj?.title ?? "?"} |`);
      }
      lines.push("");
    }

    if (teachbackRows.length > 0) {
      lines.push("### Ensinos");
      lines.push("| Membro | Topico |");
      lines.push("|--------|--------|");
      for (const t of teachbackRows) {
        lines.push(`| ${t.userId} | ${t.topic} |`);
      }
      lines.push("");
    }

    if (stateChanges.length > 0) {
      lines.push("### Alteracoes de Estado");
      lines.push("| Membro | De | Para | Motivo |");
      lines.push("|--------|----|------|--------|");
      for (const s of stateChanges) {
        lines.push(`| ${s.userId} | ${s.previousState} | ${s.newState} | ${s.reason} |`);
      }
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}
