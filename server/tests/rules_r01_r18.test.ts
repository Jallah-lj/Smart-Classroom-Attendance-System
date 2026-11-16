import { describe, it, expect, beforeAll } from 'vitest';
import { getTestDb } from '../src/db/index.js';
import { runSeed } from '../src/db/seed.js';
import { runVerificationPipeline, CheckInSubmission } from '../src/services/verificationEngine.js';
import { generateSessionQrToken } from '../src/lib/qr.js';
import crypto from 'node:crypto';

describe('Verification Engine Rules R-01 to R-18 Specification Test Suite', () => {
  let db: any;
  let activeSession: any;
  let validStudent: any;
  let validOffering: any;
  let validVenue: any;

  beforeAll(async () => {
    db = await getTestDb();
    await runSeed(db);

    const sessRes = await db.query(
      `SELECT s.*, v.latitude as venue_lat, v.longitude as venue_lon, v.radius_meters, v.max_accuracy_meters
       FROM attendance_sessions s
       JOIN venues v ON s.venue_id = v.id
       WHERE s.session_code = 'SESS-CSC3204-W8'`
    );
    activeSession = sessRes.rows[0];

    // Chinedu Okafor is enrolled in CSC 3204 and has NOT checked in yet
    const stuRes = await db.query("SELECT * FROM users WHERE email = 'student.chinedu@apex.edu'");
    validStudent = stuRes.rows[0];
  });

  function getBaseValidSubmission(): CheckInSubmission {
    const qrData = generateSessionQrToken(
      activeSession.id,
      activeSession.qr_secret,
      activeSession.qr_interval_seconds
    );

    return {
      sessionId: activeSession.id,
      studentId: validStudent.id,
      qrToken: qrData.token,
      roomCode: activeSession.room_code,
      location: {
        latitude: activeSession.venue_lat + 0.00005, // within ~6 meters
        longitude: activeSession.venue_lon + 0.00005,
        accuracy: 10.0,
        timestamp: Date.now()
      },
      camera: {
        isLiveCamera: true,
        sourceType: 'live_stream',
        photoDataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(800),
        livenessPromptMet: true,
        clientTimestamp: Date.now()
      }
    };
  }

  // R-01: Session not found
  it('R-01: rejects with SESSION_NOT_FOUND when sessionId does not exist', async () => {
    const sub = getBaseValidSubmission();
    sub.sessionId = crypto.randomUUID();

    const res = await runVerificationPipeline(sub, db);
    expect(res.success).toBe(false);
    expect(res.failedRule).toBe('R-01');
    expect(res.errorCode).toBe('SESSION_NOT_FOUND');
  });

  // R-02: Session not active (closed or expired)
  it('R-02: rejects with SESSION_NOT_ACTIVE when session is closed or out of schedule', async () => {
    // Temporarily insert a closed session
    const closed = await db.query(
      `INSERT INTO attendance_sessions 
       (course_offering_id, venue_id, lecturer_id, session_code, room_code, qr_secret, status, starts_at, ends_at)
       VALUES ($1, $2, $3, 'SESS-CLOSED-TEST', '5555', 'secret', 'CLOSED', now() - interval '2 hours', now() - interval '1 hour')
       RETURNING id, qr_secret`,
      [activeSession.course_offering_id, activeSession.venue_id, activeSession.lecturer_id]
    );

    const sub = getBaseValidSubmission();
    sub.sessionId = closed.rows[0].id;

    const res = await runVerificationPipeline(sub, db);
    expect(res.success).toBe(false);
    expect(res.failedRule).toBe('R-02');
    expect(res.errorCode).toBe('SESSION_NOT_ACTIVE');
  });

  // R-03: QR Token invalid / expired
  it('R-03: rejects with QR_TOKEN_INVALID when dynamic QR token is invalid or expired', async () => {
    const sub = getBaseValidSubmission();
    sub.qrToken = 'invalid-forged-or-expired-token-12345';

    const res = await runVerificationPipeline(sub, db);
    expect(res.success).toBe(false);
    expect(res.failedRule).toBe('R-03');
    expect(res.errorCode).toBe('QR_TOKEN_INVALID');
  });

  // R-04: Room Code mismatch
  it('R-04: rejects with ROOM_CODE_MISMATCH when ephemeral room code is incorrect', async () => {
    const sub = getBaseValidSubmission();
    sub.roomCode = '9999'; // wrong code

    const res = await runVerificationPipeline(sub, db);
    expect(res.success).toBe(false);
    expect(res.failedRule).toBe('R-04');
    expect(res.errorCode).toBe('ROOM_CODE_MISMATCH');
  });

  // R-05: Student not enrolled
  it('R-05: rejects with STUDENT_NOT_ENROLLED when student is not enrolled in the course offering', async () => {
    // Create an unenrolled student
    const unenrolled = await db.query(
      `INSERT INTO users (email, password_hash, full_name, matric_or_staff_no, role)
       VALUES ('unenrolled@apex.edu', 'hash', 'Unenrolled Student', 'MAT-999', 'STUDENT')
       RETURNING id`
    );

    const sub = getBaseValidSubmission();
    sub.studentId = unenrolled.rows[0].id;

    const res = await runVerificationPipeline(sub, db);
    expect(res.success).toBe(false);
    expect(res.failedRule).toBe('R-05');
    expect(res.errorCode).toBe('STUDENT_NOT_ENROLLED');
  });

  // R-06: Enrollment inactive / suspended
  it('R-06: rejects with ENROLLMENT_INACTIVE when student enrollment is suspended', async () => {
    const suspendedStudent = await db.query(
      `INSERT INTO users (email, password_hash, full_name, matric_or_staff_no, role)
       VALUES ('suspended@apex.edu', 'hash', 'Suspended Student', 'MAT-888', 'STUDENT')
       RETURNING id`
    );
    await db.query(
      `INSERT INTO student_enrollments (course_offering_id, student_id, matric_number, status)
       VALUES ($1, $2, 'MAT-888', 'SUSPENDED')`,
      [activeSession.course_offering_id, suspendedStudent.rows[0].id]
    );

    const sub = getBaseValidSubmission();
    sub.studentId = suspendedStudent.rows[0].id;

    const res = await runVerificationPipeline(sub, db);
    expect(res.success).toBe(false);
    expect(res.failedRule).toBe('R-06');
    expect(res.errorCode).toBe('ENROLLMENT_INACTIVE');
  });

  // R-07: Duplicate registration
  it('R-07: rejects with DUPLICATE_REGISTRATION when attendance already exists for session and student', async () => {
    // student.amina@apex.edu was already seeded with attendance in activeSession
    const amina = await db.query("SELECT id FROM users WHERE email = 'student.amina@apex.edu'");
    const sub = getBaseValidSubmission();
    sub.studentId = amina.rows[0].id;

    const res = await runVerificationPipeline(sub, db);
    expect(res.success).toBe(false);
    expect(res.failedRule).toBe('R-07');
    expect(res.errorCode).toBe('DUPLICATE_REGISTRATION');
  });

  // R-08: Geolocation permission denied / missing coordinates
  it('R-08: rejects with LOCATION_PERMISSION_DENIED when coordinates are missing', async () => {
    const sub = getBaseValidSubmission();
    delete sub.location;

    const res = await runVerificationPipeline(sub, db);
    expect(res.success).toBe(false);
    expect(res.failedRule).toBe('R-08');
    expect(res.errorCode).toBe('LOCATION_PERMISSION_DENIED');
  });

  // R-09: Geolocation accuracy degraded
  it('R-09: rejects with LOCATION_ACCURACY_TOO_LOW when GPS accuracy is degraded', async () => {
    const sub = getBaseValidSubmission();
    sub.location!.accuracy = 120.0; // max allowed is 30m, 120m is degraded

    const res = await runVerificationPipeline(sub, db);
    expect(res.success).toBe(false);
    expect(res.failedRule).toBe('R-09');
    expect(res.errorCode).toBe('LOCATION_ACCURACY_TOO_LOW');
  });

  // R-10: Geofence boundary violation
  it('R-10: rejects with LOCATION_OUTSIDE_GEOFENCE when student is far from venue', async () => {
    const sub = getBaseValidSubmission();
    // Shift latitude by ~5 km
    sub.location!.latitude = activeSession.venue_lat + 0.05;

    const res = await runVerificationPipeline(sub, db);
    expect(res.success).toBe(false);
    expect(res.failedRule).toBe('R-10');
    expect(res.errorCode).toBe('LOCATION_OUTSIDE_GEOFENCE');
  });

  // R-11: Geolocation timestamp stale
  it('R-11: rejects with LOCATION_STALE_TIMESTAMP when coordinates fix is older than 120s', async () => {
    const sub = getBaseValidSubmission();
    sub.location!.timestamp = Date.now() - 300 * 1000; // 5 minutes old

    const res = await runVerificationPipeline(sub, db);
    expect(res.success).toBe(false);
    expect(res.failedRule).toBe('R-11');
    expect(res.errorCode).toBe('LOCATION_STALE_TIMESTAMP');
  });

  // R-12: Camera feed invalid (not a live MediaDevices stream)
  it('R-12: rejects with CAMERA_FEED_INVALID when isLiveCamera is false', async () => {
    const sub = getBaseValidSubmission();
    sub.camera!.isLiveCamera = false;

    const res = await runVerificationPipeline(sub, db);
    expect(res.success).toBe(false);
    expect(res.failedRule).toBe('R-12');
    expect(res.errorCode).toBe('CAMERA_FEED_INVALID');
  });

  // R-13: File upload / gallery attempt
  it('R-13: rejects with GALLERY_UPLOAD_PROHIBITED when sourceType is file_upload', async () => {
    const sub = getBaseValidSubmission();
    sub.camera!.sourceType = 'file_upload';

    const res = await runVerificationPipeline(sub, db);
    expect(res.success).toBe(false);
    expect(res.failedRule).toBe('R-13');
    expect(res.errorCode).toBe('GALLERY_UPLOAD_PROHIBITED');
  });

  // R-14: Liveness action prompt failed
  it('R-14: rejects with LIVENESS_CHALLENGE_FAILED when liveness prompt was not met', async () => {
    const sub = getBaseValidSubmission();
    sub.camera!.livenessPromptMet = false;

    const res = await runVerificationPipeline(sub, db);
    expect(res.success).toBe(false);
    expect(res.failedRule).toBe('R-14');
    expect(res.errorCode).toBe('LIVENESS_CHALLENGE_FAILED');
  });

  // R-15: Photo verification payload corrupt/missing
  it('R-15: rejects with PHOTO_VERIFICATION_FAILED when image payload is corrupt or too short', async () => {
    const sub = getBaseValidSubmission();
    sub.camera!.photoDataUrl = 'data:image/jpeg;base64,short';

    const res = await runVerificationPipeline(sub, db);
    expect(res.success).toBe(false);
    expect(res.failedRule).toBe('R-15');
    expect(res.errorCode).toBe('PHOTO_VERIFICATION_FAILED');
  });

  // R-18: Student account suspended
  it('R-18: rejects with ACCOUNT_INELIGIBLE when student account is suspended', async () => {
    const deactivatedStudent = await db.query(
      `INSERT INTO users (email, password_hash, full_name, matric_or_staff_no, role, is_active)
       VALUES ('deactivated@apex.edu', 'hash', 'Deactivated Student', 'MAT-777', 'STUDENT', false)
       RETURNING id`
    );

    const sub = getBaseValidSubmission();
    sub.studentId = deactivatedStudent.rows[0].id;

    const res = await runVerificationPipeline(sub, db);
    expect(res.success).toBe(false);
    expect(res.failedRule).toBe('R-18');
    expect(res.errorCode).toBe('ACCOUNT_INELIGIBLE');
  });

  // GOLDEN PATH: All rules pass -> Marked PRESENT with WITHIN_BOUNDARY
  it('GOLDEN PATH: marks PRESENT with WITHIN_BOUNDARY when every server check passes', async () => {
    const sub = getBaseValidSubmission();

    const res = await runVerificationPipeline(sub, db);
    expect(res.success).toBe(true);
    expect(res.status).toBe('PRESENT');
    expect(res.verificationStatus).toBe('WITHIN_BOUNDARY');
    expect(res.evaluatedRules.length).toBeGreaterThanOrEqual(16);
    expect(res.evaluatedRules.every((r) => r.passed)).toBe(true);
  });
});
