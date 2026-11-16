# System Architecture

## 1. System Overview

The **Smart Classroom Attendance System** is an attendance verification platform engineered specifically for university environments (single institution, no multi-tenancy). It couples dynamic, time-rotating QR codes, surveyed geofence proximity checks, and live camera verification into an append-only academic register.

```
                         ┌──────────────────────────────────────────────┐
                         │           Classroom Projector Display        │
                         │  - Dynamic QR Code (HMAC-SHA256, 15s window) │
                         │  - 4-Digit Ephemeral Room Passcode (e.g 7492)│
                         │  - Course code & session expiration countdown│
                         └──────────────────────┬───────────────────────┘
                                                │ Scanned by phone
                                                ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               Student Mobile Device Browser                            │
│  - Acquires device GPS coordinates (within surveyed venue geofence radius)             │
│  - Enters ephemeral 4-digit room code displayed on screen                             │
│  - Captures live camera frame via MediaDevices.getUserMedia API (Gallery upload blocked│
│  - Bundles submission payload and posts to /api/v1/attendance/check-in                │
└───────────────────────────────────────────────┬────────────────────────────────────────┘
                                                │ HTTPS POST
                                                ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              University Backend API Server                             │
│  - Authenticates student JWT session & verifies active enrollment (R-05, R-06, R-18)   │
│  - Validates dynamic QR HMAC-SHA256 token against session secret (R-03)                │
│  - Validates ephemeral room passcode (R-04)                                            │
│  - Evaluates Haversine distance against surveyed venue geofence & accuracy (R-09, R-10)│
│  - Verifies live camera stream metadata & liveness prompt (R-12, R-13, R-14, R-15)    │
│  - Writes immutable audit events for every rule into verification_events               │
│  - If ALL checks pass: Writes record to append-only attendance_records (status: PRESENT│
│  - Records sanitized audit entry into append-only audit_logs (no tokens/coords/photos) │
└───────────────────────────────────────────────┬────────────────────────────────────────┘
                                                │
                                                ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              PostgreSQL Database (Supabase)                            │
│  - Append-only tables protected by PostgreSQL triggers:                                │
│      * attendance_records (UPDATE & DELETE permanently prohibited)                     │
│      * verification_events (UPDATE & DELETE permanently prohibited)                    │
│      * attendance_corrections (UPDATE & DELETE permanently prohibited)                 │
│      * audit_logs (UPDATE & DELETE permanently prohibited)                             │
│  - Atomic UNIQUE (session_id, student_id) constraint prevents duplicate check-ins      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Fundamental Security & Physical Presence Notice

> **Mandatory Rule (Specification Section 5 & Brief Section 2):**  
> Browsers and consumer mobile devices **cannot prove physical presence**. Geolocation APIs can be spoofed or degraded indoors, and camera streams can be manipulated. All automated check-in checks provide **corroborating evidence only**. The system surfaces this limitation in the administrator interface and documentation. High-stakes academic actions must allow lecturer review and audited corrections.

---

## 3. Dynamic Rotating QR Architecture

1. **HMAC Nonce:** Each attendance session creates a 32-byte cryptographic secret (`qr_secret`).
2. **Time Windows:** Time is quantised into discrete 15-second windows:
   $$\text{windowIndex} = \lfloor \text{epochSeconds} / 15 \rfloor$$
3. **Token Derivation:**
   $$\text{Token} = \text{HMAC-SHA256}(\text{qr\_secret}, \text{sessionId} + ":" + \text{windowIndex})[0..32]$$
4. **Validation:** The server recomputes the HMAC for the current window and previous tolerance windows ($\pm 1$ window) to accommodate network latency, using constant-time string comparison (`crypto.timingSafeEqual`).
5. **Anti-Proxy Protection:** Photographs or screenshots forwarded to students outside the lecture hall expire within 15 seconds. Combined with the surveyed venue geofence and ephemeral room code, remote proxy check-in is prevented.

---

## 4. Live Camera Pipeline & Anti-Gallery Restrictions

1. **Live Capture API Only:** The client captures frames solely through `navigator.mediaDevices.getUserMedia`.
2. **Zero File Upload:** The application contains **zero `<input type="file">` elements, zero dropzones, and zero file pickers**.
3. **API Validation:** The backend verification pipeline inspects camera submission metadata (`sourceType: 'live_stream'`, `isLiveCamera: true`) and rejects any request flagged as a file or gallery upload with error code `GALLERY_UPLOAD_PROHIBITED`.
4. **No Facial Recognition:** No biometric face geometry extraction, facial recognition models, or emotion tracking exist anywhere in the codebase. Photos serve solely as visual verification artifacts accessible exclusively to the assigned course lecturer and designated institutional auditors.

---

## 5. Append-Only Database Guarantees

The database engine enforces append-only immutability through PostgreSQL triggers attached to:
- `attendance_records`
- `verification_events`
- `attendance_corrections`
- `audit_logs`

Any attempted `UPDATE` or `DELETE` executed against these tables is rejected by the database engine with SQLSTATE `55000`:
```sql
CREATE OR REPLACE FUNCTION enforce_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Table "%" is strictly append-only. UPDATE and DELETE operations are permanently prohibited by database security policy.', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;
```

When an attendance record requires modification (e.g. following a student dispute), an entry is appended to `attendance_corrections` with a structured reason code and justification. The effective status is computed as a read-time projection of `attendance_records` + `attendance_corrections`.
