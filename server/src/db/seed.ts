import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { getDb, query } from './index.js';

export async function runSeed(dbClient?: any) {
  if (process.env.NODE_ENV === 'production') {
    console.log('[Seed] Production environment detected. Skipping synthetic demo data creation.');
    return;
  }

  console.log('[Seed] Starting idempotent seeding for development/staging...');
  const runQuery = dbClient ? (sql: string, params: any[]) => dbClient.query(sql, params) : query;

  // 1. Institution
  const instCheck = await runQuery('SELECT id FROM institutions WHERE code = $1', ['APEX-UNI']);
  let institutionId = instCheck.rows[0]?.id;
  if (!institutionId) {
    const res = await runQuery(
      `INSERT INTO institutions (name, code, settings) 
       VALUES ($1, $2, $3) RETURNING id`,
      [
        'Apex Institute of Science & Technology',
        'APEX-UNI',
        JSON.stringify({ timezone: 'Africa/Kigali', academicYear: '2026/2027' })
      ]
    );
    institutionId = res.rows[0].id;
  }

  // 2. Department
  const deptCheck = await runQuery('SELECT id FROM departments WHERE code = $1', ['CSE']);
  let departmentId = deptCheck.rows[0]?.id;
  if (!departmentId) {
    const res = await runQuery(
      `INSERT INTO departments (code, name, faculty) 
       VALUES ($1, $2, $3) RETURNING id`,
      ['CSE', 'Department of Computer Science & Engineering', 'Faculty of Information & Computing']
    );
    departmentId = res.rows[0].id;
  }

  // 3. Academic Term
  const termCheck = await runQuery('SELECT id FROM academic_terms WHERE code = $1', ['2026-TERM-1']);
  let termId = termCheck.rows[0]?.id;
  if (!termId) {
    const res = await runQuery(
      `INSERT INTO academic_terms (code, name, start_date, end_date, is_current) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['2026-TERM-1', '2026/2027 Semester 1', '2026-09-01', '2027-01-31', true]
    );
    termId = res.rows[0].id;
  }

  // 4. Password hash for demo users (cost factor 10 for fast test/seed execution)
  const passwordHash = await bcrypt.hash('ApexSecure@2026', 10);

  // 5. Users
  const demoUsers = [
    {
      email: 'admin@apex.edu',
      fullName: 'Dr. Folashade Adebayo',
      matricOrStaffNo: 'STF-2024-001',
      role: 'ADMIN'
    },
    {
      email: 'lecturer.adeleke@apex.edu',
      fullName: 'Dr. Adeyemi Adeleke',
      matricOrStaffNo: 'STF-2024-019',
      role: 'LECTURER'
    },
    {
      email: 'lecturer.habimana@apex.edu',
      fullName: 'Dr. Patrick Habimana',
      matricOrStaffNo: 'STF-2024-042',
      role: 'LECTURER'
    },
    {
      email: 'student.amina@apex.edu',
      fullName: 'Amina Bello',
      matricOrStaffNo: 'CSC/2023/1042',
      role: 'STUDENT'
    },
    {
      email: 'student.chinedu@apex.edu',
      fullName: 'Chinedu Okafor',
      matricOrStaffNo: 'CSC/2023/1088',
      role: 'STUDENT'
    },
    {
      email: 'student.zainab@apex.edu',
      fullName: 'Zainab Al-Mansoor',
      matricOrStaffNo: 'CSC/2023/1105',
      role: 'STUDENT'
    },
    {
      email: 'student.jean@apex.edu',
      fullName: 'Jean-Paul Mugisha',
      matricOrStaffNo: 'CSC/2023/1149',
      role: 'STUDENT'
    },
    {
      email: 'student.farah@apex.edu',
      fullName: 'Farah El-Sayed',
      matricOrStaffNo: 'CSC/2023/1190',
      role: 'STUDENT'
    }
  ];

  const userIds: Record<string, string> = {};
  for (const u of demoUsers) {
    const userRow = await runQuery('SELECT id FROM users WHERE email = $1', [u.email]);
    if (userRow.rows.length > 0) {
      userIds[u.email] = userRow.rows[0].id;
    } else {
      const res = await runQuery(
        `INSERT INTO users (email, password_hash, full_name, matric_or_staff_no, role, department_id, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id`,
        [u.email, passwordHash, u.fullName, u.matricOrStaffNo, u.role, departmentId]
      );
      userIds[u.email] = res.rows[0].id;
    }
  }

  // 6. Course: CSC 3204 Computer Networks II
  const courseCheck = await runQuery('SELECT id FROM courses WHERE code = $1', ['CSC 3204']);
  let courseId = courseCheck.rows[0]?.id;
  if (!courseId) {
    const res = await runQuery(
      `INSERT INTO courses (code, title, department_id, credit_units)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      ['CSC 3204', 'Computer Networks II', departmentId, 3]
    );
    courseId = res.rows[0].id;
  }

  // 7. Course Offering
  const offeringCheck = await runQuery(
    'SELECT id FROM course_offerings WHERE course_id = $1 AND academic_term_id = $2',
    [courseId, termId]
  );
  let offeringId = offeringCheck.rows[0]?.id;
  if (!offeringId) {
    const res = await runQuery(
      `INSERT INTO course_offerings (course_id, academic_term_id, lecturer_id, semester, section_code)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [courseId, termId, userIds['lecturer.adeleke@apex.edu'], 'Semester 1', 'A']
    );
    offeringId = res.rows[0].id;
  }

  // 8. Enrollments
  const studentEmails = [
    'student.amina@apex.edu',
    'student.chinedu@apex.edu',
    'student.zainab@apex.edu',
    'student.jean@apex.edu',
    'student.farah@apex.edu'
  ];

  for (const email of studentEmails) {
    const studentId = userIds[email];
    const userObj = demoUsers.find((d) => d.email === email)!;
    const enrollCheck = await runQuery(
      'SELECT id FROM student_enrollments WHERE course_offering_id = $1 AND student_id = $2',
      [offeringId, studentId]
    );
    if (enrollCheck.rows.length === 0) {
      await runQuery(
        `INSERT INTO student_enrollments (course_offering_id, student_id, matric_number, status)
         VALUES ($1, $2, $3, 'ACTIVE')`,
        [offeringId, studentId, userObj.matricOrStaffNo]
      );
    }
  }

  // 9. Venue: Science Complex LT-2
  const venueCheck = await runQuery('SELECT id FROM venues WHERE code = $1', ['LT-2']);
  let venueId = venueCheck.rows[0]?.id;
  if (!venueId) {
    const res = await runQuery(
      `INSERT INTO venues (code, name, building, campus, latitude, longitude, radius_meters, max_accuracy_meters, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true) RETURNING id`,
      ['LT-2', 'Science Complex Lecture Theatre 2', 'Faculty of Science Complex', 'Main Campus', -1.9441, 30.0619, 45.0, 30.0]
    );
    venueId = res.rows[0].id;
  }

  // 10. Open Attendance Session
  const sessionCheck = await runQuery('SELECT id FROM attendance_sessions WHERE session_code = $1', ['SESS-CSC3204-W8']);
  let sessionId = sessionCheck.rows[0]?.id;
  if (!sessionId) {
    const qrSecret = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const startsAt = new Date(now.getTime() - 10 * 60 * 1000); // started 10m ago
    const endsAt = new Date(now.getTime() + 80 * 60 * 1000); // ends in 80m

    const res = await runQuery(
      `INSERT INTO attendance_sessions 
       (course_offering_id, venue_id, lecturer_id, session_code, room_code, qr_secret, status, starts_at, ends_at, qr_interval_seconds)
       VALUES ($1, $2, $3, $4, $5, $6, 'OPEN', $7, $8, 15) RETURNING id`,
      [
        offeringId,
        venueId,
        userIds['lecturer.adeleke@apex.edu'],
        'SESS-CSC3204-W8',
        '7492',
        qrSecret,
        startsAt.toISOString(),
        endsAt.toISOString()
      ]
    );
    sessionId = res.rows[0].id;

    // Seed one verified attendance record for Amina Bello
    const aminaId = userIds['student.amina@apex.edu'];
    const recCheck = await runQuery(
      'SELECT id FROM attendance_records WHERE session_id = $1 AND student_id = $2',
      [sessionId, aminaId]
    );
    if (recCheck.rows.length === 0) {
      const recRes = await runQuery(
        `INSERT INTO attendance_records 
         (session_id, student_id, status, verification_status, photo_path, check_in_metadata)
         VALUES ($1, $2, 'PRESENT', 'WITHIN_BOUNDARY', 'storage/selfies/demo_amina.jpg', $3)
         RETURNING id`,
        [
          sessionId,
          aminaId,
          JSON.stringify({
            verified_at: startsAt.toISOString(),
            distance_meters: 12.4,
            accuracy_meters: 8.5,
            verification_checks: 18,
            client_platform: 'Mobile Safari 17.4 (iOS)'
          })
        ]
      );
      const recordId = recRes.rows[0].id;

      // Verification event for Amina
      await runQuery(
        `INSERT INTO verification_events (session_id, student_id, rule_code, passed, confidence_data)
         VALUES ($1, $2, 'R-10', true, $3)`,
        [sessionId, aminaId, JSON.stringify({ distance_meters: 12.4, radius: 45.0 })]
      );

      // Audit log entry
      await runQuery(
        `INSERT INTO audit_logs (actor_id, actor_role, action, target_entity, target_id, details, ip_hash)
         VALUES ($1, 'STUDENT', 'ATTENDANCE_CHECK_IN', 'attendance_records', $2, $3, $4)`,
        [
          aminaId,
          recordId,
          JSON.stringify({ session_code: 'SESS-CSC3204-W8', status: 'PRESENT' }),
          crypto.createHash('sha256').update('192.0.2.14').digest('hex')
        ]
      );
    }
  }

  console.log('[Seed] Seeding completed successfully.');
  console.log('[Seed] Demo accounts available (password: "ApexSecure@2026"):');
  console.log('       - Admin:    admin@apex.edu');
  console.log('       - Lecturer: lecturer.adeleke@apex.edu (CSC 3204)');
  console.log('       - Lecturer: lecturer.habimana@apex.edu (Other course)');
  console.log('       - Student:  student.amina@apex.edu');
  console.log('       - Student:  student.chinedu@apex.edu');
}

// Standalone execution
if (process.argv[1]?.endsWith('seed.ts')) {
  getDb().then(() => runSeed()).then(() => process.exit(0)).catch(err => {
    console.error('[Seed] Error during seeding:', err);
    process.exit(1);
  });
}
