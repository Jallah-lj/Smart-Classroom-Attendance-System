# Data Model & Relational Schema

## 1. Entity Overview

The schema is fully normalized and implemented in PostgreSQL 14+ (tested on PostgreSQL 17/18 and Supabase).

| Table Name | Primary Key | Mutability | Description |
| :--- | :--- | :--- | :--- |
| `institutions` | UUID | Mutable | University settings and metadata |
| `departments` | UUID | Mutable | Academic departments within faculties |
| `academic_terms` | UUID | Mutable | Semesters and academic sessions |
| `users` | UUID | Mutable | Admin, Lecturer, and Student accounts |
| `courses` | UUID | Mutable | Course catalogue (e.g. CSC 3204) |
| `course_offerings` | UUID | Mutable | Course assigned to lecturer in a specific term |
| `student_enrollments` | UUID | Mutable | Student enrollment in an offering (ACTIVE, DROPPED) |
| `venues` | UUID | Mutable | Surveyed venues with latitude, longitude & radius |
| `attendance_sessions` | UUID | Mutable | Live/closed lecture attendance sessions |
| `attendance_records` | UUID | **APPEND-ONLY** | Final check-in result (PRESENT, FLAGGED, REVOKED) |
| `verification_events` | UUID | **APPEND-ONLY** | Audit of each rule check (R-01..R-18) |
| `attendance_corrections`| UUID | **APPEND-ONLY** | Audited status adjustments with justification |
| `audit_logs` | UUID | **APPEND-ONLY** | Sanitized administrative & security audit trail |

---

## 2. Table Specifications

### `attendance_records` (Append-Only)
- `id` (UUID, PK)
- `session_id` (UUID, FK -> `attendance_sessions.id`)
- `student_id` (UUID, FK -> `users.id`)
- `status` (`PRESENT`, `FLAGGED`, `REJECTED`, `REVOKED`)
- `verification_status` (`WITHIN_BOUNDARY`, `INCONCLUSIVE`, `UNLOCATED`, `MANUAL_ENTRY`, `FAILED_VERIFICATION`)
- `recorded_at` (TIMESTAMPTZ)
- `photo_path` (TEXT)
- `check_in_metadata` (JSONB)
- `created_at` (TIMESTAMPTZ)
- `CONSTRAINT uq_record_session_student UNIQUE (session_id, student_id)`

### `verification_events` (Append-Only)
- `id` (UUID, PK)
- `session_id` (UUID, FK -> `attendance_sessions.id`)
- `student_id` (UUID, FK -> `users.id`)
- `rule_code` (VARCHAR, e.g. 'R-01', 'R-10')
- `passed` (BOOLEAN)
- `failure_code` (VARCHAR)
- `confidence_data` (JSONB - distance in meters, accuracy, latency; **never raw lat/lon**)
- `created_at` (TIMESTAMPTZ)

### `attendance_corrections` (Append-Only)
- `id` (UUID, PK)
- `attendance_record_id` (UUID, FK -> `attendance_records.id`)
- `previous_status` (VARCHAR)
- `new_status` (VARCHAR)
- `reason_code` (`STUDENT_DISPUTE_UPHELD`, `LECTURER_OBSERVED_LEAVING`, `DEVICE_FAILURE_OVERRIDE`, `MEDICAL_EXCUSE`, `ADMINISTRATIVE_CORRECTION`)
- `reason_detail` (TEXT, mandatory justification)
- `requested_by` (UUID, FK -> `users.id`)
- `approved_by` (UUID, FK -> `users.id`)
- `created_at` (TIMESTAMPTZ)

### `audit_logs` (Append-Only)
- `id` (UUID, PK)
- `actor_id` (UUID, FK -> `users.id`, NULL for system)
- `actor_role` (VARCHAR)
- `action` (VARCHAR)
- `target_entity` (VARCHAR)
- `target_id` (VARCHAR)
- `details` (JSONB - sanitized; tokens, coordinates, and photo binaries are permanently stripped)
- `ip_hash` (VARCHAR(64), SHA-256 hash of client IP)
- `user_agent` (TEXT)
- `created_at` (TIMESTAMPTZ)

---

## 3. Effective Attendance Status Projection

Because `attendance_records` cannot be updated, the effective status of any record is computed deterministically at query time:

$$\text{EffectiveStatus}(recordId) = \text{Latest}(\text{attendance\_corrections.new\_status}) \;\Big|\; \text{attendance\_records.status}$$

This preserves 100% audit durability: the original check-in evidence remains intact forever, and any administrative correction is durably stamped with who made it, when, and why.
