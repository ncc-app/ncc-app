# Testing Strategy — NCC Army Wing

## Current Status

| Layer                  | Status             | Tool                            |
| ---------------------- | ------------------ | ------------------------------- |
| Linting                | ✅ Available       | ESLint (`npm run lint`)         |
| Type checking          | ✅ Available       | TypeScript (`npx tsc --noEmit`) |
| Unit tests             | ❌ Not implemented | —                               |
| Component tests        | ❌ Not implemented | —                               |
| Integration tests      | ❌ Not implemented | —                               |
| Firestore rules tests  | ❌ Not implemented | —                               |
| E2E tests              | ❌ Not implemented | —                               |
| CI pipeline            | ✅ Implemented     | GitHub Actions (`ci.yml`)       |
| Production smoke tests | ❌ Not documented  | —                               |

## Static Checks

### Lint

```bash
npm run lint
```

Uses ESLint with TypeScript, React, and React Hooks plugins. Configured to report unused disable directives and fail on any warnings.

### Type Check

```bash
npx tsc --noEmit
```

Uses strict mode. Known existing type errors exist in `AdminSettings.tsx` (leftover rollover code) and `AuthContext.tsx` (missing `writeBatch` import).

### Build Verification

```bash
npm run build
```

Vite production build. Must succeed before deployment.

## Local Testing

### Local Development
Local development should be done by connecting to the production database carefully. **There is no local emulator setup.**

**Setup:**

```bash
npm run dev
```

> [!WARNING]
> Because you are connected to the live database, any data you save, modify, or delete while testing locally **will happen in real life** and affect actual users. Test locally with extreme caution.

### Test Data

- Use deterministic fake users and data for testing.
- Never use real personal information in automated tests.
- Never use production data for testing.
- Sample data patterns can be found in `ncc_sample_data/` (gitignored).

## CI Testing

The CI pipeline (`.github/workflows/ci.yml`) runs on every push and pull request:

1. **Install** — `npm ci`
2. **Lint** — `npm run lint`
3. **Type check** — `npx tsc --noEmit`
4. **Build** — `npm run build`

CI does not run integration tests or Firestore rules tests. It validates code quality and build integrity.

CI must **never** use production Firebase credentials.

## Recommended Future Testing

### Priority 1: Firestore Security Rules Tests

Test the `firestore.rules` file using `@firebase/rules-unit-testing`:

- Verify role-based access for each collection.
- Verify immutable collections cannot be updated/deleted.
- Verify file type/size validation in Storage rules.
- Verify unauthenticated access patterns.

### Priority 2: Unit Tests for Business Logic

Test critical utility functions:

- `normalizeAcademicYear()` / `normalizeNccYear()`
- `calculateTenure()`
- `sanitizeName()`
- Password policy validation
- Date/time utilities

### Priority 3: Component Tests

Test critical UI components:

- `ProtectedRoute` — role-based rendering
- `AuthProvider` — auth state management
- Report generators — data formatting

### Recommended Frameworks

- **Vitest** — native Vite integration, fast, TypeScript-first
- **React Testing Library** — component testing
- **@firebase/rules-unit-testing** — Firestore rules testing

## Production Smoke Tests

After deployment, manually verify:

1. ✅ Application loads at `https://ncc-app-200cdt.web.app`
2. ✅ Login works (email/password and Google)
3. ✅ Dashboard loads for authenticated users
4. ✅ Public pages render CMS content
5. ✅ Attendance session creation works
6. ✅ Report PDF generation works

Do **not** run destructive automated tests against production.

## Completion Rule

An agent must report the **exact commands run** and their results. Never claim tests passed without actually executing them.
