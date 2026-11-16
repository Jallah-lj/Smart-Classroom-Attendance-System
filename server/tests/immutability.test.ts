import { describe, it, expect, beforeAll } from 'vitest';
import { getTestDb } from '../src/db/index.js';
import crypto from 'node:crypto';

describe('Database Immutability & Append-Only Triggers', () => {
  let db: any;

  beforeAll(async () => {
    db = await getTestDb();
  });

  it('rejects UPDATE on attendance_records with append-only trigger exception (55000)', async () => {
    // 1. Setup minimal relational rows
    const inst = await db.query(
      "INSERT INTO institutions (name, code) VALUES ('Apex', 'APEX') RETURNING id"
    );
    const dept = await db.query(
      "INSERT INTO departments (code, name, faculty) VALUES ('CS', 'CS', 'Eng') RETURNING id"
    );
    const term = await db.query(
      "INSERT INTO academic_terms (code, name, start_date, end_date) VALUES ('T1', 'T1', '2026-01-01', '2026-12-31') RETURNING id"
    );
    const lecturer = await db.query(
      "INSERT INTO users (email, password_hash, full_name, matric_or_staff_no, role) VALUES ('lec@apex.edu', 'hash', 'Lecturer', 'STF-1', 'LECTURER') RETURNING id"
    );
    const student = await db.query(
      "INSERT INTO users (email, password_hash, full_name, matric_or_staff_no, role) VALUES ('stu@apex.edu', 'hash', 'Student', 'MAT-1', 'STUDENT') RETURNING id"
    );
    const course = await db.query(
      "INSERT INTO courses (code, title, department_id) VALUES ('CSC 3204', 'Net II', $1) RETURNING id",
      [dept.rows[0].id]
    );
    const offering = await db.query(
      "INSERT INTO course_offerings (course_id, academic_term_id, lecturer_id, semester) VALUES ($1, $2, $3, 'S1') RETURNING id",
      [course.rows[0].id, term.rows[0].id, lecturer.rows[0].id]
    );
    const venue = await db.query(
      "INSERT INTO venues (code, name, building, latitude, longitude) VALUES ('LT1', 'LT1', 'Main', 0.0, 0.0) RETURNING id"
    );
    const session = await db.query(
      `INSERT INTO attendance_sessions (course_offering_id, venue_id, lecturer_id, session_code, room_code, qr_secret, starts_at, ends_at)
       VALUES ($1, $2, $3, 'SESS-IMM-1', '1234', 'secret', now(), now() + interval '1 hour') RETURNING id`,
      [offering.rows[0].id, venue.rows[0].id, lecturer.rows[0].id]
    );

    // Insert an attendance record
    const record = await db.query(
      `INSERT INTO attendance_records (session_id, student_id, status, verification_status)
       VALUES ($1, $2, 'PRESENT', 'WITHIN_BOUNDARY') RETURNING id`,
      [session.rows[0].id, student.rows[0].id]
    );
    const recordId = record.rows[0].id;

    // Attempt UPDATE -> Expect Failure
    let errorCaught: any = null;
    try {
      await db.query("UPDATE attendance_records SET status = 'REVOKED' WHERE id = $1", [recordId]);
    } catch (err: any) {
      errorCaught = err;
    }

    expect(errorCaught).not.toBeNull();
    expect(errorCaught.message).toMatch(/strictly append-only/);
  });

  it('rejects DELETE on attendance_records with append-only trigger exception', async () => {
    const student = await db.query("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1");
    const session = await db.query("SELECT id FROM attendance_sessions LIMIT 1");
    const record = await db.query(
      "SELECT id FROM attendance_records WHERE session_id = $1 AND student_id = $2",
      [session.rows[0].id, student.rows[0].id]
    );
    const recordId = record.rows[0].id;

    let errorCaught: any = null;
    try {
      await db.query("DELETE FROM attendance_records WHERE id = $1", [recordId]);
    } catch (err: any) {
      errorCaught = err;
    }

    expect(errorCaught).not.toBeNull();
    expect(errorCaught.message).toMatch(/strictly append-only/);
  });

  it('rejects UPDATE and DELETE on verification_events', async () => {
    const session = await db.query("SELECT id FROM attendance_sessions LIMIT 1");
    const student = await db.query("SELECT id FROM users WHERE role = 'STUDENT' LIMIT 1");

    const event = await db.query(
      `INSERT INTO verification_events (session_id, student_id, rule_code, passed)
       VALUES ($1, $2, 'R-10', true) RETURNING id`,
      [session.rows[0].id, student.rows[0].id]
    );
    const eventId = event.rows[0].id;

    // UPDATE attempt
    let updateErr: any = null;
    try {
      await db.query("UPDATE verification_events SET passed = false WHERE id = $1", [eventId]);
    } catch (err: any) {
      updateErr = err;
    }
    expect(updateErr).not.toBeNull();
    expect(updateErr.message).toMatch(/strictly append-only/);

    // DELETE attempt
    let deleteErr: any = null;
    try {
      await db.query("DELETE FROM verification_events WHERE id = $1", [eventId]);
    } catch (err: any) {
      deleteErr = err;
    }
    expect(deleteErr).not.toBeNull();
    expect(deleteErr.message).toMatch(/strictly append-only/);
  });

  it('rejects UPDATE and DELETE on attendance_corrections', async () => {
    const record = await db.query("SELECT id FROM attendance_records LIMIT 1");
    const lecturer = await db.query("SELECT id FROM users WHERE role = 'LECTURER' LIMIT 1");

    const corr = await db.query(
      `INSERT INTO attendance_corrections 
       (attendance_record_id, previous_status, new_status, reason_code, reason_detail, requested_by)
       VALUES ($1, 'PRESENT', 'REVOKED', 'STUDENT_DISPUTE_UPHELD', 'Observed departure at 10:15', $2) RETURNING id`,
      [record.rows[0].id, lecturer.rows[0].id]
    );
    const corrId = corr.rows[0].id;

    // UPDATE attempt
    let updateErr: any = null;
    try {
      await db.query("UPDATE attendance_corrections SET reason_code = 'MODIFIED' WHERE id = $1", [corrId]);
    } catch (err: any) {
      updateErr = err;
    }
    expect(updateErr).not.toBeNull();
    expect(updateErr.message).toMatch(/strictly append-only/);

    // DELETE attempt
    let deleteErr: any = null;
    try {
      await db.query("DELETE FROM attendance_corrections WHERE id = $1", [corrId]);
    } catch (err: any) {
      deleteErr = err;
    }
    expect(deleteErr).not.toBeNull();
    expect(deleteErr.message).toMatch(/strictly append-only/);
  });

  it('rejects UPDATE and DELETE on audit_logs', async () => {
    const log = await db.query(
      `INSERT INTO audit_logs (actor_role, action, target_entity, details)
       VALUES ('ADMIN', 'SECURITY_CHECK', 'system', '{"check": true}'::jsonb) RETURNING id`
    );
    const logId = log.rows[0].id;

    // UPDATE attempt
    let updateErr: any = null;
    try {
      await db.query("UPDATE audit_logs SET action = 'ALTERED' WHERE id = $1", [logId]);
    } catch (err: any) {
      updateErr = err;
    }
    expect(updateErr).not.toBeNull();
    expect(updateErr.message).toMatch(/strictly append-only/);

    // DELETE attempt
    let deleteErr: any = null;
    try {
      await db.query("DELETE FROM audit_logs WHERE id = $1", [logId]);
    } catch (err: any) {
      deleteErr = err;
    }
    expect(deleteErr).not.toBeNull();
    expect(deleteErr.message).toMatch(/strictly append-only/);
  });
});
