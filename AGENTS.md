# AGENTS.md — Project-Wide AI Development Rules

## Purpose

This is the project-wide operating guide for AI coding agents and human developers working on the **NCC Army Wing** application — a React + TypeScript + Firebase web app for managing NCC unit operations at TCE.

## Before Making Changes

1. Inspect the repository and existing implementation.
2. Read `docs/` documentation relevant to your task.
3. Read `docs/DATA_MODEL.md` before touching Firestore collections or security rules.
4. Read `docs/DOMAIN_RULES.md` before changing business logic (attendance, rollover, registration, ranks).
5. Read `docs/SECURITY.md` before changing authentication, authorization, or Firestore/Storage rules.
6. Read `docs/ENVIRONMENTS.md` before changing environment configuration or Firebase settings.
7. Determine whether the requested feature already partially exists.
8. Preserve working behavior unless explicitly asked to change it.

## Architecture Rules

- **Frontend**: React 18 + TypeScript + Vite. Path alias `@/` maps to `src/`.
- **UI framework**: React Bootstrap + Bootstrap 5 + Bootstrap Icons. Do not introduce Tailwind or other CSS frameworks.
- **Backend**: Serverless Firebase only. No custom backend server.
- **Database**: Cloud Firestore. Security rules live in `firestore.rules`.
- **Auth**: Firebase Auth (email/password + Google sign-in). Auth logic lives in `src/features/auth/`.
- **File uploads**: Cloudinary (unsigned upload presets) for profile photos. Firebase Storage rules exist for gallery/documents.
- **Reports**: jsPDF + html2canvas for PDF generation. Report generators live in `src/pages/dashboard/reports/`.
- **Automation**: Node.js scripts in `scripts/` using `firebase-admin`. Triggered via GitHub Actions.

### Source Code Structure

```
src/
├── app/          # App composition — main.tsx, providers, routes
├── pages/        # Route-level screens (public, auth, dashboard)
├── features/     # Domain/business logic (auth, attendance, reports, cms, announcements, alumni)
├── components/   # Reusable UI components (common, layout, forms)
├── shared/       # Config, utilities, types, styles, lib
└── index.css     # Global styles
```

### Routing

- Routes are composed in `src/app/routes/` — `publicRoutes.tsx` and `protectedRoutes.tsx`.
- Protected routes use `<ProtectedRoute requiredRoles={[...]}>` for role-based access.

### Roles

| Role         | Access Level                                                   |
| ------------ | -------------------------------------------------------------- |
| `visitor`    | Public pages only (no auth)                                    |
| `member`     | Dashboard, attendance view, profile                            |
| `admin`      | All management features                                        |
| `superadmin` | Admin + alumni management, audit logs, settings, user deletion |
| `alumni`     | Dashboard with limited admin-level access                      |

## Core Rules

- Treat the repository as the source of truth — not documentation or prior agent conversations.
- Do not rewrite working code unnecessarily.
- Do not add npm dependencies without explicit justification.
- Do not weaken Firestore security rules or Storage rules.
- Never commit secrets, credentials, or service account keys.
- Never use production data for automated tests.
- Use production Firebase for local testing with extreme caution. See `docs/ENVIRONMENTS.md`.
- Run `npm run lint`, `npx tsc --noEmit`, and `npm run build` before claiming completion.
- Never claim a command passed unless it was actually run.
- Do not commit or push unless explicitly requested.
- Keep changes focused and reviewable.
- Distinguish **IMPLEMENTED** from **PLANNED** functionality in documentation.
- Update documentation when important architectural decisions change.

## Firebase-Specific Rules

- All Firestore reads/writes go through the client SDK (`firebase/firestore`).
- Security enforcement happens in `firestore.rules` — frontend checks are NOT the security boundary.
- Admin-only operations that need `firebase-admin` (e.g., deleting Auth accounts) are handled by scripts in `scripts/` triggered via GitHub Actions.
- The `settings/github` Firestore document stores a GitHub PAT for triggering workflows from the frontend. Handle with care.
- Composite indexes are defined in `firestore.indexes.json` — update this file when adding queries that require new indexes.

## Testing

- See `docs/TESTING.md` for full testing strategy.
- Local development: Connects directly to production Firebase (with caution).
- CI: Lint → Type-check → Build.
- Never connect automated tests to production Firebase.

## Documentation Responsibilities

| File                   | Scope                                             |
| ---------------------- | ------------------------------------------------- |
| `README.md`            | Quick start, tech stack, project structure        |
| `AGENTS.md`            | This file — operating rules for agents/developers |
| `docs/PRODUCT.md`      | Product requirements, NCC domain context          |
| `docs/DATA_MODEL.md`   | Firestore collections, fields, relationships      |
| `docs/DOMAIN_RULES.md` | NCC business/domain rules                         |
| `docs/SECURITY.md`     | Security model, Firestore rules, secrets          |
| `docs/TESTING.md`      | Testing strategy, commands, test data             |
| `docs/DEPLOYMENT.md`   | Firebase deployment, GitHub Actions automation    |
| `docs/ENVIRONMENTS.md` | Environment architecture, emulator setup          |
| `docs/DECISIONS.md`    | Architecture decision log                         |

Do not create duplicate sources of truth. One document per topic.

## Scope

Do not start unplanned features unless explicitly instructed. Infrastructure and documentation changes should be reviewed before merging.
