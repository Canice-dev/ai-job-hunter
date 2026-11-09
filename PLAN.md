# Implementation Plan

## Goal

Build a personal job-hunting assistant with a Next.js dashboard and Telegram bot. It searches jobs only when requested, filters and scores technology roles, prepares truthful CVs and cover letters, and leaves application submission to the user.

## Decisions already made

- One personal account; dashboard sign-in uses email and password.
- Web dashboard and Telegram bot are both review surfaces.
- Search is on demand through `/site` and `/remote`; no scheduled searches in v1.
- `/site` covers on-site jobs in Abuja, Lagos, Port Harcourt, Enugu, and Benue State.
- `/remote` covers jobs open to applicants based in Nigeria.
- LinkedIn and Upwork are priority sources, accessed only through permitted means. Do not scrape either site. Request an approved Upwork API key; use manual job import when permitted programmatic access is unavailable.
- An orchestrator runs three separate stages: Scout, Job Reader, and CV Adapter.
- Score job fit from 1.0 to 5.0 in tenths. Show every scored job, including scores below 4, and include a warning if scoring or tailoring is uncertain.
- Accept and produce PDF and DOCX. Preserve the uploaded layout as closely as practical.
- Keep the original CV unchanged. Tailored CVs and cover letters may reorder sections and rewrite wording using only confirmed facts; never add experience, skills, employers, or dates.
- Show the job link and prepared materials. The user submits applications on LinkedIn or Upwork.
- Track jobs as new, saved, dismissed, or applied. Allow deletion of uploaded and generated CV files.
- Preferred stack: Python for AI and backend, Next.js for web, Neon for PostgreSQL.

## Delivery phases

### 0. Resolve implementation choices

- Confirm the AI provider, private file-storage provider, hosting provider, and background queue/worker deployment.
- Confirm the first account provisioning flow and secure Telegram linking flow.
- Apply for Upwork API access and verify the approved API scope supports the intended discovery use. Identify permitted LinkedIn access; do not build a scraper.
- Confirm how external AI processing handles CV data, retention, and cost.

**Exit criteria:** providers, API access strategy, privacy handling, and fallback behavior are documented before credentials or user CV data are introduced.

### 1. Establish the application foundation

- Create a monorepo with a Next.js web app, Python API/worker service, and shared API contract documentation.
- Configure local development, environment-based secrets, database migrations, and separate development/production configuration.
- Set up Neon PostgreSQL and private object storage; keep CV files out of public buckets and database rows.
- Implement the single-owner email/password account and protected dashboard routes.

**Exit criteria:** the owner can sign in, reach a protected empty dashboard, and the API can connect to the database and private file storage.

### 2. CV onboarding and profile confirmation

- Upload PDF or DOCX CVs with file type and size validation.
- Extract text and structured facts; retain the original file as the source of truth.
- Present extracted roles, skills, dates, location/work eligibility, and preferences as an editable draft.
- Require confirmation before using profile facts for matching or generating application materials.
- Provide deletion of the original and all derived files.

**Exit criteria:** a user can upload, review, correct, confirm, and delete a CV and extracted profile.

### 3. Job intake and search

- Implement job records, source attribution, duplicate detection, search runs, and manual URL/description import.
- Add LinkedIn access only through an approved/permitted interface and only within that interface's scope.
- Add Upwork access only after API authorization and scope verification.
- Provide manual import fallback from both dashboard and Telegram when a source cannot be accessed programmatically.
- Implement `/site` and `/remote` as on-demand search commands. Persist each run and report progress, partial results, and failures.

**Exit criteria:** a source listing can be ingested once, attributed to its source, and shown with a working source link; the user can manually import a listing when API access is absent.

### 4. Scoring, filtering, and application materials

- Implement the technology-role filter and a transparent 1.0–5.0 match score in tenths, with concise reasons and gaps.
- Show all scored jobs regardless of rating; preserve uncertainty warnings.
- Tailor a separate CV and cover letter using only confirmed profile facts and the job description.
- Produce DOCX and PDF outputs; retain the original CV and preserve its layout where feasible.
- On parsing or generation failure, retain the job with a warning and clearly indicate which material is unavailable.

**Exit criteria:** every scored job has a score explanation, warning state when applicable, truthful reviewable documents, and no automatic application submission.

### 5. Dashboard and Telegram review

- Build dashboard views for search runs, all scored jobs, job details, match reasons, warnings, and document preview/download.
- Add save, dismiss, and applied status actions and prevent the same source job from repeatedly appearing as new.
- Link Telegram securely to the owner account.
- Support search commands, manual job import, match review, status actions, and links/files in the bot.
- Provide recoverable states for empty searches, inaccessible listings, timeouts, and partial stage failures.

**Exit criteria:** the owner can complete the search-to-review flow from either surface, then open the source listing and apply manually.

### 6. Production readiness

- Deploy the web application, API, and worker online with HTTPS and managed secrets.
- Add operational logs and alerts for failed search runs, file processing, AI calls, and bot/API availability; do not log CV contents or credentials.
- Configure backups, retention/deletion behavior, rate limits, and a documented recovery process.
- Review accessibility, security, privacy, and platform API terms before launch.

**Exit criteria:** a production deployment is usable by the owner, failures are visible, and stored CV data can be deleted.

## Initial acceptance criteria

- Only the owner can access the dashboard and stored CVs.
- No automated scraping or application submission occurs.
- `/site` and `/remote` use the agreed Nigerian locations and eligibility.
- Every scored job remains visible with its 1.0–5.0 rating, including scores below 4; uncertain results remain visible with warnings.
- All tailored claims trace back to confirmed CV facts; original CV files are never overwritten.
- Jobs can be reviewed in the dashboard and Telegram and marked saved, dismissed, or applied.
- Search and generation failures do not silently discard run status or misrepresent a job as fully processed.

## Open decisions and risks

- LinkedIn permitted discovery coverage and Upwork API approval/scope may limit automated search; manual import is the agreed fallback.
- AI model/provider, AI data retention, monthly cost ceiling, object storage, hosting, and queue technology are not chosen.
- Exact scoring rubric and CV layout fidelity need validation against real sample listings and CV files.
- Search rate limits, retry policies, and supported file-size limits must follow the selected providers.

## Version references checked 2026-11-07

- Proposed baseline: Python 3.14.10, FastAPI 0.162.0, Next.js 16.4.x / App Router, Node.js 20.9 or newer, Neon PostgreSQL 18. Pin exact patch versions and recheck provider compatibility when implementation starts.
- [Python 3.14.10](https://www.python.org/downloads/release/python-31410/)
- [FastAPI release notes](https://fastapi.tiangolo.com/release-notes/)
- [Next.js release log](https://nextjs.org/blog) and [support policy](https://nextjs.org/support-policy)
- [Neon supported Postgres versions](https://api-docs.neon.tech/reference/createproject)
