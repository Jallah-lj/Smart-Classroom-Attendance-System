import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { config } from '../config/index.js';
import { recordAuditLog } from '../middleware/audit.js';

export const adminRouter = Router();

// GET /api/v1/admin/audit-logs
adminRouter.get('/audit-logs', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const result = await query(
    `SELECT a.*, u.full_name as actor_name, u.email as actor_email
     FROM audit_logs a
     LEFT JOIN users u ON a.actor_id = u.id
     ORDER BY a.created_at DESC
     LIMIT 100`
  );
  res.json({ logs: result.rows });
});

// GET /api/v1/admin/venues
adminRouter.get('/venues', requireAuth, requireRole('ADMIN', 'LECTURER'), async (req: Request, res: Response): Promise<void> => {
  const result = await query(
    `SELECT v.*, 
            (SELECT COUNT(*) FROM attendance_sessions s WHERE s.venue_id = v.id) as session_count
     FROM venues v
     ORDER BY v.name ASC`
  );
  res.json({ venues: result.rows });
});

// POST /api/v1/admin/venues
const venueSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(3),
  building: z.string().min(2),
  campus: z.string().default('Main Campus'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().min(10).max(500).default(40.0),
  maxAccuracyMeters: z.number().min(5).max(100).default(30.0)
});

adminRouter.post('/venues', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const parseResult = venueSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const { code, name, building, campus, latitude, longitude, radiusMeters, maxAccuracyMeters } = parseResult.data;

  const result = await query(
    `INSERT INTO venues 
     (code, name, building, campus, latitude, longitude, radius_meters, max_accuracy_meters, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
     RETURNING *`,
    [code, name, building, campus, latitude, longitude, radiusMeters, maxAccuracyMeters]
  );

  await recordAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'VENUE_CREATED',
    targetEntity: 'venues',
    targetId: result.rows[0].id,
    details: { code, name, radiusMeters },
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });

  res.status(201).json({ venue: result.rows[0] });
});

// GET /api/v1/admin/system-status - Explicitly surfaces browser physical presence limitation
adminRouter.get('/system-status', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const statsRes = await query(`
    SELECT 
      (SELECT COUNT(*) FROM users WHERE role = 'STUDENT') as total_students,
      (SELECT COUNT(*) FROM users WHERE role = 'LECTURER') as total_lecturers,
      (SELECT COUNT(*) FROM courses) as total_courses,
      (SELECT COUNT(*) FROM attendance_sessions WHERE status = 'OPEN') as active_sessions,
      (SELECT COUNT(*) FROM attendance_records WHERE status = 'PRESENT') as total_present_records,
      (SELECT COUNT(*) FROM attendance_corrections) as total_corrections
  `);

  res.json({
    institution: config.institution.name,
    environment: config.nodeEnv,
    stats: statsRes.rows[0],
    presenceLimitationNotice: {
      rule: 'Section 5 Fundamental Security Notice',
      text: 'Browsers and consumer mobile devices cannot prove physical presence. Geolocation, QR scanning, and live camera verification provide corroborating evidence only. High-stakes academic decisions must never rely solely on automated browser-derived signals.'
    }
  });
});
