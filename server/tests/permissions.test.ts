import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/index.js';
import { getDb } from '../src/db/index.js';
import { runSeed } from '../src/db/seed.js';
import { config } from '../src/config/index.js';

describe('Role-Based Access Control & Negative Permission Tests', () => {
  let db: any;
  let adminToken: string;
  let courseLecturerToken: string;
  let otherLecturerToken: string;
  let studentToken: string;

  let sessionId: string;
  let recordId: string;

  beforeAll(async () => {
    db = await getDb();
    await runSeed(db);

    const users = await db.query('SELECT * FROM users');
    const admin = users.rows.find((u: any) => u.email === 'admin@apex.edu');
    const courseLecturer = users.rows.find((u: any) => u.email === 'lecturer.adeleke@apex.edu');
    const otherLecturer = users.rows.find((u: any) => u.email === 'lecturer.habimana@apex.edu');
    const student = users.rows.find((u: any) => u.email === 'student.amina@apex.edu');

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

    adminToken = signToken(admin);
    courseLecturerToken = signToken(courseLecturer);
    otherLecturerToken = signToken(otherLecturer);
    studentToken = signToken(student);

    const sessionRes = await db.query(
      "SELECT id FROM attendance_sessions WHERE session_code = 'SESS-CSC3204-W8'"
    );
    sessionId = sessionRes.rows[0].id;

    const recordRes = await db.query(
      'SELECT id FROM attendance_records WHERE session_id = $1 LIMIT 1',
      [sessionId]
    );
    recordId = recordRes.rows[0].id;
  });

  // 1. Direct record creation / mutation attempts by student
  describe('Student Immutability & Permission Restrictions', () => {
    it('returns 403 when student calls direct record creation endpoint POST /api/v1/attendance/records', async () => {
      const res = await request(app)
        .post('/api/v1/attendance/records')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          sessionId,
          studentId: 'some-student',
          status: 'PRESENT'
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });

    it('returns 403 when student calls PUT /api/v1/attendance/records/:id', async () => {
      const res = await request(app)
        .put(`/api/v1/attendance/records/${recordId}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ status: 'PRESENT' });

      expect(res.status).toBe(403);
    });

    it('returns 403 when student calls DELETE /api/v1/attendance/records/:id', async () => {
      const res = await request(app)
        .delete(`/api/v1/attendance/records/${recordId}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });

    it('returns 403 when student tries to create a session', async () => {
      const res = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ courseOfferingId: '...', venueId: '...' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });

    it('returns 403 when student tries to access admin audit logs', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });
  });

  // 2. Lecturer course-scoping: Lecturers see photos ONLY for courses they teach
  describe('Lecturer Course Scoping & Photo Access', () => {
    it('allows course lecturer who teaches the session to view verification photo', async () => {
      const res = await request(app)
        .get(`/api/v1/attendance/sessions/${sessionId}/photos/${recordId}`)
        .set('Authorization', `Bearer ${courseLecturerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.recordId).toBe(recordId);
      expect(res.body.photoUrl).toBeDefined();
    });

    it('REJECTS lecturer from another course with 403 when attempting to view photo', async () => {
      const res = await request(app)
        .get(`/api/v1/attendance/sessions/${sessionId}/photos/${recordId}`)
        .set('Authorization', `Bearer ${otherLecturerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
      expect(res.body.message).toMatch(/only access student verification photos for sessions they teach/);
    });

    it('allows Admin to view photo across sessions', async () => {
      const res = await request(app)
        .get(`/api/v1/attendance/sessions/${sessionId}/photos/${recordId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.recordId).toBe(recordId);
    });

    it('REJECTS other lecturer with 403 when attempting to view session roster', async () => {
      const res = await request(app)
        .get(`/api/v1/attendance/sessions/${sessionId}/roster`)
        .set('Authorization', `Bearer ${otherLecturerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });
  });

  // 3. Unauthenticated requests
  describe('Unauthenticated Access Guards', () => {
    it('returns 401 when accessing protected endpoints without token', async () => {
      const res1 = await request(app).get('/api/v1/sessions');
      expect(res1.status).toBe(401);

      const res2 = await request(app).post('/api/v1/attendance/check-in').send({});
      expect(res2.status).toBe(401);

      const res3 = await request(app).get('/api/v1/admin/audit-logs');
      expect(res3.status).toBe(401);
    });
  });
});
