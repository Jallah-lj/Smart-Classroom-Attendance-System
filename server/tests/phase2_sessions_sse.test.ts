import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/index.js';
import { getDb } from '../src/db/index.js';
import { runSeed } from '../src/db/seed.js';
import { config } from '../src/config/index.js';
import { generateSessionQrToken } from '../src/lib/qr.js';

describe('Phase 2: Live Dynamic QR Streaming & Session Lifecycle', () => {
  let db: any;
  let courseLecturerToken: string;
  let otherLecturerToken: string;
  let studentToken: string;
  let sessionId: string;
  let courseOfferingId: string;
  let venueId: string;
  let studentId: string;

  beforeAll(async () => {
    db = await getDb();
    await runSeed(db);

    const users = await db.query('SELECT * FROM users');
    const courseLecturer = users.rows.find((u: any) => u.email === 'lecturer.adeleke@apex.edu');
    const otherLecturer = users.rows.find((u: any) => u.email === 'lecturer.habimana@apex.edu');
    const student = users.rows.find((u: any) => u.email === 'student.chinedu@apex.edu');
    studentId = student.id;

    const signToken = (u: any) =>
      jwt.sign(
        {
          id: u.id,
          email: u.email,
          role: u.role,
          fullName: u.full_name,
          matricOrStaffNo: u.matric_or_staff_no
        },
        config.jwtSecret,
        { expiresIn: '1h' }
      );

    courseLecturerToken = signToken(courseLecturer);
    otherLecturerToken = signToken(otherLecturer);
    studentToken = signToken(student);

    const sessionRes = await db.query(
      "SELECT s.*, v.id as v_id FROM attendance_sessions s JOIN venues v ON s.venue_id = v.id WHERE s.session_code = 'SESS-CSC3204-W8'"
    );
    sessionId = sessionRes.rows[0].id;
    courseOfferingId = sessionRes.rows[0].course_offering_id;
    venueId = sessionRes.rows[0].v_id;
  });

  it('allows assigned lecturer to rotate room passcode', async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/rotate-room-code`)
      .set('Authorization', `Bearer ${courseLecturerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.roomCode).toMatch(/^\d{4}$/);
  });

  it('rejects external lecturer with 403 when trying to rotate room passcode', async () => {
    const res = await request(app)
      .post(`/api/v1/sessions/${sessionId}/rotate-room-code`)
      .set('Authorization', `Bearer ${otherLecturerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('allows assigned lecturer to close session and prevents subsequent check-ins', async () => {
    // 1. Close session
    const closeRes = await request(app)
      .post(`/api/v1/sessions/${sessionId}/close`)
      .set('Authorization', `Bearer ${courseLecturerToken}`);

    expect(closeRes.status).toBe(200);

    // 2. Attempt check-in on closed session
    const qrData = generateSessionQrToken(sessionId, 'any-secret', 15);
    const checkInRes = await request(app)
      .post('/api/v1/attendance/check-in')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        sessionId,
        qrToken: qrData.token,
        roomCode: '7492',
        location: { latitude: 0, longitude: 0, accuracy: 10 },
        camera: {
          isLiveCamera: true,
          sourceType: 'live_stream',
          photoDataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(800)
        }
      });

    expect(checkInRes.status).toBe(400);
    expect(checkInRes.body.error).toBe('SESSION_NOT_ACTIVE');

    // 3. Re-open session
    const openRes = await request(app)
      .post(`/api/v1/sessions/${sessionId}/open`)
      .set('Authorization', `Bearer ${courseLecturerToken}`);

    expect(openRes.status).toBe(200);
  });

  it('rejects external lecturer from streaming session QR events', async () => {
    const res = await request(app)
      .get(`/api/v1/sessions/${sessionId}/stream`)
      .set('Authorization', `Bearer ${otherLecturerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('allows lecturer to create a new session with custom duration', async () => {
    const res = await request(app)
      .post('/api/v1/sessions')
      .set('Authorization', `Bearer ${courseLecturerToken}`)
      .send({
        courseOfferingId,
        venueId,
        durationMinutes: 120
      });

    expect(res.status).toBe(201);
    expect(res.body.session).toBeDefined();
    expect(res.body.session.status).toBe('OPEN');
    expect(res.body.session.room_code).toMatch(/^\d{4}$/);
  });
});
