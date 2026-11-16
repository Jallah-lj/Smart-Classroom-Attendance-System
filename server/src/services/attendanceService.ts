import crypto from 'node:crypto';
import { query } from '../db/index.js';
import { CheckInSubmission, runVerificationPipeline, VerificationResult } from './verificationEngine.js';
import { recordAuditLog } from '../middleware/audit.js';

export interface CheckInResponse {
  success: boolean;
  attendanceRecordId?: string;
  status?: string;
  verificationStatus?: string;
  courseTitle?: string;
  courseCode?: string;
  recordedAt?: string;
  referenceNumber?: string;
  errorCode?: string;
  errorMessage?: string;
  failedRule?: string;
}

export async function processCheckIn(
  submission: CheckInSubmission,
  clientIp?: string,
  userAgent?: string,
  dbClient?: any
): Promise<CheckInResponse> {
  const db = dbClient || { query };

  // 1. Run server verification engine
  const verification: VerificationResult = await runVerificationPipeline(submission, db);

  // 2. Persist all verification events to append-only verification_events table
  for (const event of verification.evaluatedRules) {
    try {
      await db.query(
        `INSERT INTO verification_events 
         (session_id, student_id, rule_code, passed, failure_code, confidence_data)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          submission.sessionId,
          submission.studentId,
          event.ruleCode,
          event.passed,
          event.failureCode || null,
          JSON.stringify(event.confidenceData || {})
        ]
      );
    } catch (err) {
      console.error('[VerificationEvent] Failed to write event:', err);
    }
  }

  // 3. If verification failed, record failure in audit log and return clean error
  if (!verification.success) {
    await recordAuditLog(
      {
        actorId: submission.studentId,
        actorRole: 'STUDENT',
        action: 'ATTENDANCE_CHECK_IN_FAILED',
        targetEntity: 'attendance_sessions',
        targetId: submission.sessionId,
        details: {
          failedRule: verification.failedRule,
          errorCode: verification.errorCode,
          status: verification.status
        },
        ip: clientIp,
        userAgent
      },
      db
    );

    return {
      success: false,
      status: verification.status,
      verificationStatus: verification.verificationStatus,
      errorCode: verification.errorCode,
      errorMessage: verification.errorMessage,
      failedRule: verification.failedRule
    };
  }

  // 4. Verification Succeeded: generate photo reference and reference number
  const photoHash = crypto.randomBytes(16).toString('hex');
  const photoPath = `storage/selfies/${submission.sessionId}_${submission.studentId}_${photoHash}.jpg`;
  const referenceNumber = `ATT-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

  // 5. Atomic insert into append-only attendance_records
  const recordRes = await db.query(
    `INSERT INTO attendance_records 
     (session_id, student_id, status, verification_status, photo_path, check_in_metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, recorded_at`,
    [
      submission.sessionId,
      submission.studentId,
      verification.status,
      verification.verificationStatus,
      photoPath,
      JSON.stringify({
        referenceNumber,
        distanceMeters: verification.confidenceData?.distanceMeters,
        accuracyMeters: verification.confidenceData?.accuracyMeters,
        checksPassed: verification.evaluatedRules.filter((r) => r.passed).length,
        verifiedAt: new Date().toISOString()
      })
    ]
  );

  const recordId = recordRes.rows[0].id;
  const recordedAt = recordRes.rows[0].recorded_at;

  // 6. Record success in append-only audit_logs
  await recordAuditLog(
    {
      actorId: submission.studentId,
      actorRole: 'STUDENT',
      action: 'ATTENDANCE_RECORDED',
      targetEntity: 'attendance_records',
      targetId: recordId,
      details: {
        sessionId: submission.sessionId,
        status: verification.status,
        verificationStatus: verification.verificationStatus,
        referenceNumber
      },
      ip: clientIp,
      userAgent
    },
    db
  );

  // Broadcast real-time check-in event to active projector listeners
  try {
    const { broadcastSessionEvent } = await import('./sessionStreamService.js');
    broadcastSessionEvent(submission.sessionId, 'attendance-event', {
      studentId: submission.studentId,
      status: verification.status,
      timestamp: recordedAt
    });
  } catch (err) {
    // Ignore SSE broadcast failure in non-server test environments
  }

  // 7. Get course info for calm success screen
  const sessionInfo = await db.query(
    `SELECT c.title, c.code
     FROM attendance_sessions s
     JOIN course_offerings co ON s.course_offering_id = co.id
     JOIN courses c ON co.course_id = c.id
     WHERE s.id = $1`,
    [submission.sessionId]
  );

  return {
    success: true,
    attendanceRecordId: recordId,
    status: verification.status,
    verificationStatus: verification.verificationStatus,
    courseTitle: sessionInfo.rows[0]?.title || 'Course Lecture',
    courseCode: sessionInfo.rows[0]?.code || '',
    recordedAt,
    referenceNumber
  };
}

export async function submitAttendanceCorrection(
  recordId: string,
  newStatus: 'PRESENT' | 'REVOKED' | 'FLAGGED',
  reasonCode: string,
  reasonDetail: string,
  actorUser: { id: string; role: string },
  dbClient?: any
) {
  const db = dbClient || { query };

  // Fetch record and verify lecturer assignment
  const recRes = await db.query(
    `SELECT r.*, s.lecturer_id, co.id as offering_id, c.code as course_code
     FROM attendance_records r
     JOIN attendance_sessions s ON r.session_id = s.id
     JOIN course_offerings co ON s.course_offering_id = co.id
     JOIN courses c ON co.course_id = c.id
     WHERE r.id = $1`,
    [recordId]
  );

  if (recRes.rows.length === 0) {
    throw { statusCode: 404, message: 'Attendance record not found.' };
  }

  const record = recRes.rows[0];

  // Lecturer can only correct sessions they teach; Admin can correct any
  if (actorUser.role === 'LECTURER' && record.lecturer_id !== actorUser.id) {
    throw {
      statusCode: 403,
      message: 'Forbidden: Lecturers may only correct attendance for sessions they teach.'
    };
  }

  // Mandatory reason check
  if (!reasonCode || !reasonDetail || reasonDetail.trim().length < 5) {
    throw {
      statusCode: 400,
      message: 'A structured reasonCode and detailed reasonDetail (min 5 chars) are required.'
    };
  }

  // Insert into append-only attendance_corrections table
  const corrRes = await db.query(
    `INSERT INTO attendance_corrections 
     (attendance_record_id, previous_status, new_status, reason_code, reason_detail, requested_by, approved_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, created_at`,
    [
      recordId,
      record.status,
      newStatus,
      reasonCode,
      reasonDetail.trim(),
      actorUser.id,
      actorUser.id
    ]
  );

  // Record audit log
  await recordAuditLog(
    {
      actorId: actorUser.id,
      actorRole: actorUser.role,
      action: 'ATTENDANCE_CORRECTED',
      targetEntity: 'attendance_corrections',
      targetId: corrRes.rows[0].id,
      details: {
        recordId,
        previousStatus: record.status,
        newStatus,
        reasonCode,
        courseCode: record.course_code
      }
    },
    db
  );

  return corrRes.rows[0];
}
