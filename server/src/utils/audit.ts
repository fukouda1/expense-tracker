import prisma from './db.js';

export async function logAudit(action: string, entity: string, entityId: number, details: string = '') {
  try {
    await prisma.auditLog.create({
      data: { action, entity, entity_id: entityId, details },
    });
  } catch (e) {
    console.error('Audit log failed:', e);
  }
}
