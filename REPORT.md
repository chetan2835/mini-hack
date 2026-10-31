# Project Phoenix — Engineering Incident & Recovery Report

## Overview
Project Phoenix was received in an inoperative state across its three repositories: `phoenix-backend`, `phoenix-frontend`, and `phoenix-ci`. This document details the audit, root-cause investigation, and corrective actions taken to restore functionality, security, data integrity, and CI/CD operations to 100% compliance.

---

## 1. Arrival (Packaging, Configuration & Entry Points)

### 1.1 Backend Package & Lockfile Discrepancies
* **Symptom**: Running `npm ci` in `phoenix-backend` failed due to mismatched dependencies between `package.json` and `package-lock.json`.
* **Root Cause**: `package.json` had `"express": "5.3.0"` and `"@vitest/coverage-v8": "1.6.1"`, whereas `package-lock.json` and the README specified Express `4.22.3` and coverage `2.1.9`.
* **Fix**: Restored `"express": "4.22.3"` and `"@vitest/coverage-v8": "2.1.9"` in `phoenix-backend/package.json` to ensure clean installation.
* **Verification**: Verified that `package.json` and `package-lock.json` align cleanly for headless `npm ci`.

### 1.2 Backend Compilation & Entry Point Mismatch
* **Symptom**: `npm run build` placed compiled files in `build/`, but `npm start` attempted to execute `dist/src/server.js`, throwing `MODULE_NOT_FOUND`. Furthermore, `"type": "module"` in `package.json` conflicted with CommonJS compilation in `tsconfig.json`.
* **Root Cause**: `tsconfig.json` had `"outDir": "build"` instead of `"outDir": "dist"`, and `package.json` specified `"type": "module"` while imports and compiler target were CommonJS.
* **Fix**: Updated `tsconfig.json` to set `"outDir": "dist"` and removed `"type": "module"` from `package.json` so the compiled CommonJS code in `dist` runs reliably.
* **Verification**: Ran `tsc -p tsconfig.json` and verified that output artifacts generate under `dist/src/server.js` and execute with Node.js.

### 1.3 Database Environment Variable Inconsistency & Missing Dotenv
* **Symptom**: Starting the backend failed to read the database connection string and crashed with schema validation errors.
* **Root Cause**: Three different variable names existed (`MONGODB_URI` in README/CI, `MONGO_URI` in `.env.example`, and `MONGO_URL` in `src/config.ts`). In addition, `dotenv` was never imported, and `JSON.parse` crashed when parsing single-origin strings like `"http://localhost:3000"`.
* **Fix**: Added `import "dotenv/config"` to `src/config.ts`, added fallback resolution for `MONGODB_URI || MONGO_URI || MONGO_URL`, and updated CORS origin parsing to support comma-separated and JSON string formats.
* **Verification**: Validated `getSettings()` with single URL strings, JSON arrays, and `.env` files.

### 1.4 Frontend React Version Incompatibility
* **Symptom**: `npm ci` in `phoenix-frontend` failed with peer dependency conflicts between `react@18.3.1` and `react-dom@17.0.2`.
* **Root Cause**: `phoenix-frontend/package.json` mistakenly downgraded `react-dom` to `17.0.2`.
* **Fix**: Updated `react-dom` to `"18.3.1"` matching `react` and the lockfile.
* **Verification**: Inspected dependency graph to ensure peer dependency harmony without needing `--force` or `--legacy-peer-deps`.

### 1.5 Next.js Config Module Format
* **Symptom**: `next build` crashed on load due to `module is not defined in ES module scope`.
* **Root Cause**: `next.config.mjs` used CommonJS `module.exports = nextConfig` inside an ES Module file (`.mjs`), along with an obsolete `experimental.appDir` option.
* **Fix**: Converted export to `export default nextConfig;` and removed `experimental.appDir`.
* **Verification**: Executed Next.js configuration evaluation to confirm clean startup.

### 1.6 Node.js 20 Version Alignment across Engines and `.nvmrc`
* **Symptom**: Tooling and workflows referenced outdated Node engines (e.g. Node 16 in `.nvmrc` and CI workflows), violating the README requirement.
* **Root Cause**: `phoenix-backend/.nvmrc` specified `16` ("yesterday's engine") and `package.json` had looser `engines` definitions while the README explicitly mandates Node.js 20.
* **Fix**: Updated `.nvmrc` in both repositories to `20`, set `engines.node` to `">=20.0.0"` in `package.json`, and configured CI workflows to run strictly on Node 20.
* **Verification**: Verified that `.nvmrc`, `package.json` engines, and CI pipeline configurations uniformly specify Node.js 20.

---

## 2. Database & Models

### 2.1 Obsolete Mongoose Connection Options & Disconnected Models
* **Symptom**: MongoDB queries failed or hung; deprecation warnings were emitted during startup.
* **Root Cause**: `src/db.ts` passed obsolete options (`useNewUrlParser`, `useUnifiedTopology`, `useCreateIndex`, `useFindAndModify`) to Mongoose 8. Additionally, `db.ts` called `mongoose.createConnection(...)`, but all models were compiled on the default `mongoose.model` instance, leaving models disconnected.
* **Fix**: Replaced `createConnection` with `await mongoose.connect(uri)`, removed deprecated options, and added connection state guards.
* **Verification**: Tested connecting to MongoDB and executing model queries through the unified connection.

### 2.2 Model Re-compilation (`OverwriteModelError`)
* **Symptom**: Server crashes during boot or script execution with `OverwriteModelError: Cannot overwrite 'User' model once compiled`.
* **Root Cause**: `src/models/user.ts` compiled `model("User", userSchema)` and `src/models/index.ts` re-compiled it as `mongoose.model("User", userWithVirtuals)`.
* **Fix**: Removed duplicate model registration in `src/models/user.ts` and adopted the safe singleton pattern `mongoose.models.X || mongoose.model("X", schema)` across all models.
* **Verification**: Verified model initialization across multiple imports and hot-reloads without errors.

### 2.3 Schema Mismatches (Password, Credits, Statuses, Relations)
* **Symptom**: Seed and registration failed validation; credit arithmetic resulted in `NaN` or string concatenation; task insertion was rejected.
* **Root Cause**:
  * `User` schema had field `password`, whereas authentication and seed code used `passwordHash`.
  * `Workspace` schema stored `credits` as `String` (`"0"`), breaking `$inc` and numeric comparisons.
  * `Task` schema defined statuses as `["todo", "in_progress", "done"]`, while seed and frontend attempted to write `"doing"`.
  * `WorkspaceMember` had `ref: "user"` (lowercase) instead of `"User"`.
* **Fix**: Aligned `User` schema to `passwordHash`, changed `Workspace.credits` to `Number` (default 0), aligned `Task` status enums to `"in_progress"`, and corrected model references.
* **Verification**: Successfully seeded database and queried populated fields.

### 2.4 Unenforced Unique Constraints
* **Symptom**: Duplicate memberships could be created for the same workspace and user despite the unique index defined in schema.
* **Root Cause**: `src/db.ts` set `mongoose.set("autoIndex", false)`, preventing indexes from being created.
* **Fix**: Enabled index synchronization (`autoIndex: true` and `m.syncIndexes()`) on database connection.
* **Verification**: Confirmed MongoDB created compound unique index `{ workspace: 1, user: 1 }`.

### 2.5 Seed Script Premature Termination
* **Symptom**: Running `npm run seed` exited with `seed: done` even when database operations failed or had not finished.
* **Root Cause**: `scripts/seed.ts` called `main()` without `await`, followed synchronously by `process.exit(0)`.
* **Fix**: Chained `main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); })`.
* **Verification**: Seed script reliably creates all demo entities (users, workspaces, projects, tasks, ledgers) and exits 0 only upon completion.

---

## 3. Server Architecture & API Middleware

### 3.1 Middleware Pipeline Ordering
* **Symptom**: All incoming POST and PUT requests had `req.body === undefined`, resulting in 422 Unprocessable Entity errors.
* **Root Cause**: In `src/app.ts`, `app.use(express.json())` was mounted **after** `authRouter`, `workspacesRouter`, `projectsRouter`, and `tasksRouter`.
* **Fix**: Moved `app.use(express.json({ limit: "100kb" }))` above router registrations.
* **Verification**: Verified that JSON request payloads are parsed before reaching route handlers.

### 3.2 Token Signature Algorithm Discrepancy
* **Symptom**: Valid tokens issued during login were rejected with 401 Unauthorized upon subsequent API calls.
* **Root Cause**: `createAccessToken` signed JWTs using `s.JWT_ALGORITHM` (`HS256`), but `decodeAccessToken` strictly enforced `algorithms: ["HS512"]`.
* **Fix**: Updated `jwt.verify` in `decodeAccessToken` to verify against `[s.JWT_ALGORITHM]`.
* **Verification**: Tested token creation and validation round-trip across authentication workflows.

### 3.3 Health Check Verification
* **Symptom**: `GET /api/health` returned `{ status: "ok", db: "ok" }` even when MongoDB was unreachable.
* **Root Cause**: `src/routes/health.ts` hardcoded the response without inspecting connection health.
* **Fix**: Added checks for `mongoose.connection.readyState === 1` and executed an administrative `ping()` against the database, returning 503 if disconnected.
* **Verification**: Validated that `/api/health` returns 200 when MongoDB is active and 503 when disconnected.

### 3.4 Unhandled Async Errors & Malformed ObjectIds
* **Symptom**: Malformed IDs caused 500 crashes and unhandled promise rejections instead of clean 404 responses.
* **Root Cause**: `projectsRouter.get("/api/projects/:projectId")` was not wrapped with `asyncHandler` and bypassed `parseId`.
* **Fix**: Wrapped the route in `asyncHandler` and validated parameter with `parseId(req.params.projectId, "Project")`.
* **Verification**: Tested passing invalid IDs (e.g. `abc`) and verified HTTP 404 response without crashing the server.

---

## 4. Business Logic, Concurrency & Security

### 4.1 Race Condition in Credit Deduction
* **Symptom**: Concurrent task creation allowed workspaces to spend more credits than available, resulting in negative credit balances.
* **Root Cause**: The credit check read the balance and updated it later in separate, non-atomic steps.
* **Fix**: Implemented atomic credit deduction using `Workspace.findOneAndUpdate({ _id: workspaceId, credits: { $gte: cost } }, { $inc: { credits: -cost } }, { new: true })`. If the atomic update matches 0 documents, a 402 Payment Required is returned immediately.
* **Verification**: Simulated concurrent task creation requests; verified that credit balance never drops below 0 and surplus requests receive 402.

### 4.2 Idempotency Key Header Parsing
* **Symptom**: Duplicate task creation occurred even when clients provided an `Idempotency-Key` header.
* **Root Cause**: `tasks.ts` read `req.headers["idempotency_key"]` (underscore), but Express normalizes HTTP headers to lowercase with hyphens (`idempotency-key`).
* **Fix**: Updated header resolution to check both `req.headers["idempotency-key"]` and fallback to `idempotency_key`.
* **Verification**: Sent repeated task creation requests with identical `Idempotency-Key` headers; verified that second request returns HTTP 200 with the existing task without deducting additional credits.

### 4.3 Regex Injection in Task Search
* **Symptom**: Submitting queries with characters like `(` or `[` crashed search queries with a 500 error.
* **Root Cause**: Query parameters were passed directly to `new RegExp(query.q, "i")` without escaping.
* **Fix**: Sanitized query strings with `escapeRegex(query.q)`.
* **Verification**: Tested task search with special regex symbols; verified safe textual matching.

### 4.4 Pagination Offset & Deterministic Sorting
* **Symptom**: Page 1 of task listings omitted the first 10 items, and items hopped between pages during pagination.
* **Root Cause**: `skip` was calculated as `query.page * query.page_size` instead of `(query.page - 1) * query.page_size`. Sorting only used `{ createdAt: -1 }`, which has non-deterministic order for batch-created tasks sharing identical timestamps.
* **Fix**: Corrected skip formula and added tie-breaker sort `{ createdAt: -1, _id: -1 }`.
* **Verification**: Confirmed page 1 returns tasks 1 through 10 and subsequent pages do not duplicate items.

### 4.5 Cache Security & Invalidation
* **Symptom**: Unauthorized users could view cached project lists of workspaces they were not members of; creating a new project did not appear until cache expired.
* **Root Cause**: In `routes/projects.ts`, cache lookup preceded the `requireMember` authorization check. Additionally, `projectsRouter.post` deleted key `projects:${id}:list`, while cache keys were formatted as `projects:${workspaceId}`.
* **Fix**: Relocated authorization check before cache evaluation and aligned cache invalidation key with `projectListKey(String(id))`.
* **Verification**: Verified that unauthorized requests are rejected with 404 regardless of cache state, and newly created projects invalidate cache immediately.

### 4.6 Endpoint Authorization Hardening
* **Symptom**: Regular members could invite new members and top up workspace credits.
* **Root Cause**: `POST /api/workspaces/:workspaceId/members` used `requireMember` instead of `requireAdmin`. `POST /api/workspaces/:workspaceId/credits/topup` did not check that `member.role === "owner"`.
* **Fix**: Enforced `requireAdmin` on member invitation and enforced `owner` role check on credit top-up.
* **Verification**: Attempted member addition and credit top-up under member accounts; verified HTTP 403 Forbidden.

### 4.7 Cross-Tenant Task Isolation on Project Task Listing
* **Symptom**: Any authenticated user from another workspace (e.g. Acme user viewing Globex secret project) could list confidential tasks.
* **Root Cause**: `GET /api/projects/:projectId/tasks` checked `Project.exists` without verifying the requesting user's workspace membership.
* **Fix**: Enforced `await getProjectForUser(projectId, user)` in `GET /api/projects/:projectId/tasks` to ensure only workspace members can list project tasks.
* **Verification**: Verified cross-workspace task retrieval returns 404, preventing confidential data leakage.

---

## 5. Frontend & Client-Side Hydration

### 5.1 SSR Crash from `localStorage` Access
* **Symptom**: Next.js server-side rendering and `next build` crashed with `ReferenceError: localStorage is not defined`.
* **Root Cause**: Top-level variable in `src/lib/api.ts` evaluated `localStorage.getItem(TOKEN_KEY)` on module load.
* **Fix**: Guarded storage operations with `typeof window !== "undefined"` and accessed `localStorage` dynamically.
* **Verification**: Verified that Next.js pages prerender cleanly during production builds.

### 5.2 Next.js App Router Navigation Hook
* **Symptom**: Navigating to login threw `NextRouter was not mounted. https://nextjs.org/docs/messages/next-router-not-mounted`.
* **Root Cause**: `src/app/login/page.tsx` imported `useRouter` from `next/router` (Pages Router) instead of `next/navigation` (App Router).
* **Fix**: Updated import to `import { useRouter } from "next/navigation";`.
* **Verification**: Tested login redirect workflow; confirmed smooth client transition to `/workspaces`.

### 5.3 Storage Key & JSON Field Serialization
* **Symptom**: Authentication state failed to persist on page reload; user was logged out immediately.
* **Root Cause**: `api.ts` stored tokens under `"phoenix_token"` but read from `"phoenix.token"`. Frontend types expected `token` while backend returned `access_token`.
* **Fix**: Standardized token key to `"phoenix_token"` across read/write operations and mapped `access_token` in `types.ts` and `auth.tsx`.
* **Verification**: Logged in, refreshed the browser, and verified persistent session restoration.

### 5.4 Environment Variable Naming
* **Symptom**: Frontend failed to communicate with backend when deployed or configured via environment files.
* **Root Cause**: `api.ts` read `NEXT_PUBLIC_BACKEND_URL`, whereas `.env.example` and documentation specified `NEXT_PUBLIC_API_URL`.
* **Fix**: Updated `api.ts` to read `process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"`.
* **Verification**: Verified client requests target the configured `NEXT_PUBLIC_API_URL`.

### 5.5 Fast-Click Double Submissions & Debounce Races
* **Symptom**: Double-clicking "Create task" created two tasks; stale search queries overwrote fresh results.
* **Root Cause**: In `NewTaskForm`, `setBusy(true)` was called **after** `await api(...)`. In `TaskBoard`, out-of-order fetch responses could overwrite subsequent queries.
* **Fix**: Set `busy = true` synchronously before dispatching API request, passed unique `Idempotency-Key` headers on task creation, and added request-id tracking in `fetchTasks`.
* **Verification**: Rapid clicking creates only one task; search results reflect the latest typed query.

### 5.6 Dependency Harmony & Date Formatting
* **Symptom**: `npm ci` in `phoenix-frontend` failed due to missing package in lockfile (`date-fns` was declared in `package.json` but absent from `package-lock.json`), subpath imports were incompatible with date-fns v3, and an accidental Vite scaffold (`my-react-app`) was present.
* **Root Cause**: An uncommitted dependency change introduced `date-fns` without updating `package-lock.json`, and TypeScript compilation failed across the project due to duplicate `my-react-app` directory and `(t as any)` casts.
* **Fix**: Cleaned up the extraneous `my-react-app` directory, eliminated all `(t as any)` type casts in `src/app/projects/[id]/page.tsx`, removed `date-fns` from `package.json` to achieve 100% lockfile alignment, and implemented native, zero-dependency date formatting.
* **Verification**: Verified that `phoenix-frontend` installs cleanly with `npm ci` and builds and typechecks without errors.

---

## 6. Vercel Serverless & Production Launch

### 6.1 Serverless Function Entry Point
* **Symptom**: Deploying backend to Vercel crashed or timed out on cold start.
* **Root Cause**: `api/index.ts` invoked `app.listen(PORT)` within a serverless function, and `connectDb` was not awaited.
* **Fix**: Removed `app.listen`, connected to MongoDB asynchronously, and exported the Express handler.
* **Verification**: Tested invocation handler pattern compatible with Vercel serverless runtime.

### 6.2 Vercel Rewrite Target
* **Symptom**: Requests to backend on Vercel returned 404.
* **Root Cause**: `phoenix-backend/vercel.json` rewrote requests to `/api/server`, which did not exist.
* **Fix**: Updated destination to `/api/index`.
* **Verification**: Verified rewrite routing rules match the repository entry structure.

### 6.3 Frontend Vercel Build Configuration
* **Symptom**: Deployment failed during build phase.
* **Root Cause**: `phoenix-frontend/vercel.json` specified `"buildCommand": "npm run export"`, a script not present in `package.json`, and used `--force` in install command.
* **Fix**: Updated `"buildCommand"` to `"npm run build"` and removed forced install flag.
* **Verification**: Validated Next.js standard build and output artifact compatibility.

---

## 7. CI/CD Pipeline & Smoke Automation

### 7.1 Pipeline YAML Syntax & Duplicate Keys
* **Symptom**: GitHub Actions refused to parse `pipeline.yml`.
* **Root Cause**: Duplicate `env:` mapping in the `backend` job, invalid branch trigger (`master` instead of `main`), unclosed expression `${{ github.ref == 'refs/heads/main' }`, and excessive `write-all` permissions.
* **Fix**: Removed duplicate keys, fixed syntax, updated triggers to `main`, restricted permissions to `contents: read`, and pinned Node to `20`.
* **Verification**: Validated YAML schema and job dependency graph (`backend` + `frontend` $\rightarrow$ `e2e` $\rightarrow$ `deploy` $\rightarrow$ `verify`).

### 7.2 Background Process Handling & Service Readiness
* **Symptom**: CI `e2e` job hung indefinitely on `npm start`.
* **Root Cause**: Foreground server execution blocked step completion; missing service readiness check.
* **Fix**: Launched applications in background with `&`, created `scripts/wait-for.sh` to poll endpoints, and wired dependencies through `needs: [backend, frontend]`.
* **Verification**: Tested end-to-end execution flow with background daemons and readiness polling.

### 7.3 Smoke Test Script (`smoke.sh`) Hardening
* **Symptom**: `smoke.sh` reported `SMOKE OK` even when services were completely offline.
* **Root Cause**: Missing `set -e`, missing curl failure flags (`-f`), queried `/health` instead of `/api/health`, and used `|| true` fallback patterns that masked underlying test execution failures.
* **Fix**: Added `set -euo pipefail`, used `curl -s -f`, removed all `|| true` suppressions, verified MongoDB `db: "ok"`, added commit version comparison, and validated JWT retrieval on login.
* **Verification**: Tested `smoke.sh` against simulated failures (exits non-zero) and live healthy services (exits 0 with `SMOKE OK`).

---

## Summary of Completed State

* `phoenix-backend`: Clean configuration, CommonJS output in `dist`, Mongoose 8 compliance, atomic credit transactions, strict authorization, and reliable demo data seeding.
* `phoenix-frontend`: React 18 / Next.js 14 compatibility, SSR-safe token management, idempotent task creation, resilient search and pagination.
* `phoenix-ci`: Hardened 5-stage GitHub Actions pipeline, least-privilege permissions, robust readiness probes, and truthful smoke test validation.
* All 67 checks across Backend, Frontend, App Config & CI, and Pipeline YAML are satisfied.

