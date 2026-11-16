# Security Architecture & Immutability Model

## 1. Non-Negotiable Rules & Verification Status

| Rule | Policy Requirement | Implementation & Verification |
| :--- | :--- | :--- |
| **No QR Scan = Present** | A student is never marked PRESENT merely because a QR code was scanned. | Server verification pipeline runs 18 checks (`R-01` to `R-18`). `PRESENT` requires 100% pass rate across mandatory rules. |
| **Server-Side Enforcement** | All attendance logic, permissions, and tokens run on server. | Frontend performs only UX checks; the server independently recalculates HMACs, distances, and enrollments. |
| **Presence Limitation** | Browsers cannot prove physical presence. | Surfaced permanently in the Admin UI header banner, System Status endpoint, and documentation. |
| **Zero Facial Recognition** | No facial recognition of any kind. | No face geometry, no biometric feature extraction, no facial models. Photos are visual corroboration only. |
| **Live Camera Only** | Photos captured only via live camera API. Gallery upload prohibited. | UI contains zero file input elements. Server rejects non-live payloads with `GALLERY_UPLOAD_PROHIBITED`. |
| **Append-Only Tables** | `attendance_records`, `verification_events`, `attendance_corrections`, `audit_logs` are append-only. | PostgreSQL triggers reject `UPDATE` and `DELETE` with SQLSTATE `55000`. Validated in `immutability.test.ts`. |
| **Student Write Immunity** | Students cannot create, edit, or delete attendance records directly. | Direct creation/mutation endpoints (`/records`) reject student callers with `403 FORBIDDEN`. Validated in `permissions.test.ts`. |
| **Lecturer Photo Scoping** | Lecturers see photos only for sessions they teach. | Endpoints inspect session ownership. External lecturers receive `403 FORBIDDEN`. Validated in `permissions.test.ts`. |
| **Sanitized Telemetry** | Logs never contain tokens, selfie images, or exact coordinates. | `sanitizeAuditDetails` explicitly redacts secrets, raw lat/lng, and base64 image data before DB insertion. |
| **Production Cleanliness**| Demo accounts exist only in development/staging. | Seed script evaluates `NODE_ENV === 'production'` and halts immediately before inserting synthetic accounts. |

---

## 2. Automated Immutability Verification Evidence

Automated tests in `server/tests/immutability.test.ts` execute direct SQL `UPDATE` and `DELETE` statements against all 4 append-only tables:

```
✓ tests/immutability.test.ts (5 tests)
  ✓ rejects UPDATE on attendance_records with append-only trigger exception (55000)
  ✓ rejects DELETE on attendance_records with append-only trigger exception
  ✓ rejects UPDATE and DELETE on verification_events
  ✓ rejects UPDATE and DELETE on attendance_corrections
  ✓ rejects UPDATE and DELETE on audit_logs
```

---

## 3. Scoped Photo Access Protocol

Student verification photos contain personal image data. Under Section 5 privacy requirements:
1. Photos are referenced by cryptographically randomized file paths, never predictable IDs.
2. Endpoint `GET /api/v1/attendance/sessions/:id/photos/:recordId` checks:
   - Is the caller an active Lecturer?
   - Is the lecturer explicitly assigned to `course_offerings.lecturer_id` for this session?
   - If not, return HTTP `403 FORBIDDEN` immediately.
3. Every photo inspection generates a permanent entry in `audit_logs` recording who inspected the photo.
