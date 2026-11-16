import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { processCheckIn, submitAttendanceCorrection } from '../services/attendanceService.js';
import { recordAuditLog } from '../middleware/audit.js';

export const attendanceRouter = Router();

// ====================================================================
// 1. Student Check-in Endpoint (Executes Server Verification Engine)
// ====================================================================
const checkInSchema = z.object({
  sessionId: z.string().uuid(),
  qrToken: z.string().min(10),
  roomCode: z.string().min(1),
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
    accuracy: z.number(),
    timestamp: z.number().optional()
  }),
  camera: z.object({
    isLiveCamera: z.boolean(),
    sourceType: z.enum(['live_stream', 'file_upload', 'unknown']),
    photoDataUrl: z.string().min(100),
    livenessPromptMet: z.boolean().optional(),
    clientTimestamp: z.number().optional()
  }),
  deviceFingerprint: z.string().optional()
});

attendanceRouter.post('/check-in', requireAuth, requireRole('STUDENT'), async (req: Request, res: Response): Promise<void> => {
  const parseResult = checkInSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'INVALID_SUBMISSION_PAYLOAD',
      message: 'Missing or malformed check-in fields (location, live camera capture, room code, or QR token).',
      details: parseResult.error.format()
    });
    return;
  }

  const submission = {
    ...parseResult.data,
    studentId: req.user!.id
  };

  const result = await processCheckIn(
    submission,
    req.ip,
    req.headers['user-agent']
  );

  if (!result.success) {
    res.status(400).json({
      error: result.errorCode,
      message: result.errorMessage,
      failedRule: result.failedRule,
      status: result.status,
      verificationStatus: result.verificationStatus
    });
    return;
  }

  res.status(201).json(result);
});

// ====================================================================
// 2. Direct Record Creation / Mutation Blockers (RULE ENFORCEMENT)
// "Students cannot create, edit, or delete attendance records through any endpoint"
// ====================================================================

attendanceRouter.post('/records', requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (req.user?.role === 'STUDENT') {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Students are prohibited from directly creating attendance records. All attendance must pass through the live verification pipeline.'
    });
    return;
  }

  // Even for non-students, direct arbitrary creation without audited session context is rejected
  res.status(400).json({
    error: 'DIRECT_CREATION_NOT_PERMITTED',
    message: 'Manual attendance records must be created through the audited session correction workflow.'
  });
});

attendanceRouter.put('/records/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  res.status(403).json({
    error: 'IMMUTABLE_RECORD',
    message: 'attendance_records is strictly append-only. Direct UPDATE operations are permanently prohibited.'
  });
});

attendanceRouter.patch('/records/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  res.status(403).json({
    error: 'IMMUTABLE_RECORD',
    message: 'attendance_records is strictly append-only. Direct PATCH operations are permanently prohibited.'
  });
});

attendanceRouter.delete('/records/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  res.status(403).json({
    error: 'IMMUTABLE_RECORD',
    message: 'attendance_records is strictly append-only. Direct DELETE operations are permanently prohibited.'
  });
});

// ====================================================================
// 3. Lecturer Roster View (Scoped to Course Offering)
// ====================================================================
attendanceRouter.get('/sessions/:id/roster', requireAuth, requireRole('LECTURER', 'ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const user = req.user!;

  // 1. Verify session & lecturer scope
  const sessRes = await query(
    `SELECT s.*, co.id as offering_id, c.code as course_code, c.title as course_title,
            v.name as venue_name
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

  // Lecturer access check: must be teaching this course
  if (user.role === 'LECTURER' && session.lecturer_id !== user.id) {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Access denied: You can only view attendance rosters for sessions you teach.'
    });
    return;
  }

  // 2. Fetch all enrolled students and their attendance status
  const rosterSql = `
    SELECT u.id as student_id, u.full_name, u.matric_or_staff_no as matric_number,
           se.status as enrollment_status,
           r.id as record_id,
           COALESCE(
             (SELECT ac.new_status FROM attendance_corrections ac WHERE ac.attendance_record_id = r.id ORDER BY ac.created_at DESC LIMIT 1),
             r.status,
             'ABSENT'
           ) as effective_status,
           r.status as raw_status,
           r.verification_status,
           r.recorded_at,
           r.check_in_metadata,
           (SELECT COUNT(*) FROM attendance_corrections ac WHERE ac.attendance_record_id = r.id) as correction_count
    FROM student_enrollments se
    JOIN users u ON se.student_id = u.id
    LEFT JOIN attendance_records r ON r.session_id = $1 AND r.student_id = u.id
    WHERE se.course_offering_id = $2
    ORDER BY u.full_name ASC
  `;

  const rosterRes = await query(rosterSql, [id, session.course_offering_id]);

  res.json({
    session: {
      id: session.id,
      sessionCode: session.session_code,
      courseCode: session.course_code,
      courseTitle: session.course_title,
      venueName: session.venue_name,
      roomCode: session.room_code,
      status: session.status,
      startsAt: session.starts_at,
      endsAt: session.ends_at
    },
    students: rosterRes.rows
  });
});

// ====================================================================
// 4. Lecturer Photo View (Strict Scope: Lecturers see photos ONLY for courses they teach)
// ====================================================================
attendanceRouter.get('/sessions/:id/photos/:recordId', requireAuth, requireRole('LECTURER', 'ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const { id, recordId } = req.params;
  const user = req.user!;

  // 1. Verify session and lecturer assignment
  const sessRes = await query('SELECT lecturer_id FROM attendance_sessions WHERE id = $1', [id]);
  if (sessRes.rows.length === 0) {
    res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'Session not found.' });
    return;
  }

  const session = sessRes.rows[0];
  if (user.role === 'LECTURER' && session.lecturer_id !== user.id) {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Access denied: Lecturers can only access student verification photos for sessions they teach.'
    });
    return;
  }

  // 2. Fetch record
  const recRes = await query(
    `SELECT r.id, r.photo_path, u.full_name, u.matric_or_staff_no
     FROM attendance_records r
     JOIN users u ON r.student_id = u.id
     WHERE r.id = $1 AND r.session_id = $2`,
    [recordId, id]
  );

  if (recRes.rows.length === 0) {
    res.status(404).json({ error: 'RECORD_NOT_FOUND', message: 'Attendance record or photo not found.' });
    return;
  }

  const record = recRes.rows[0];

  // Record audit access for viewing biometric/verification photo
  await recordAuditLog({
    actorId: user.id,
    actorRole: user.role,
    action: 'PHOTO_VIEWED',
    targetEntity: 'attendance_records',
    targetId: recordId,
    details: { sessionId: id, matricNumber: record.matric_or_staff_no }
  });

  // Return photo metadata and access token (or placeholder mock image)
  res.json({
    recordId: record.id,
    studentName: record.full_name,
    matricNumber: record.matric_or_staff_no,
    photoPath: record.photo_path,
    photoUrl: `/storage/selfies/${record.id}.jpg`
  });
});

// ====================================================================
// 5. Audited Attendance Corrections (Append-only)
// ====================================================================
const correctionSchema = z.object({
  recordId: z.string().uuid(),
  newStatus: z.enum(['PRESENT', 'REVOKED', 'FLAGGED']),
  reasonCode: z.enum(['STUDENT_DISPUTE_UPHELD', 'LECTURER_OBSERVED_LEAVING', 'DEVICE_FAILURE_OVERRIDE', 'MEDICAL_EXCUSE', 'ADMINISTRATIVE_CORRECTION']),
  reasonDetail: z.string().min(5)
});

attendanceRouter.post('/sessions/:id/corrections', requireAuth, requireRole('LECTURER', 'ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const parseResult = correctionSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const { recordId, newStatus, reasonCode, reasonDetail } = parseResult.data;

  try {
    const correction = await submitAttendanceCorrection(
      recordId,
      newStatus,
      reasonCode,
      reasonDetail,
      { id: req.user!.id, role: req.user!.role }
    );
    res.status(201).json({ success: true, correction });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({
      error: 'CORRECTION_FAILED',
      message: err.message || 'Failed to submit correction.'
    });
  }
});

// ====================================================================
// 6. Student Attendance History
// ====================================================================
attendanceRouter.get('/student/history', requireAuth, requireRole('STUDENT'), async (req: Request, res: Response): Promise<void> => {
  const studentId = req.user!.id;

  const result = await query(
    `SELECT r.id as record_id, s.id as session_id, s.session_code, s.starts_at,
            c.code as course_code, c.title as course_title,
            v.name as venue_name,
            COALESCE(
              (SELECT ac.new_status FROM attendance_corrections ac WHERE ac.attendance_record_id = r.id ORDER BY ac.created_at DESC LIMIT 1),
              r.status
            ) as effective_status,
            r.status as raw_status,
            r.verification_status,
            r.recorded_at,
            r.check_in_metadata
     FROM attendance_records r
     JOIN attendance_sessions s ON r.session_id = s.id
     JOIN course_offerings co ON s.course_offering_id = co.id
     JOIN courses c ON co.course_id = c.id
     JOIN venues v ON s.venue_id = v.id
     WHERE r.student_id = $1
     ORDER BY s.starts_at DESC`,
    [studentId]
  );

  res.json({ history: result.rows });
});
