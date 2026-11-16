import crypto from 'node:crypto';
import { query } from '../db/index.js';

export interface AuditLogEntry {
  actorId?: string;
  actorRole: string;
  action: string;
  targetEntity: string;
  targetId?: string;
  details?: Record<string, any>;
  ip?: string;
  userAgent?: string;
}

/**
 * Strips tokens, exact coordinates, image blobs, and secrets from logged metadata
 */
export function sanitizeAuditDetails(details: Record<string, any> = {}): Record<string, any> {
  const sanitized: Record<string, any> = {};

  for (const [key, val] of Object.entries(details)) {
    const lowerKey = key.toLowerCase();
    
    // Explicitly redact sensitive tokens and secrets
    if (
      lowerKey.includes('token') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('password') ||
      lowerKey.includes('authorization')
    ) {
      sanitized[key] = '[REDACTED_SECRET]';
      continue;
    }

    // Explicitly redact exact coordinates (only distance/accuracy may be recorded)
    if (
      lowerKey.includes('lat') ||
      lowerKey.includes('lon') ||
      lowerKey.includes('coordinate') ||
      lowerKey.includes('location')
    ) {
      if (typeof val === 'object' && val !== null) {
        sanitized[key] = {
          hasFix: true,
          accuracyMeters: val.accuracy ? Math.round(val.accuracy) : undefined,
          timestamp: val.timestamp
        };
      } else {
        sanitized[key] = '[REDACTED_COORDINATES]';
      }
      continue;
    }

    // Explicitly redact selfie images or data URLs
    if (
      lowerKey.includes('photo') ||
      lowerKey.includes('selfie') ||
      lowerKey.includes('image') ||
      (typeof val === 'string' && val.startsWith('data:image'))
    ) {
      sanitized[key] = '[REDACTED_IMAGE_DATA]';
      continue;
    }

    // Normal values
    sanitized[key] = val;
  }

  return sanitized;
}

export async function recordAuditLog(
  entry: AuditLogEntry,
  dbClient?: { query: (sql: string, params: any[]) => Promise<any> }
): Promise<void> {
  const runQuery = dbClient ? dbClient.query.bind(dbClient) : query;

  const sanitizedDetails = sanitizeAuditDetails(entry.details);
  const ipHash = entry.ip
    ? crypto.createHash('sha256').update(entry.ip).digest('hex')
    : null;

  try {
    await runQuery(
      `INSERT INTO audit_logs 
       (actor_id, actor_role, action, target_entity, target_id, details, ip_hash, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entry.actorId || null,
        entry.actorRole,
        entry.action,
        entry.targetEntity,
        entry.targetId || null,
        JSON.stringify(sanitizedDetails),
        ipHash,
        entry.userAgent || null
      ]
    );
  } catch (err) {
    console.error('[AuditLog] Error recording append-only audit log:', err);
  }
}
