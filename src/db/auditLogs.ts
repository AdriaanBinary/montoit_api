import prisma from './prisma.js';
import type { Prisma } from '@prisma/client';

export interface CreateAuditLogInput {
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string | number;
  metadata?: Record<string, unknown> | null;
  request_id?: string | null;
}

const auditLogsDb = {
  create: async function(input: CreateAuditLogInput): Promise<void> {
    await prisma.auditLog.create({
      data: {
        actor_id: input.actor_id,
        action: input.action,
        entity_type: input.entity_type,
        entity_id: String(input.entity_id),
        metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : undefined,
        request_id: input.request_id ?? null
      }
    });
  }
};

export default auditLogsDb;