import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { addHours, now } from "../utils/time.js";

type ProjectContract = typeof schema.projectContracts.$inferSelect;

type DeliveryPayloadV2 = {
  schema: "tomoyo_delivery_v2";
  attachments: string[];
  readme: string;
};

type SubmitResult =
  | { kind: "delivered"; contract: ProjectContract }
  | { kind: "already_delivered"; contract: ProjectContract }
  | { kind: "already_concluded"; contract: ProjectContract }
  | { kind: "not_found" }
  | { kind: "overdue_failed" };

type DecodedDeliverySubmission = {
  attachments: string[];
  readme: string | null;
  legacyAttachmentText: string | null;
};

function encodeDeliveryPayload(
  attachmentUrls: string[] | null,
  readme: string
): string {
  const payload: DeliveryPayloadV2 = {
    schema: "tomoyo_delivery_v2",
    attachments: attachmentUrls ?? [],
    readme,
  };
  return JSON.stringify(payload);
}

function decodeDeliveryPayload(raw: string | null): DecodedDeliverySubmission {
  if (!raw) {
    return { attachments: [], readme: null, legacyAttachmentText: null };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (Array.isArray(parsed)) {
      return {
        attachments: parsed.filter((item): item is string => typeof item === "string"),
        readme: null,
        legacyAttachmentText: null,
      };
    }

    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const attachments = Array.isArray(record.attachments)
        ? record.attachments.filter((item): item is string => typeof item === "string")
        : [];
      const readme = typeof record.readme === "string" ? record.readme : null;
      return { attachments, readme, legacyAttachmentText: null };
    }
  } catch {
    // Legacy plain string payloads are treated as a single attachment text.
  }

  return {
    attachments: [],
    readme: null,
    legacyAttachmentText: raw,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return String(error).toLowerCase().includes("unique");
}

async function getContractById(id: number): Promise<ProjectContract | undefined> {
  const rows = await db
    .select()
    .from(schema.projectContracts)
    .where(eq(schema.projectContracts.id, id))
    .limit(1);
  return rows[0];
}

async function getOpenContractForUser(
  guildId: string,
  userId: string
): Promise<ProjectContract | undefined> {
  const rows = await db
    .select()
    .from(schema.projectContracts)
    .where(
      and(
        eq(schema.projectContracts.guildId, guildId),
        eq(schema.projectContracts.userId, userId),
        eq(schema.projectContracts.status, "open")
      )
    )
    .orderBy(desc(schema.projectContracts.acceptedAt))
    .limit(1);
  return rows[0];
}

async function getDeliveredContractForUser(
  guildId: string,
  userId: string
): Promise<ProjectContract | undefined> {
  const rows = await db
    .select()
    .from(schema.projectContracts)
    .where(
      and(
        eq(schema.projectContracts.guildId, guildId),
        eq(schema.projectContracts.userId, userId),
        eq(schema.projectContracts.status, "delivered")
      )
    )
    .orderBy(desc(schema.projectContracts.deliveredAt))
    .limit(1);
  return rows[0];
}

async function getLatestContractForUser(
  guildId: string,
  userId: string
): Promise<ProjectContract | undefined> {
  const rows = await db
    .select()
    .from(schema.projectContracts)
    .where(
      and(
        eq(schema.projectContracts.guildId, guildId),
        eq(schema.projectContracts.userId, userId)
      )
    )
    .orderBy(desc(schema.projectContracts.acceptedAt))
    .limit(1);
  return rows[0];
}

async function listOpenContracts(guildId: string): Promise<ProjectContract[]> {
  return db
    .select()
    .from(schema.projectContracts)
    .where(
      and(
        eq(schema.projectContracts.guildId, guildId),
        eq(schema.projectContracts.status, "open")
      )
    )
    .orderBy(asc(schema.projectContracts.dueAt));
}

async function listConcludedContractsForUser(
  guildId: string,
  userId: string,
  limit = 10
): Promise<ProjectContract[]> {
  return db
    .select()
    .from(schema.projectContracts)
    .where(
      and(
        eq(schema.projectContracts.guildId, guildId),
        eq(schema.projectContracts.userId, userId),
        eq(schema.projectContracts.status, "concluded")
      )
    )
    .orderBy(desc(schema.projectContracts.concludedAt))
    .limit(limit);
}

async function listDeliveredContracts(
  guildId: string,
  limit = 50
): Promise<ProjectContract[]> {
  return db
    .select()
    .from(schema.projectContracts)
    .where(
      and(
        eq(schema.projectContracts.guildId, guildId),
        eq(schema.projectContracts.status, "delivered")
      )
    )
    .orderBy(desc(schema.projectContracts.deliveredAt))
    .limit(limit);
}

async function hasActiveContract(guildId: string, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.projectContracts.id })
    .from(schema.projectContracts)
    .where(
      and(
        eq(schema.projectContracts.guildId, guildId),
        eq(schema.projectContracts.userId, userId),
        inArray(schema.projectContracts.status, ["open", "delivered"])
      )
    )
    .limit(1);
  return rows.length > 0;
}

async function hasActiveReviewForContract(contractId: number): Promise<boolean> {
  const rows = await db
    .select({ id: schema.reviewThreads.id })
    .from(schema.reviewThreads)
    .where(
      and(
        eq(schema.reviewThreads.contractId, contractId),
        isNull(schema.reviewThreads.closedAt)
      )
    )
    .limit(1);
  return rows.length > 0;
}

async function acceptContract(
  guildId: string,
  userId: string,
  title: string,
  description: string,
  requirement: string,
  expectedArtifact: string,
  durationHours: number,
  dueAtOverride?: string
): Promise<ProjectContract | null> {
  await settleExpiredContracts(guildId);

  const active = await hasActiveContract(guildId, userId);
  if (active) return null;

  const acceptedAt = now();
  const dueAt = dueAtOverride ?? addHours(new Date(acceptedAt), durationHours).toISOString();

  try {
    await db.insert(schema.projectContracts).values({
      guildId,
      userId,
      title,
      description,
      requirement,
      expectedArtifact,
      durationHours,
      acceptedAt,
      dueAt,
      status: "open",
      deliveryLink: null,
      deliveryAttachmentUrl: null,
      deliveredAt: null,
      concludedAt: null,
      failedAt: null,
      penaltyApplied: false,
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return null;
    }
    throw error;
  }

  return (await getOpenContractForUser(guildId, userId)) ?? null;
}

async function settleExpiredContracts(guildId: string): Promise<number> {
  // Project due dates are informational only. Auto-failure is disabled.
  void guildId;
  return 0;
}

async function submitActiveContractDelivery(
  guildId: string,
  userId: string,
  link: string | null,
  attachmentUrls: string[] | null,
  readme: string
): Promise<SubmitResult> {
  const contract = await getOpenContractForUser(guildId, userId);
  if (!contract) {
    const latest = await getLatestContractForUser(guildId, userId);
    if (latest?.status === "failed") return { kind: "not_found" };
    if (latest?.status === "concluded") return { kind: "already_concluded", contract: latest };
    if (latest?.status === "delivered") {
      const hasActiveReview = await hasActiveReviewForContract(latest.id);
      if (hasActiveReview) return { kind: "already_delivered", contract: latest };

      const timestamp = now();
      const updatedRows = await db
        .update(schema.projectContracts)
        .set({
          status: "delivered",
          deliveredAt: timestamp,
          deliveryLink: link,
          deliveryAttachmentUrl: encodeDeliveryPayload(attachmentUrls, readme),
        })
        .where(
          and(
            eq(schema.projectContracts.id, latest.id),
            eq(schema.projectContracts.status, "delivered")
          )
        )
        .returning({ id: schema.projectContracts.id });
      if (updatedRows.length === 0) {
        const refreshed = await getContractById(latest.id);
        if (refreshed?.status === "concluded") return { kind: "already_concluded", contract: refreshed };
        if (refreshed?.status === "failed") return { kind: "not_found" };
        if (refreshed?.status === "delivered") return { kind: "already_delivered", contract: refreshed };
        return { kind: "not_found" };
      }

      const delivered = await getContractById(latest.id);
      if (!delivered) return { kind: "not_found" };
      return { kind: "delivered", contract: delivered };
    }
    return { kind: "not_found" };
  }

  const timestamp = now();

  const updatedRows = await db
    .update(schema.projectContracts)
    .set({
      status: "delivered",
      deliveredAt: timestamp,
      deliveryLink: link,
      deliveryAttachmentUrl: encodeDeliveryPayload(attachmentUrls, readme),
    })
    .where(
      and(
        eq(schema.projectContracts.id, contract.id),
        eq(schema.projectContracts.status, "open")
      )
    )
    .returning({ id: schema.projectContracts.id });
  if (updatedRows.length === 0) {
    const latest = await getContractById(contract.id);
    if (latest?.status === "delivered") return { kind: "already_delivered", contract: latest };
    if (latest?.status === "concluded") return { kind: "already_concluded", contract: latest };
    if (latest?.status === "failed") return { kind: "not_found" };
    return { kind: "not_found" };
  }

  const delivered = await getContractById(contract.id);
  if (!delivered) return { kind: "not_found" };
  return { kind: "delivered", contract: delivered };
}

async function concludeContract(contractId: number): Promise<ProjectContract | undefined> {
  await db
    .update(schema.projectContracts)
    .set({
      status: "concluded",
      concludedAt: now(),
    })
    .where(eq(schema.projectContracts.id, contractId));
  return getContractById(contractId);
}

async function markContractDelivered(contractId: number): Promise<ProjectContract | undefined> {
  await db
    .update(schema.projectContracts)
    .set({
      status: "delivered",
    })
    .where(eq(schema.projectContracts.id, contractId));
  return getContractById(contractId);
}

export const projectContractService = {
  getContractById,
  getOpenContractForUser,
  getDeliveredContractForUser,
  getLatestContractForUser,
  listOpenContracts,
  listDeliveredContracts,
  listConcludedContractsForUser,
  acceptContract,
  settleExpiredContracts,
  submitActiveContractDelivery,
  concludeContract,
  markContractDelivered,
  decodeDeliveryPayload,
};
