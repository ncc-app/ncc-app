# Data Model — Firestore Collections

All persistent data is stored in **Cloud Firestore** under the project `ncc-app-200cdt`.

## Currently Implemented

---

### `users/{uid}`

**Purpose**: Core user records for authenticated users (cadets, admins, superadmins).
**Identifier**: Firebase Auth UID.
**Ownership**: User owns their record; admins can update; superadmins can delete.

| Field              | Type         | Notes                                       |
| ------------------ | ------------ | ------------------------------------------- |
| `uid`              | string       | Firebase Auth UID                           |
| `email`            | string       |                                             |
| `name`             | string       |                                             |
| `role`             | string       | `member`, `admin`, `superadmin`, `alumni`   |
| `status`           | string       | `pending`, `active`, `inactive`, `rejected` |
| `createdAt`        | string (ISO) |                                             |
| `approvedAt`       | string (ISO) | Optional                                    |
| `approvedBy`       | string       | Optional — UID of approving admin           |
| `dateOfBirth`      | string       | Members only                                |
| `registerNumber`   | string       | Members only                                |
| `division`         | string       | `SD` or `SW`                                |
| `regimentalNumber` | string       | Members only                                |
| `dateOfEnrollment` | string       | Members only                                |
| `rank`             | string       | e.g., `CDT`, `LCPL`                         |
| `nccYear`          | string       | `1st Year`, `2nd Year`, `3rd Year`          |
| `year`             | string       | Academic year                               |
| `department`       | string       | Department code                             |
| `rollNo`           | string       | College roll number                         |
| `phone`            | string       | Members only                                |
| `bloodGroup`       | string       | Members only                                |
| `address`          | string       | Members only                                |

**Subcollection**: `users/{uid}/readAnnouncements/{announcementId}` — tracks which announcements a user has read.

---

### `pendingCadets/{candidateId}`

**Purpose**: Registration queue for new cadets awaiting admin approval.
**Identifier**: Auto-generated.
**Lifecycle**: Created on registration → approved (moved to `users`) or rejected (deleted).
**Security**: Unauthenticated users can create (write-once). Admins can read/update/delete.

| Field            | Type    | Notes                           |
| ---------------- | ------- | ------------------------------- |
| `uid`            | string  | Firebase Auth UID of registrant |
| `email`          | string  |                                 |
| `name`           | string  |                                 |
| `emailVerified`  | boolean | Synced from Firebase Auth       |
| _(cadet fields)_ | various | Same fields as users collection |

---

### `takenNumbers/{numberId}`

**Purpose**: Public registry for unique ID numbers to prevent duplicates (regimental, register, roll numbers).
**Identifier**: The number itself (e.g., `TN20SDA123456`).
**Security**: Public read. Authenticated users can create/delete their own entries.

| Field  | Type   | Notes                  |
| ------ | ------ | ---------------------- |
| `uid`  | string | Owner's UID            |
| `type` | string | Number type identifier |

---

### `attendanceSessions/{sessionId}`

**Purpose**: Attendance session records.
**Identifier**: Auto-generated.
**Security**: Authenticated read. Admin/superadmin write.

| Field         | Type         | Notes                   |
| ------------- | ------------ | ----------------------- |
| `title`       | string       | Session name            |
| `date`        | string       | Session date            |
| `year`        | string       | NCC year filter         |
| `division`    | string       | Division filter         |
| `divisionId`  | string       | Used in composite index |
| `nccYear`     | string       | Used in composite index |
| `createdAt`   | string (ISO) |                         |
| `locked`      | boolean      | Prevents further edits  |
| `totalCadets` | number       | Count of marked cadets  |

**Subcollection**: `attendanceSessions/{sessionId}/marks/{markId}` — individual attendance marks.

| Field       | Type         | Notes                         |
| ----------- | ------------ | ----------------------------- |
| `sessionId` | string       | Parent session                |
| `cadetId`   | string       | User UID                      |
| `status`    | string       | `P` (present) or `A` (absent) |
| `timestamp` | string (ISO) |                               |

---

### `cadetAttendanceStats/{cadetId}`

**Purpose**: Computed per-cadet attendance statistics.
**Identifier**: User UID.
**Security**: Owner can read their own; admins read all; admins write.

---

### `events/{eventId}`

**Purpose**: NCC events (camps, parades, training, competitions, national days, social work).
**Security**: Public read. Admin/superadmin write.

| Field         | Type   | Notes                                                                               |
| ------------- | ------ | ----------------------------------------------------------------------------------- |
| `title`       | string |                                                                                     |
| `type`        | string | `camp`, `parade`, `training`, `competition`, `social_work`, `national_day`, `other` |
| `startAt`     | string |                                                                                     |
| `endAt`       | string |                                                                                     |
| `location`    | string |                                                                                     |
| `capacity`    | number | Optional                                                                            |
| `description` | string | Optional                                                                            |

---

### `gallery/{albumId}` + `gallery/{albumId}/photos/{photoId}`

**Purpose**: Photo gallery with album grouping.
**Security**: Public read. Admin/superadmin write.

---

### `announcements/{announcementId}`

**Purpose**: Announcements with visibility control and read tracking.
**Security**: Public announcements readable by anyone; `auth_only` by authenticated users. Admin/superadmin write.

**Subcollection**: `announcements/{announcementId}/reads/{userId}` — read receipts.

---

### `alumniProfiles/{profileId}`

**Purpose**: Alumni directory profiles (public-facing).
**Lifecycle**: Self-submitted as `pending` + `visible: false` → superadmin approves → `active` + `visible: true`.
**Security**: Public read only for `active` + `visible: true`. Superadmin full access.

---

### `alumni/{alumniId}`

**Purpose**: Legacy alumni records from year rollover.
**Identifier**: Former user UID.
**Security**: Public read. Owner or superadmin write.

---

### `cms/{docId}`

**Purpose**: CMS-managed content pages (About, Contact, Unit Structure, etc.).
**Security**: Public read. Admin/superadmin write.

| Field        | Type         | Notes                               |
| ------------ | ------------ | ----------------------------------- |
| `title`      | string       |                                     |
| `sections`   | array        | `{ heading: string, body: string }` |
| `updatedAt`  | string (ISO) |                                     |
| `updatedBy`  | string       |                                     |
| `visibility` | string       | `public` or `private`               |

---

### `settings/{docId}`

**Purpose**: Application configuration (rollover dates, recruitment settings, GitHub integration).
**Notable documents**: `recruitment` (public read), `github` (contains PAT — admin only).
**Security**: `recruitment` document is public read. All others admin/superadmin only.

---

### `duties/{dutyId}`

**Purpose**: Duty assignments for cadets.
**Security**: Authenticated read. Admin/superadmin write.

---

### `eventDrives/{driveId}`

**Purpose**: Event drive polling (opt-in/opt-out) for camps, volunteering, firing selection, etc.
**Identifier**: Auto-generated.
**Security**: Authenticated read. Admin/superadmin write.
**Lifecycle**: Created by admin → cadets respond → admin closes → deleted during year rollover.

| Field              | Type         | Notes                                                     |
| ------------------ | ------------ | --------------------------------------------------------- |
| `title`            | string       | Drive name                                                |
| `description`      | string       | Optional                                                  |
| `driveType`        | string       | `volunteering`, `camp_willingness`, `firing_selection`, `other` |
| `customDriveType`  | string       | Populated if `driveType` is `other`                       |
| `targetDivisions`  | string[]     | `["SD"]`, `["SW"]`, or `["SD", "SW"]`                     |
| `targetNccYear`    | string       | `1st Year`, `2nd Year`, or `3rd Year`                     |
| `date`             | string       | Actual event date                                         |
| `location`         | string       | Optional                                                  |
| `capacity`         | number       | Optional                                                  |
| `deadline`         | string (ISO) | Required — response deadline                              |
| `status`           | string       | `open`, `closed`                                          |
| `createdBy`        | string       | Admin UID                                                 |
| `createdAt`        | string (ISO) |                                                           |
| `updatedAt`        | string (ISO) |                                                           |
| `stats`            | map          | `{ optedIn: number, optedOut: number, noResponse: number }` |

**Subcollection**: `eventDrives/{driveId}/responses/{cadetUid}` — individual cadet responses.

| Field         | Type         | Notes                        |
| ------------- | ------------ | ---------------------------- |
| `cadetUid`    | string       | User UID                     |
| `cadetName`   | string       | Denormalized for display     |
| `division`    | string       | `SD` or `SW`                 |
| `nccYear`     | string       | Cadet's NCC year             |
| `response`    | string       | `opted_in`, `opted_out`      |
| `reason`      | string       | Optional — opt-out reason    |
| `respondedAt` | string (ISO) |                              |

---

### `achievements/{achievementId}`

**Purpose**: Cadet achievement records.
**Security**: Authenticated read. Admin/superadmin write.

---

### `notifications/{notificationId}`

**Purpose**: System notifications.
**Security**: Authenticated read. Admin/superadmin write.

---

### `reports/{reportId}` + `reportTemplates/{templateId}`

**Purpose**: Saved reports and report templates.
**Security**: Admin/superadmin only.

---

### `paradeLogs/{logId}`

**Purpose**: Parade attendance logs.
**Security**: Authenticated read. Admin/superadmin write.

---

### `divisions/{divisionId}`

**Purpose**: Division definitions (future use).
**Security**: Authenticated read. Superadmin write only.

---

### `auditLogs/{logId}`

**Purpose**: Immutable audit trail.
**Security**: Superadmin read. Admin/superadmin create. **No updates or deletes allowed.**

---

### `pendingAuthDeletions/{uid}`

**Purpose**: Queue for Firebase Auth account deletions, processed by `scripts/auth-cleanup.mjs`.
**Security**: Admin/superadmin create/read/delete. **No updates allowed.**

---

### `rollbackSnapshots/{snapshotId}`

**Purpose**: Immutable snapshots created during year rollover for disaster recovery.
**Security**: Admin/superadmin read/create. **No updates or deletes allowed.**

---

### `cloudinary_cleanup/{docId}`

**Purpose**: Queue for Cloudinary asset cleanup, processed by `scripts/cloudinary-cleanup.mjs`.
**Security**: Authenticated create. Admin/superadmin full access.

---

## Composite Indexes

Defined in `firestore.indexes.json`:

1. **`attendanceSessions`**: `divisionId` ASC → `nccYear` ASC → `date` DESC
2. **`alumniProfiles`**: `status` ASC → `visible` ASC → `createdAt` DESC

---

## External Storage

### Cloudinary

Profile photos are stored in Cloudinary (not Firebase Storage) under organized folder paths:

- Cadets: `ncc_assets/profiles/cadets/{tenure}/{division}/`
- Alumni: `ncc_assets/profiles/cadets/{tenure}/{division}/`
- ANOs: `ncc_assets/profiles/ano/`

### Firebase Storage

Rules exist for gallery photos, cadet profiles, documents, events, and achievements, but primary photo storage uses Cloudinary.
