import { logger } from "../utils/logger.js";
import { msUntil, isPast } from "../utils/time.js";

interface ScheduledJob {
  id: string;
  guildId: string;
  timer: ReturnType<typeof setTimeout> | null;
  type: string;
}

const jobs = new Map<string, ScheduledJob[]>();
const MAX_TIMEOUT_MS = 2_147_483_647;

function scheduleTimer(
  job: ScheduledJob,
  targetIsoDate: string,
  action: () => Promise<void>
): void {
  const remaining = msUntil(targetIsoDate);

  if (remaining > MAX_TIMEOUT_MS) {
    job.timer = setTimeout(() => {
      scheduleTimer(job, targetIsoDate, action);
    }, MAX_TIMEOUT_MS);
    return;
  }

  job.timer = setTimeout(() => {
    removeJob(job.guildId, job.id);
    action().catch((err) =>
      logger.error("Falha ao executar tarefa.", { guildId: job.guildId, jobType: job.type, error: String(err) })
    );
  }, remaining);
}

function scheduleAt(
  guildId: string,
  jobType: string,
  isoDate: string,
  action: () => Promise<void>
): void {
  if (isPast(isoDate)) {
    logger.warn("Data já passou, executando imediatamente.", { guildId, jobType, isoDate });
    action().catch((err) =>
      logger.error("Falha ao executar tarefa atrasada.", { guildId, jobType, error: String(err) })
    );
    return;
  }

  const delay = msUntil(isoDate);
  const id = `${guildId}:${jobType}:${Date.now()}`;
  const job: ScheduledJob = {
    id,
    guildId,
    timer: null,
    type: jobType,
  };
  scheduleTimer(job, isoDate, action);
  const guildJobs = jobs.get(guildId) ?? [];
  guildJobs.push(job);
  jobs.set(guildId, guildJobs);

  logger.info("Tarefa agendada.", { guildId, jobType, isoDate, delayMs: delay });
}

function removeJob(guildId: string, jobId: string): void {
  const guildJobs = jobs.get(guildId);
  if (!guildJobs) return;
  const idx = guildJobs.findIndex((j) => j.id === jobId);
  if (idx !== -1) guildJobs.splice(idx, 1);
}

function cancelGuildJobs(guildId: string): void {
  const guildJobs = jobs.get(guildId);
  if (!guildJobs) return;
  for (const job of guildJobs) {
    if (job.timer) clearTimeout(job.timer);
  }
  jobs.delete(guildId);
  logger.info("Tarefas canceladas.", { guildId });
}

function getGuildJobCount(guildId: string): number {
  return jobs.get(guildId)?.length ?? 0;
}

export const scheduler = {
  scheduleAt,
  cancelGuildJobs,
  getGuildJobCount,
};
