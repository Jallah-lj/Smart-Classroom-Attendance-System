# Design System & Interface Audit

## 1. Compliance Checklist (Section 3 of Brief)

| Guideline | Requirement | Audit & Implementation Verdict |
| :--- | :--- | :--- |
| **No Gradients or Glowing Blobs** | Avoid purple, indigo, or blue-to-pink gradients and glowing blobs. | **COMPLIANT:** Clean neutral-first surfaces (`bg-zinc-50` / `dark:bg-zinc-950`). Zero gradients or glowing background blobs used. |
| **No Hero Sections / 3-Card Columns** | Avoid generic marketing hero sections and 3-column feature cards. | **COMPLIANT:** Direct, task-focused institutional workspaces. Factual data tables and step-by-step flows only. |
| **No Emojis as Icons/Decoration** | Use Lucide icons only. | **COMPLIANT:** All icons rendered via `lucide-react` with consistent 1.5–1.75px stroke. Zero emojis in interface chrome. |
| **Realistic Entity Names** | No "John Doe", "Acme", or placeholder course names. | **COMPLIANT:** Authentic course codes (`CSC 3204 Computer Networks II`), venues (`Science Complex LT-2`), and realistic names (`Dr. Adeyemi Adeleke`, `Amina Bello`, `Chinedu Okafor`). |
| **Factual Microcopy** | No greetings like "Welcome back!". Use specific factual status. | **COMPLIANT:** Factual copy only: "2026/2027 Semester 1 · Africa/Kigali · Active Class Sessions". |
| **Restrained Hairline Borders** | Use hairline borders and restrained elevation instead of heavy shadows. | **COMPLIANT:** All panels and cards use `border border-zinc-200 dark:border-zinc-800` with subtle elevation. |
| **Typography & Tabular Numerals** | Single sans-serif (Inter) with `tabular-nums` on counts, times, percentages, and matric numbers. | **COMPLIANT:** Inter font applied document-wide; `tabular-nums font-mono` applied to all timestamps, room codes, student counts, and matric numbers. |
| **Status Badge Semantics** | Muted functional colors. Every status carries both text label AND icon. | **COMPLIANT:** Present (emerald + check icon), Flagged (orange + warning icon), Absent (zinc + X icon), Revoked (rose + alert icon). Color is never the sole indicator. |
| **High-Contrast Projector View** | Very large QR code, large room code (72px+), countdown timer, minimal chrome, no navigation. | **COMPLIANT:** Fullscreen black canvas, 96x96 QR container, 8xl room passcode, live countdown progress. |
| **Mobile-First Student Flow** | Step-by-step with plain-language explanations; full-bleed live camera stream; zero gallery uploads. | **COMPLIANT:** Steps for Location -> Room Code -> Live Camera (`getUserMedia` only; no `<input type="file">`). Calm success receipt with reference number. |
| **Dense Data Tables** | Sticky headers, sort/filter, row hover states, scannable for 400 rows. | **COMPLIANT:** High-density roster table with sticky header, live search, and status filtering. |
| **WCAG 2.2 AA Contrast** | All text, badges, and controls meet 4.5:1 contrast against backgrounds. | **COMPLIANT:** High-contrast neutral ink on light/dark backgrounds tested and validated. |

---

## 2. Screen Audit & Design Review

### Screen 1: Lecturer Projector View (`ProjectorView.tsx`)
- **Visuals:** High-contrast pitch-black backdrop (`#000000`), huge QR code (384px), prominent 4-digit room code in monospace 96px bold typeface.
- **Copy:** Factual: `CSC 3204: Computer Networks II`, `Science Complex Lecture Theatre 2`, `Ends at 11:30 AM`.
- **Deviations:** None.

### Screen 2: Student Mobile Check-In Flow (`StudentCheckIn.tsx`)
- **Visuals:** Single-column mobile card layout. Full-bleed video viewport accessing `MediaDevices.getUserMedia`. Live liveness prompt banner.
- **Camera Security:** Absolutely no file input element or drag-and-drop mechanism exists. Camera feed is validated live.
- **Result States:** Calm success receipt detailing Course Title, Recorded Timestamp, Status, and Reference ID (`ATT-XXXX-YYYY`). Failure state details exact Appendix A error code with plain next steps.
- **Deviations:** None.

### Screen 3: Lecturer Roster & Corrections Workspace (`RosterView.tsx`)
- **Visuals:** High-density data grid with sticky header, quick search input, and multi-state status filters.
- **Interaction:** Action buttons for viewing live camera photo (verifying lecturer course ownership) and opening audited correction dialog requiring structured reason code and justification.
- **Deviations:** None.

### Screen 4: Admin Audit Log & Geofence Directory (`AdminAuditView.tsx`)
- **Visuals:** Clean tabbed view showing real-time append-only audit trail with sanitized telemetry (zero tokens/coordinates logged) and surveyed venue geofences.
- **Mandatory Notice:** Permanent Section 5 presence limitation banner prominently pinned to header.
- **Deviations:** None.
