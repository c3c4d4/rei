import { logger } from "../utils/logger.js";
import { msUntil, isPast } from "../utils/time.js";

interface ScheduledJob {
  id: string;
  guildId: string;
  timer: ReturnType<typeof setTimeout>;
  type: string;
}

const jobs = new Map<string, ScheduledJob[]>();

function scheduleAt(
  guildId: string,
  jobType: string,
  isoDate: string,
  action: () => Promise<void>
): void {
  if (isPast(isoDate)) {
    logger.warn("Data ja passou, executando imediatamente.", { guildId, jobType, isoDate });
    action().catch((err) =>
      logger.error("Falha ao executar job atrasado.", { guildId, jobType, error: String(err) })
    );
    return;
  }

  const delay = msUntil(isoDate);
  const id = `${guildId}:${jobType}:${Date.now()}`;

  const timer = setTimeout(() => {
    removeJob(guildId, id);
    action().catch((err) =>
      logger.error("Falha ao executar job.", { guildId, jobType, error: String(err) })
    );
  }, delay);

  const job: ScheduledJob = { id, guildId, timer, type: jobType };
  const guildJobs = jobs.get(guildId) ?? [];
  guildJobs.push(job);
  jobs.set(guildId, guildJobs);

  logger.info("Job agendado.", { guildId, jobType, isoDate, delayMs: delay });
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
    clearTimeout(job.timer);
  }
  jobs.delete(guildId);
  logger.info("Jobs cancelados.", { guildId });
}

function getGuildJobCount(guildId: string): number {
  return jobs.get(guildId)?.length ?? 0;
}

export const scheduler = {
  scheduleAt,
  cancelGuildJobs,
  getGuildJobCount,
};
