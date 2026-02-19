import { db, schema } from "../db/index.js";
import { eq, and, gte, lt } from "drizzle-orm";

const BRASILIA_TIMEZONE = "America/Sao_Paulo";
const BRASILIA_UTC_OFFSET_HOURS = 3;

function formatDateBrasilia(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: BRASILIA_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

function brasiliaLocalToUtcIso(
  year: number,
  monthZeroBased: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): string {
  const utcMs = Date.UTC(
    year,
    monthZeroBased,
    day,
    hour + BRASILIA_UTC_OFFSET_HOURS,
    minute,
    second
  );

  return new Date(utcMs).toISOString();
}

export async function generateMonthlyExport(
  guildId: string,
  year: number,
  month: number
): Promise<string> {
  const startOfMonth = brasiliaLocalToUtcIso(year, month - 1, 1, 0, 0, 0);
  const endOfMonthExclusive = brasiliaLocalToUtcIso(year, month, 1, 0, 0, 0);

  const cycles = await db
    .select()
    .from(schema.cycles)
    .where(
      and(
        eq(schema.cycles.guildId, guildId),
        gte(schema.cycles.startedAt, startOfMonth),
        lt(schema.cycles.startedAt, endOfMonthExclusive)
      )
    );

  if (cycles.length === 0) return `Nenhum ciclo encontrado em ${month}/${year}.`;

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
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

    const startDate = formatDateBrasilia(cycle.startedAt);
    const endDate = cycle.closedAt
      ? formatDateBrasilia(cycle.closedAt)
      : formatDateBrasilia(cycle.reviewDeadline);

    lines.push(`## Ciclo ${cycle.cycleNumber} (${startDate} - ${endDate})`);
    lines.push("");

    if (projects.length > 0) {
      lines.push("### Projetos Declarados");
      lines.push("| Membro | Título | Artefato Esperado |");
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
        let artefato = d.link ?? "-";
        if (d.attachmentUrl) {
          try {
            const urls: string[] = JSON.parse(d.attachmentUrl);
            artefato = artefato === "-" ? urls.join(", ") : `${artefato}, ${urls.join(", ")}`;
          } catch {
            artefato = artefato === "-" ? d.attachmentUrl : `${artefato}, ${d.attachmentUrl}`;
          }
        }
        lines.push(`| ${d.userId} | ${proj?.title ?? "?"} | ${artefato} |`);
      }
      lines.push("");
    }

    if (reviews.length > 0) {
      lines.push("### Revisões");
      lines.push("| Revisor | Quantidade |");
      lines.push("|---------|-----------|");
      const reviewerMap = new Map<string, number>();
      for (const r of reviews) {
        reviewerMap.set(r.reviewerUserId, (reviewerMap.get(r.reviewerUserId) ?? 0) + 1);
      }
      for (const [userId, count] of reviewerMap) {
        lines.push(`| ${userId} | ${count} |`);
      }
      lines.push("");
    }

    if (teachbackRows.length > 0) {
      lines.push("### Ensinos");
      lines.push("| Membro | Tópico |");
      lines.push("|--------|--------|");
      for (const t of teachbackRows) {
        lines.push(`| ${t.userId} | ${t.topic} |`);
      }
      lines.push("");
    }

    if (stateChanges.length > 0) {
      lines.push("### Alterações de Estado");
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
