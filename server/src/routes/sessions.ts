import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { generateSessionQrToken, generateQrDataUrl } from '../lib/qr.js';
import { recordAuditLog } from '../middleware/audit.js';
import { addSessionListener, broadcastSessionEvent } from '../services/sessionStreamService.js';

export const sessionsRouter = Router();

// GET /api/v1/sessions - List active/upcoming sessions for user
sessionsRouter.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = req.user!;
  let sql = `
    SELECT s.id, s.session_code, s.room_code, s.status, s.starts_at, s.ends_at,
           s.qr_interval_seconds, c.code as course_code, c.title as course_title,
           v.name as venue_name, v.building as venue_building,
           v.latitude as venue_lat, v.longitude as venue_lon, v.radius_meters,
           u.full_name as lecturer_name,
           (SELECT COUNT(*) FROM attendance_records r WHERE r.session_id = s.id AND r.status = 'PRESENT') as present_count,
           (SELECT COUNT(*) FROM student_enrollments se WHERE se.course_offering_id = s.course_offering_id) as enrolled_count
    FROM attendance_sessions s
    JOIN course_offerings co ON s.course_offering_id = co.id
    JOIN courses c ON co.course_id = c.id
    JOIN venues v ON s.venue_id = v.id
    JOIN users u ON s.lecturer_id = u.id
  `;
  const params: any[] = [];

  if (user.role === 'LECTURER') {
    sql += ` WHERE s.lecturer_id = $1`;
    params.push(user.id);
  } else if (user.role === 'STUDENT') {
    sql += ` WHERE co.id IN (SELECT course_offering_id FROM student_enrollments WHERE student_id = $1)`;
    params.push(user.id);
  }

  sql += ` ORDER BY s.starts_at DESC LIMIT 50`;
  const result = await query(sql, params);
  res.json({ sessions: result.rows });
});

// GET /api/v1/sessions/:id - Get session details
sessionsRouter.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const result = await query(
    `SELECT s.*, c.code as course_code, c.title as course_title,
            v.name as venue_name, v.building as venue_building,
            v.latitude as venue_lat, v.longitude as venue_lon, v.radius_meters,
            u.full_name as lecturer_name,
            (SELECT COUNT(*) FROM attendance_records r WHERE r.session_id = s.id AND r.status = 'PRESENT') as present_count,
            (SELECT COUNT(*) FROM student_enrollments se WHERE se.course_offering_id = s.course_offering_id) as enrolled_count
     FROM attendance_sessions s
     JOIN course_offerings co ON s.course_offering_id = co.id
     JOIN courses c ON co.course_id = c.id
     JOIN venues v ON s.venue_id = v.id
     JOIN users u ON s.lecturer_id = u.id
     WHERE s.id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'Session not found.' });
    return;
  }

  const session = result.rows[0];
  delete session.qr_secret;

  res.json({ session });
});

// GET /api/v1/sessions/:id/live-qr - Projector view live QR payload (polling or single-fetch)
sessionsRouter.get('/:id/live-qr', requireAuth, requireRole('LECTURER', 'ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const user = req.user!;

  const result = await query(
    `SELECT s.*, c.code as course_code, c.title as course_title, v.name as venue_name
     FROM attendance_sessions s
     JOIN course_offerings co ON s.course_offering_id = co.id
     JOIN courses c ON co.course_id = c.id
     JOIN venues v ON s.venue_id = v.id
     WHERE s.id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'Session not found.' });
    return;
  }

  const session = result.rows[0];

  if (user.role === 'LECTURER' && session.lecturer_id !== user.id) {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'You can only project QR codes for sessions you teach.'
    });
    return;
  }

  if (session.status !== 'OPEN') {
    res.status(400).json({
      error: 'SESSION_NOT_ACTIVE',
      message: 'Cannot generate dynamic QR for an inactive session.'
    });
    return;
  }

  const qrData = generateSessionQrToken(session.id, session.qr_secret, session.qr_interval_seconds);
  const qrPayloadString = JSON.stringify({
    sid: session.id,
    tok: qrData.token,
    exp: qrData.expiresInSeconds,
    win: qrData.windowIndex
  });

  const qrDataUrl = await generateQrDataUrl(qrPayloadString);

  res.json({
    sessionId: session.id,
    sessionCode: session.session_code,
    courseCode: session.course_code,
    courseTitle: session.course_title,
    roomCode: session.room_code,
    venueName: session.venue_name,
    qrToken: qrData.token,
    expiresInSeconds: qrData.expiresInSeconds,
    intervalSeconds: session.qr_interval_seconds,
    qrDataUrl,
    endsAt: session.ends_at
  });
});

// GET /api/v1/sessions/:id/stream - Server-Sent Events (SSE) live stream for Projector View
sessionsRouter.get('/:id/stream', requireAuth, requireRole('LECTURER', 'ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const user = req.user!;

  const sessRes = await query(
    `SELECT s.*, c.code as course_code, c.title as course_title, v.name as venue_name
     FROM attendance_sessions s
     JOIN course_offerings co ON s.course_offering_id = co.id
     JOIN courses c ON co.course_id = c.id
     JOIN venues v ON s.venue_id = v.id
     WHERE s.id = $1`,
    [id]
  );

  if (sessRes.rows.length === 0) {
    res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'Session not found.' });
    return;
  }

  const session = sessRes.rows[0];
  if (user.role === 'LECTURER' && session.lecturer_id !== user.id) {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Access denied: You can only stream sessions you teach.'
    });
    return;
  }

  // Setup SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  res.write(': connected\n\n');
  addSessionListener(id, res);

  // Send initial token immediately
  const qrData = generateSessionQrToken(session.id, session.qr_secret, session.qr_interval_seconds);
  const qrPayloadString = JSON.stringify({
    sid: session.id,
    tok: qrData.token,
    exp: qrData.expiresInSeconds,
    win: qrData.windowIndex
  });
  const qrDataUrl = await generateQrDataUrl(qrPayloadString);

  res.write(`event: init\ndata: ${JSON.stringify({
    sessionId: session.id,
    roomCode: session.room_code,
    sessionCode: session.session_code,
    courseCode: session.course_code,
    courseTitle: session.course_title,
    venueName: session.venue_name,
    qrToken: qrData.token,
    expiresInSeconds: qrData.expiresInSeconds,
    intervalSeconds: session.qr_interval_seconds,
    qrDataUrl,
    endsAt: session.ends_at
  })}\n\n`);
});

// POST /api/v1/sessions - Lecturer creates new attendance session
const createSessionSchema = z.object({
  courseOfferingId: z.string().uuid(),
  venueId: z.string().uuid(),
  durationMinutes: z.number().int().min(15).max(300).default(90)
});

sessionsRouter.post('/', requireAuth, requireRole('LECTURER', 'ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const parseResult = createSessionSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const { courseOfferingId, venueId, durationMinutes } = parseResult.data;
  const user = req.user!;

  const offRes = await query('SELECT * FROM course_offerings WHERE id = $1', [courseOfferingId]);
  if (offRes.rows.length === 0) {
    res.status(404).json({ error: 'OFFERING_NOT_FOUND', message: 'Course offering not found.' });
    return;
  }
  const offering = offRes.rows[0];
  if (user.role === 'LECTURER' && offering.lecturer_id !== user.id) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You can only create sessions for your assigned courses.' });
    return;
  }

  const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
  const qrSecret = crypto.randomBytes(32).toString('hex');
  const sessionCode = `SESS-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);

  const insertRes = await query(
    `INSERT INTO attendance_sessions 
     (course_offering_id, venue_id, lecturer_id, session_code, room_code, qr_secret, status, starts_at, ends_at, qr_interval_seconds)
     VALUES ($1, $2, $3, $4, $5, $6, 'OPEN', $7, $8, 15)
     RETURNING id, session_code, room_code, status, starts_at, ends_at`,
    [courseOfferingId, venueId, user.id, sessionCode, roomCode, qrSecret, startsAt.toISOString(), endsAt.toISOString()]
  );

  await recordAuditLog({
    actorId: user.id,
    actorRole: user.role,
    action: 'SESSION_OPENED',
    targetEntity: 'attendance_sessions',
    targetId: insertRes.rows[0].id,
    details: { sessionCode, roomCode, durationMinutes },
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });

  res.status(201).json({ session: insertRes.rows[0] });
});

// POST /api/v1/sessions/:id/rotate-room-code - Regenerate room passcode
sessionsRouter.post('/:id/rotate-room-code', requireAuth, requireRole('LECTURER', 'ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const user = req.user!;

  const sessRes = await query('SELECT * FROM attendance_sessions WHERE id = $1', [id]);
  if (sessRes.rows.length === 0) {
    res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'Session not found.' });
    return;
  }
  const session = sessRes.rows[0];
  if (user.role === 'LECTURER' && session.lecturer_id !== user.id) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You can only rotate codes for sessions you teach.' });
    return;
  }

  const newRoomCode = Math.floor(1000 + Math.random() * 9000).toString();
  await query('UPDATE attendance_sessions SET room_code = $1, updated_at = now() WHERE id = $2', [newRoomCode, id]);

  broadcastSessionEvent(id, 'room-code-rotated', { newRoomCode });

  await recordAuditLog({
    actorId: user.id,
    actorRole: user.role,
    action: 'ROOM_CODE_ROTATED',
    targetEntity: 'attendance_sessions',
    targetId: id,
    details: { newRoomCode },
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });

  res.json({ success: true, roomCode: newRoomCode });
});

// POST /api/v1/sessions/:id/open - Re-open or Open session
sessionsRouter.post('/:id/open', requireAuth, requireRole('LECTURER', 'ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const user = req.user!;

  const sessRes = await query('SELECT * FROM attendance_sessions WHERE id = $1', [id]);
  if (sessRes.rows.length === 0) {
    res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'Session not found.' });
    return;
  }
  const session = sessRes.rows[0];
  if (user.role === 'LECTURER' && session.lecturer_id !== user.id) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You can only open sessions you teach.' });
    return;
  }

  await query("UPDATE attendance_sessions SET status = 'OPEN', updated_at = now() WHERE id = $1", [id]);
  broadcastSessionEvent(id, 'session-status-changed', { status: 'OPEN' });

  await recordAuditLog({
    actorId: user.id,
    actorRole: user.role,
    action: 'SESSION_OPENED',
    targetEntity: 'attendance_sessions',
    targetId: id
  });

  res.json({ message: 'Session opened successfully.' });
});

// POST /api/v1/sessions/:id/close - Close session
sessionsRouter.post('/:id/close', requireAuth, requireRole('LECTURER', 'ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const user = req.user!;

  const sessRes = await query('SELECT * FROM attendance_sessions WHERE id = $1', [id]);
  if (sessRes.rows.length === 0) {
    res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'Session not found.' });
    return;
  }
  const session = sessRes.rows[0];
  if (user.role === 'LECTURER' && session.lecturer_id !== user.id) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You can only close sessions you teach.' });
    return;
  }

  await query("UPDATE attendance_sessions SET status = 'CLOSED', updated_at = now() WHERE id = $1", [id]);
  broadcastSessionEvent(id, 'session-status-changed', { status: 'CLOSED' });

  await recordAuditLog({
    actorId: user.id,
    actorRole: user.role,
    action: 'SESSION_CLOSED',
    targetEntity: 'attendance_sessions',
    targetId: id,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });

  res.json({ message: 'Session closed successfully.' });
});

// POST /api/v1/sessions/:id/cancel - Cancel session
sessionsRouter.post('/:id/cancel', requireAuth, requireRole('LECTURER', 'ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const user = req.user!;

  const sessRes = await query('SELECT * FROM attendance_sessions WHERE id = $1', [id]);
  if (sessRes.rows.length === 0) {
    res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'Session not found.' });
    return;
  }
  const session = sessRes.rows[0];
  if (user.role === 'LECTURER' && session.lecturer_id !== user.id) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'You can only cancel sessions you teach.' });
    return;
  }

  await query("UPDATE attendance_sessions SET status = 'CANCELLED', updated_at = now() WHERE id = $1", [id]);
  broadcastSessionEvent(id, 'session-status-changed', { status: 'CANCELLED' });

  await recordAuditLog({
    actorId: user.id,
    actorRole: user.role,
    action: 'SESSION_CANCELLED',
    targetEntity: 'attendance_sessions',
    targetId: id
  });

  res.json({ message: 'Session cancelled.' });
});
