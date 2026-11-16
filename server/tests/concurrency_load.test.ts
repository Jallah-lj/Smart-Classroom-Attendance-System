import { describe, it, expect, beforeAll } from 'vitest';
import { getTestDb } from '../src/db/index.js';
import { runSeed } from '../src/db/seed.js';
import { processCheckIn } from '../src/services/attendanceService.js';
import { generateSessionQrToken } from '../src/lib/qr.js';

describe('High-Concurrency Load Verification (400 Concurrent Registrations)', () => {
  let db: any;
  let activeSession: any;
  const BATCH_SIZE = 400;
  const studentIds: string[] = [];

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

    // Bulk provision 400 distinct student accounts & enrollments in the course offering
    console.log(`[LoadTest] Provisioning ${BATCH_SIZE} student accounts & enrollments...`);
    const offeringId = activeSession.course_offering_id;

    for (let i = 1; i <= BATCH_SIZE; i++) {
      const email = `loadtest.student.${i}@apex.edu`;
      const matric = `CSC/2023/${2000 + i}`;
      const userRes = await db.query(
        `INSERT INTO users (email, password_hash, full_name, matric_or_staff_no, role)
         VALUES ($1, 'hash', $2, $3, 'STUDENT') RETURNING id`,
        [email, `Student Number ${i}`, matric]
      );
      const sId = userRes.rows[0].id;
      studentIds.push(sId);

      await db.query(
        `INSERT INTO student_enrollments (course_offering_id, student_id, matric_number, status)
         VALUES ($1, $2, $3, 'ACTIVE')`,
        [offeringId, sId, matric]
      );
    }
  }, 30000);

  it(`processes ${BATCH_SIZE} concurrent registrations with 0 duplicates and atomic data integrity`, async () => {
    const qrData = generateSessionQrToken(
      activeSession.id,
      activeSession.qr_secret,
      activeSession.qr_interval_seconds
    );

    const startTime = performance.now();

    // Fire all 400 requests concurrently
    const promises = studentIds.map((studentId, idx) => {
      // Add slight jitter in coordinates within the 45m radius
      const latJitter = (Math.random() - 0.5) * 0.0001;
      const lonJitter = (Math.random() - 0.5) * 0.0001;

      return processCheckIn(
        {
          sessionId: activeSession.id,
          studentId,
          qrToken: qrData.token,
          roomCode: activeSession.room_code,
          location: {
            latitude: activeSession.venue_lat + latJitter,
            longitude: activeSession.venue_lon + lonJitter,
            accuracy: 8.0,
            timestamp: Date.now()
          },
          camera: {
            isLiveCamera: true,
            sourceType: 'live_stream',
            photoDataUrl: 'data:image/jpeg;base64,' + 'B'.repeat(600),
            livenessPromptMet: true,
            clientTimestamp: Date.now()
          }
        },
        '192.168.1.100',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)',
        db
      );
    });

    const results = await Promise.all(promises);
    const durationMs = performance.now() - startTime;

    const successfulCheckIns = results.filter((r) => r.success && r.status === 'PRESENT');
    expect(successfulCheckIns.length).toBe(BATCH_SIZE);

    // Verify zero duplicates in database
    const dbCountRes = await db.query(
      `SELECT COUNT(*) as total_records, COUNT(DISTINCT student_id) as distinct_students
       FROM attendance_records 
       WHERE session_id = $1 AND student_id = ANY($2)`,
      [activeSession.id, studentIds]
    );

    const totalRecords = parseInt(dbCountRes.rows[0].total_records, 10);
    const distinctStudents = parseInt(dbCountRes.rows[0].distinct_students, 10);

    expect(totalRecords).toBe(BATCH_SIZE);
    expect(distinctStudents).toBe(BATCH_SIZE);

    const avgLatencyMs = Math.round(durationMs / BATCH_SIZE);
    console.log(`[LoadTest] ${BATCH_SIZE} check-ins completed in ${Math.round(durationMs)} ms (${avgLatencyMs} ms/op).`);

    // Second run: immediate re-submission must be rejected with DUPLICATE_REGISTRATION
    const duplicateSubmission = await processCheckIn(
      {
        sessionId: activeSession.id,
        studentId: studentIds[0],
        qrToken: qrData.token,
        roomCode: activeSession.room_code,
        location: {
          latitude: activeSession.venue_lat,
          longitude: activeSession.venue_lon,
          accuracy: 5.0
        },
        camera: {
          isLiveCamera: true,
          sourceType: 'live_stream',
          photoDataUrl: 'data:image/jpeg;base64,' + 'C'.repeat(600)
        }
      },
      '192.168.1.100',
      'Mozilla/5.0 (iPhone)',
      db
    );

    expect(duplicateSubmission.success).toBe(false);
    expect(duplicateSubmission.errorCode).toBe('DUPLICATE_REGISTRATION');
  }, 35000);
});
