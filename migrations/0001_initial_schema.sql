-- ====================================================================
-- Smart Classroom Attendance System - Migration 0001: Initial Schema
-- PostgreSQL 14+ / Supabase compatible
-- ====================================================================

-- 1. Organizations & Academic Structure
CREATE TABLE IF NOT EXISTS institutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  faculty VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS academic_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. User Accounts & Roles
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  matric_or_staff_no VARCHAR(100) NOT NULL UNIQUE,
  role VARCHAR(50) NOT NULL CHECK (role IN ('ADMIN', 'LECTURER', 'STUDENT')),
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 3. Courses, Offerings & Enrollments
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  department_id UUID REFERENCES departments(id) ON DELETE RESTRICT,
  credit_units INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS course_offerings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  academic_term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE RESTRICT,
  lecturer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  semester VARCHAR(50) NOT NULL,
  section_code VARCHAR(50) NOT NULL DEFAULT 'A',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offerings_lecturer ON course_offerings(lecturer_id);

CREATE TABLE IF NOT EXISTS student_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_offering_id UUID NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  matric_number VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DROPPED', 'SUSPENDED')),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_enrollment_offering_student UNIQUE (course_offering_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollments_student ON student_enrollments(student_id);

-- 4. Venues & Surveyed Geofences
CREATE TABLE IF NOT EXISTS venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  building VARCHAR(255) NOT NULL,
  campus VARCHAR(255) NOT NULL DEFAULT 'Main Campus',
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  radius_meters DOUBLE PRECISION NOT NULL DEFAULT 40.0,
  max_accuracy_meters DOUBLE PRECISION NOT NULL DEFAULT 30.0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Attendance Sessions
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_offering_id UUID NOT NULL REFERENCES course_offerings(id) ON DELETE RESTRICT,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
  lecturer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  session_code VARCHAR(50) NOT NULL UNIQUE,
  room_code VARCHAR(10) NOT NULL,
  qr_secret VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED', 'CANCELLED')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  qr_interval_seconds INTEGER NOT NULL DEFAULT 15,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_offering ON attendance_sessions(course_offering_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON attendance_sessions(status);

-- 6. APPEND-ONLY TABLES (Enforced by Triggers & Grants)

-- 6a. attendance_records
CREATE TABLE IF NOT EXISTS attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES attendance_sessions(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status VARCHAR(50) NOT NULL CHECK (status IN ('PRESENT', 'FLAGGED', 'REJECTED', 'REVOKED')),
  verification_status VARCHAR(50) NOT NULL CHECK (verification_status IN ('WITHIN_BOUNDARY', 'INCONCLUSIVE', 'UNLOCATED', 'MANUAL_ENTRY', 'FAILED_VERIFICATION')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  photo_path TEXT,
  check_in_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_record_session_student UNIQUE (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_records_session ON attendance_records(session_id);
CREATE INDEX IF NOT EXISTS idx_records_student ON attendance_records(student_id);

-- 6b. verification_events
CREATE TABLE IF NOT EXISTS verification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES attendance_sessions(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  rule_code VARCHAR(50) NOT NULL,
  passed BOOLEAN NOT NULL,
  failure_code VARCHAR(100),
  confidence_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_session_student ON verification_events(session_id, student_id);

-- 6c. attendance_corrections
CREATE TABLE IF NOT EXISTS attendance_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_record_id UUID NOT NULL REFERENCES attendance_records(id) ON DELETE RESTRICT,
  previous_status VARCHAR(50) NOT NULL,
  new_status VARCHAR(50) NOT NULL,
  reason_code VARCHAR(100) NOT NULL,
  reason_detail TEXT NOT NULL,
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_corrections_record ON attendance_corrections(attendance_record_id);

-- 6d. audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role VARCHAR(50) NOT NULL,
  action VARCHAR(100) NOT NULL,
  target_entity VARCHAR(100) NOT NULL,
  target_id VARCHAR(100),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_hash VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- 7. IMMUTABILITY TRIGGER FUNCTION & BINDINGS
CREATE OR REPLACE FUNCTION enforce_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Table "%" is strictly append-only. UPDATE and DELETE operations are permanently prohibited by database security policy.', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_append_only_attendance_records ON attendance_records;
CREATE TRIGGER trg_append_only_attendance_records
  BEFORE UPDATE OR DELETE ON attendance_records
  FOR EACH ROW
  EXECUTE FUNCTION enforce_append_only();

DROP TRIGGER IF EXISTS trg_append_only_verification_events ON verification_events;
CREATE TRIGGER trg_append_only_verification_events
  BEFORE UPDATE OR DELETE ON verification_events
  FOR EACH ROW
  EXECUTE FUNCTION enforce_append_only();

DROP TRIGGER IF EXISTS trg_append_only_attendance_corrections ON attendance_corrections;
CREATE TRIGGER trg_append_only_attendance_corrections
  BEFORE UPDATE OR DELETE ON attendance_corrections
  FOR EACH ROW
  EXECUTE FUNCTION enforce_append_only();

DROP TRIGGER IF EXISTS trg_append_only_audit_logs ON audit_logs;
CREATE TRIGGER trg_append_only_audit_logs
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION enforce_append_only();
