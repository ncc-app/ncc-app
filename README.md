# NCC Army Wing Website

React + TypeScript + Vite application for NCC unit operations, including authentication, attendance, announcements, reports, and role-based dashboard flows.

## Tech Stack

- React 18 + TypeScript
- Vite 7.x
- React Router v6
- Firebase (Auth + Firestore + Storage)
- React Bootstrap + Bootstrap Icons
- Cloudinary (profile photo uploads)
- EmailJS (email notifications)
- jsPDF + html2canvas (PDF report generation)

## Quick Start

1. Install dependencies

```bash
npm install
```

2. Create environment file

```bash
copy .env.example .env
```

3. Add your Firebase, Cloudinary, and EmailJS values in `.env`

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
VITE_CLOUDINARY_CLOUD_NAME=
VITE_CLOUDINARY_UPLOAD_PRESET=
VITE_EMAILJS_SERVICE_ID=
VITE_EMAILJS_TEMPLATE_ID=
VITE_EMAILJS_PUBLIC_KEY=
```

4. Run dev server

```bash
npm run dev
```

## Scripts

```bash
npm run dev         # Start Vite dev server
npm run build       # Production build
npm run lint        # ESLint
npx tsc --noEmit    # TypeScript type check
```

## Deployment

```bash
npm run build
npx firebase deploy
```

See `docs/DEPLOYMENT.md` for full deployment guide.

## Project Structure

```text
ncc-app/
├── AGENTS.md                    # AI agent operating manual
├── README.md                    # This file
├── docs/                        # Project documentation
│   ├── PRODUCT.md               # NCC domain context
│   ├── DATA_MODEL.md            # Firestore collections reference
│   ├── DOMAIN_RULES.md          # NCC business rules
│   ├── SECURITY.md              # Security model
│   ├── TESTING.md               # Testing strategy
│   ├── DEPLOYMENT.md            # Deployment guide
│   ├── ENVIRONMENTS.md          # Environment architecture
│   └── DECISIONS.md             # Architecture decisions
├── .agents/                     # AI agent customizations
│   ├── rules/                   # Project rules for agents
│   └── skills/                  # Agent skill guides
├── .github/workflows/           # GitHub Actions
│   ├── ci.yml                   # CI pipeline (lint, typecheck, build)
│   ├── cloudinary-cleanup.yml   # Nightly photo cleanup
│   ├── year-rollover.yml        # Annual cadet promotion
│   ├── auth-cleanup.yml         # Auth account deletion
│   └── sync-verifications.yml   # Email verification sync
├── scripts/                     # Node.js automation scripts
├── firebase.json                # Firebase configuration + emulators
├── firestore.rules              # Firestore security rules
├── firestore.indexes.json       # Firestore composite indexes
├── storage.rules                # Firebase Storage security rules
└── src/
    ├── app/                     # App composition (main.tsx, providers, routes)
    ├── pages/                   # Route-level screens (public, auth, dashboard)
    ├── features/                # Domain logic (auth, attendance, reports, cms, announcements, alumni)
    ├── components/              # Reusable UI (common, layout, forms)
    ├── shared/                  # Config, utilities, types, styles
    └── index.css                # Global styles
```

## Notes

- Routing is composed from route fragments in `src/app/routes/` and mounted in `src/app/routes/index.tsx`.
- `src/pages/*` contains route screens.
- `src/features/*` contains feature/domain logic and services.
- Styles are colocated with corresponding TSX files.
- Automation scripts in `scripts/` use `firebase-admin` and run via GitHub Actions.
